# realtime.py — FIXED VERSION

import asyncio
import json
import httpx
from typing import Set, Optional, Any
from logger import log_bar, log_session

# ── BITGET GRANULARITY MAPPING (CORRECT FORMAT) ───────────────────────────────
# Bitget API v2 expects: 1min, 3min, 5min, 15min, 30min, 1h, 2h, 4h, 6h, 12h, 1d, 3d, 1w
GRAN_MAP = {
    "1m":  ("1min",  60),
    "3m":  ("3min",  180),
    "5m":  ("5min",  300),      # FIXED: was '5min' - correct format
    "15m": ("15min", 900),
    "30m": ("30min", 1800),
    "1h":  ("1H",    3600),
    "2h":  ("2H",    7200),
    "4h":  ("4H",    14400),
    "1d":  ("1D",    86400),
}


class LiveFeed:
    def __init__(self):
        self.clients: Set[Any] = set()
        self.running: bool = False
        self.symbol: str = "EURUSDT"
        self.granularity: str = "5m"
        self.api_key: str = ""
        self.pipeline: Any = None
        self.last_ts: int = 0
        self.task: Optional[asyncio.Task] = None

    def add_client(self, ws):
        self.clients.add(ws)
        print(f"[LIVE] Client added, total: {len(self.clients)}")

    def remove_client(self, ws):
        self.clients.discard(ws)
        print(f"[LIVE] Client removed, total: {len(self.clients)}")

    async def broadcast(self, msg: dict):
        if not self.clients:
            return
        dead = set()
        payload = json.dumps(msg, separators=(',', ':'))
        for ws in list(self.clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self.clients -= dead

    def configure(self, symbol: str, granularity: str, api_key: str, pipeline):
        self.symbol = symbol.upper()
        self.granularity = granularity
        self.api_key = api_key
        self.pipeline = pipeline
        self.last_ts = 0
        print(f"[LIVE] Configured: {self.symbol} {self.granularity}")

    async def fetch_candles(self, limit: int = 100):
        """Fetch candles from Bitget with correct granularity format"""
        gran_str, _ = GRAN_MAP.get(self.granularity, ("5min", 300))
        
        url = "https://api.bitget.com/api/v2/spot/market/candles"
        params = {
            "symbol": self.symbol,
            "granularity": gran_str,
            "limit": str(limit),
        }
        
        headers = {}
        if self.api_key:
            headers["ACCESS-KEY"] = self.api_key

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        if data.get("code") != "00000":
            raise ValueError(f"Bitget error: {data.get('msg', 'unknown')}")

        bars = []
        for c in data.get("data", []):
            ts = int(c[0]) // 1000  # Convert ms to seconds
            bars.append({
                "time": ts,
                "open": float(c[1]),
                "high": float(c[2]),
                "low": float(c[3]),
                "close": float(c[4]),
                "volume": float(c[5]),
            })
        bars.sort(key=lambda b: b["time"])
        return bars

    async def _bootstrap(self):
        """Load initial bars to warm up the pipeline"""
        try:
            bars = await self.fetch_candles(limit=100)
            if bars:
                self.pipeline.load_bars(bars)
                self.last_ts = bars[-1]["time"]
                print(f"[LIVE] Bootstrapped {len(bars)} bars, last ts={self.last_ts}")
                return True
        except Exception as e:
            print(f"[LIVE] Bootstrap error: {e}")
        return False

    async def run(self):
        """Main polling loop"""
        self.running = True
        _, poll_interval = GRAN_MAP.get(self.granularity, ("5min", 300))
        check_interval = 5  # Check every 5 seconds

        print(f"[LIVE] Starting feed: {self.symbol} {self.granularity} poll={check_interval}s")
        log_session(f"LIVE FEED START: {self.symbol} {self.granularity}")

        # Bootstrap first
        ok = await self._bootstrap()
        if not ok:
            await self.broadcast({"type": "error", "message": "Failed to fetch initial candles from Bitget"})
            self.running = False
            return

        while self.running:
            await asyncio.sleep(check_interval)
            
            if not self.clients:
                continue

            try:
                bars = await self.fetch_candles(limit=5)
                if not bars:
                    continue

                # Find new bars
                new_bars = [b for b in bars if b["time"] > self.last_ts]

                for bar in new_bars:
                    # Check if bar is old enough (closed)
                    age = int(asyncio.get_event_loop().time()) - bar["time"]
                    if age < poll_interval - 2:
                        continue

                    # Add to pipeline and process
                    self.pipeline.raw_bars.append(bar)
                    self.pipeline.cursor = len(self.pipeline.raw_bars) - 1

                    try:
                        result = await self.pipeline.step()
                        if result:
                            result["live"] = True
                            result["symbol"] = self.symbol
                            log_bar(result)
                            await self.broadcast({"type": "bar", "data": result})
                    except Exception as step_err:
                        print(f"[LIVE] Step error: {step_err}")

                    self.last_ts = bar["time"]

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[LIVE] Poll error: {e}")
                await self.broadcast({"type": "error", "message": f"Feed error: {e}"})
                await asyncio.sleep(15)

        self.running = False
        print("[LIVE] Feed stopped")

    def start(self, pipeline):
        self.pipeline = pipeline
        if self.task and not self.task.done():
            return
        self.task = asyncio.create_task(self.run())

    def stop(self):
        self.running = False
        if self.task:
            self.task.cancel()
            self.task = None


# Global singleton
live_feed = LiveFeed()
