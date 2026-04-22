"""
aegis_bridge.py  —  QUIMERIA ↔ AEGIS Integration Layer
Lives in backend/ alongside smk_pipeline.py.

Wires the SMK step() output into the full execution chain:
  1. CLM tokenizer   → 7-symbol pattern sequence from recent bars
  2. StopLossManager → SL price, TP price, lot size, R:R from pattern DNA
  3. AegisExtensions → Kelly sizing, SchurRouter venue allocation, circuit breakers

Usage (called automatically from smk_pipeline.py after every PROCEED bar):
    from aegis_bridge import AegisBridge
    bridge = AegisBridge(capital=10_000, n_venues=1)
    exe = bridge.evaluate(smk_result, recent_bars)
    # exe["action"]           → "TRADE" | "HALT" | "REDUCE" | "WARMUP"
    # exe["stop_loss_price"]  → float
    # exe["take_profit_price"]→ float
    # exe["lot_size"]         → float
    # exe["kelly_size"]       → fraction of capital
    # exe["venue_allocation"] → [0.38, 0.27, ...] per venue
    # exe["pattern"]          → "WBU"
    # exe["dominant"]         → "W"
    # exe["risk_profile"]     → full RiskProfile summary string
"""
from __future__ import annotations

import os
import sys
import logging
from typing import Dict, List, Optional, Any
import numpy as np

log = logging.getLogger("aegis_bridge")

# ── PATH SETUP ────────────────────────────────────────────────────────────────
_here = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_here)   # smk_ipda_trading_system/

for _p in [_here, _root]:
    if _p not in sys.path:
        sys.path.insert(0, _p)


# ── LAZY IMPORTS (never crash on missing deps) ────────────────────────────────

def _load_stop_loss():
    try:
        from stop_loss_manager import StopLossManager, SequenceStopLossManager
        return StopLossManager, SequenceStopLossManager
    except ImportError as e:
        log.warning("StopLossManager not available: %s", e)
        return None, None


def _load_aegis():
    try:
        from aegis_extensions import AegisExtensions
        return AegisExtensions
    except ImportError as e:
        log.warning("AegisExtensions not available: %s", e)
        return None


# ── CLM TOKENIZER (inline — no sentence_transformers needed) ─────────────────

class _CLMTokenizer:
    """
    Converts OHLCV bars → SMART-EXE 7-symbol sequence.
    B = Strong Bullish  I = Strong Bearish
    W = Upper Wick      w = Lower Wick
    U = Weak Bull       D = Weak Bear
    X = Neutral / Structure
    """
    @staticmethod
    def tokenize_bar(bar: dict) -> str:
        o, h, l, c = bar["open"], bar["high"], bar["low"], bar["close"]
        body  = abs(c - o)
        rng   = max(1e-9, h - l)
        ratio = body / rng
        wick_upper = h - max(o, c)
        wick_lower = min(o, c) - l

        if ratio < 0.10:
            return "X"
        if wick_upper > body * 2.0 and c < o:
            return "W"
        if wick_lower > body * 2.0 and c > o:
            return "w"
        if c > o:
            return "B" if ratio > 0.60 else "U"
        return "I" if ratio > 0.60 else "D"

    @classmethod
    def sequence(cls, bars: List[dict], n: int = 8) -> str:
        recent = bars[-n:] if len(bars) >= n else bars
        return "".join(cls.tokenize_bar(b) for b in recent)

    @staticmethod
    def direction_from_smk(smk: dict) -> int:
        """Derive trade direction from SMK fusion signal."""
        p = smk.get("fusion", {}).get("p_fused", 0.0)
        bias = smk.get("bias", {}).get("bias", "NEUTRAL")
        if p > 0.15 or bias == "BULLISH":
            return 1
        if p < -0.15 or bias == "BEARISH":
            return -1
        return 0


# ── NULL FALLBACK RESULTS ─────────────────────────────────────────────────────

def _null_exe(reason: str = "UNAVAILABLE") -> dict:
    return {
        "action":           "HALT",
        "reason":           reason,
        "pattern":          "",
        "dominant":         "X",
        "direction":        0,
        "stop_loss_price":  0.0,
        "take_profit_price":0.0,
        "lot_size":         0.0,
        "kelly_size":       0.0,
        "venue_allocation": [],
        "risk_profile":     "",
        "risk_pips":        0.0,
        "rr_ratio":         0.0,
        "delta_e":          0.0,
        "rev_score":        0.0,
        "is_armed":         False,
    }


# ── BRIDGE ────────────────────────────────────────────────────────────────────

class AegisBridge:
    """
    Single object that owns StopLossManager + AegisExtensions and
    evaluates every PROCEED bar through the full execution chain.
    """

    def __init__(
        self,
        capital:          float = 10_000.0,
        risk_per_trade:   float = 0.01,        # 1% per trade
        n_venues:         int   = 1,            # number of execution venues
        kelly_limit:      float = 0.02,         # max Kelly fraction
        atr_weight:       float = 0.5,
        enabled:          bool  = True,
    ):
        self.capital        = capital
        self.enabled        = enabled
        self._tokenizer     = _CLMTokenizer()

        # ── Backend Position State ─────────────────────────────────────────
        self.active_trade: Optional[Dict[str, Any]] = None
        self.session_pnl: float = 0.0

        # ── StopLossManager ───────────────────────────────────────────────
        SLM, SeqSLM = _load_stop_loss()
        if SLM:
            self._slm = SeqSLM(
                capital            = capital,
                risk_per_trade_pct = risk_per_trade,
                atr_weight         = atr_weight,
            )
            self._slm_available = True
            log.info("StopLossManager loaded")
        else:
            self._slm = None
            self._slm_available = False
            log.warning("StopLossManager not loaded — execution sizing disabled")

        # ── AegisExtensions ───────────────────────────────────────────────
        AE = _load_aegis()
        if AE:
            self._aegis = AE(
                n_venues    = n_venues,
                kelly_limit = kelly_limit,
            )
            self._aegis.start()
            self._aegis_available = True
            log.info("AegisExtensions loaded — %d venues", n_venues)
        else:
            self._aegis = None
            self._aegis_available = False
            log.warning("AegisExtensions not loaded — routing disabled")

        print(f"[AEGIS] Bridge initialized  SLM={self._slm_available}  AEGIS={self._aegis_available}")

    # ── PUBLIC API ────────────────────────────────────────────────────────

    def update_atr(self, bar: dict) -> None:
        """Feed completed bar into rolling ATR calculator."""
        if self._slm_available:
            try:
                self._slm.update_atr(bar["high"], bar["low"], bar["close"])
            except Exception:
                pass

    def update_capital(self, new_capital: float) -> None:
        self.capital = new_capital
        if self._slm_available:
            self._slm.engine.update_capital(new_capital)

    def evaluate(
        self,
        smk:       dict,
        bars:      List[dict],
        override_direction: Optional[int] = None,
    ) -> dict:
        """
        Evaluate one SMK bar result through the full execution chain.
        """
        if not self.enabled:
            return _null_exe("BRIDGE_DISABLED")

        # ── Inputs (Define early for monitoring) ──────────────────────────
        bar_curr  = smk.get("bar", {})
        entry     = float(bar_curr.get("close", 0.0))
        if entry <= 0:
            return _null_exe("NO_PRICE")

        # ── Global Profit Target check ────────────────────────────────────
        if getattr(self, 'profit_target_enabled', False):
            floating_pnl = 0
            if self.active_trade:
                t = self.active_trade
                floating_pnl = (entry - t["entry"]) * t["direction"] * t["lot_size"] * 10000
            
            total_gain = self.session_pnl + floating_pnl
            if total_gain >= (getattr(self, 'initial_capital', self.capital) * getattr(self, 'profit_target_pct', 0.02)):
                if self.active_trade:
                    self.session_pnl += floating_pnl
                    self.active_trade = None
                return _null_exe("PROFIT_TARGET_REACHED")

        # ── Position Monitoring (Backend Logic Respects SL/TP) ─────────────
        if self.active_trade:
            t = self.active_trade
            p_high = float(bar_curr.get("high", entry))
            p_low  = float(bar_curr.get("low", entry))
            
            # Check SL/TP hit
            hit_sl = False; hit_tp = False
            if t["direction"] == 1: # Long
                if p_low <= t["stop_loss_price"]: hit_sl = True
                elif p_high >= t["take_profit_price"]: hit_tp = True
            else: # Short
                if p_high >= t["stop_loss_price"]: hit_sl = True
                elif p_low <= t["take_profit_price"]: hit_tp = True
            
            if hit_sl or hit_tp:
                reason = "CLOSED_SL_HIT" if hit_sl else "CLOSED_TP_HIT"
                # rough pnl calculation in pips
                pnl = (entry - t["entry"]) * t["direction"] * t["lot_size"] * 10000
                self.session_pnl += pnl
                self.active_trade = None
                return _null_exe(reason)

        # Only evaluate on PROCEED decisions
        veto = smk.get("veto", {})
        if veto.get("decision") != "Proceed":
            return _null_exe(f"VETO:{veto.get('decision','UNKNOWN')}")

        direction = override_direction or _CLMTokenizer.direction_from_smk(smk)

        # ── Position Flipping ─────────────────────────────────────────────
        if self.active_trade and direction != 0 and direction != self.active_trade["direction"]:
            t = self.active_trade
            # Close existing trade
            pnl = (entry - t["entry"]) * t["direction"] * t["lot_size"] * 10000
            self.session_pnl += pnl
            self.active_trade = None
            log.info("Aegis FLIP: Closed %d, Opening %d", t["direction"], direction)

        if direction == 0:
            return _null_exe("NO_DIRECTIONAL_BIAS")
            
        # If we already have a trade in the same direction, don't reopen
        if self.active_trade and self.active_trade["direction"] == direction:
             t = self.active_trade
             return {
                **_null_exe("ACTIVE_TRADE"),
                "action": "TRADE",
                "is_armed": True,
                "direction": t["direction"],
                "stop_loss_price": t["stop_loss_price"],
                "take_profit_price": t["take_profit_price"],
                "lot_size": t["lot_size"],
             }

        p_fused   = float(smk.get("fusion", {}).get("p_fused", 0.0))
        confidence= float(smk.get("fusion", {}).get("confidence", 0.5))
        amd_state = smk.get("amd", {}).get("state", "Accumulation")

        # ── CLM sequence ──────────────────────────────────────────────────
        sequence  = self._tokenizer.sequence(bars, n=8)
        dominant  = max(sequence, key=lambda c: {"W":5,"w":5,"B":4,"I":4,"X":3,"U":2,"D":2}.get(c,1)) \
                    if sequence else "X"

        # ── StopLossManager ───────────────────────────────────────────────
        exe = _null_exe("SLM_UNAVAILABLE")

        if self._slm_available:
            try:
                atr_val = self._slm.engine.atr.value  # may be None during warmup
                profile = self._slm.calculate_from_sequence(
                    sequence    = sequence,
                    entry_price = entry,
                    direction   = direction,
                    atr_override= atr_val,
                    confidence  = confidence,
                )
                exe = {
                    "action":           "ARMED" if profile.is_valid else "HALT",
                    "reason":           profile.status,
                    "pattern":          sequence,
                    "dominant":         profile.pattern,
                    "direction":        int(direction),
                    "stop_loss_price":  float(profile.stop_loss_price),
                    "take_profit_price":float(profile.take_profit_price),
                    "lot_size":         float(profile.lot_size),
                    "kelly_size":       float(profile.lot_size * entry / max(self.capital, 1)),
                    "venue_allocation": [],
                    "risk_profile":     profile.summary(),
                    "risk_pips":        float(profile.risk_pips),
                    "rr_ratio":         float(profile.rr_ratio),
                    "delta_e":          0.0,
                    "rev_score":        0.0,
                    "is_armed":         bool(profile.is_valid),
                }
            except Exception as e:
                log.warning("StopLossManager error: %s", e)
                exe = _null_exe(f"SLM_ERROR:{e}")

        # ── AegisExtensions (async wrapper — run synchronously via asyncio) ─
        if self._aegis_available and exe.get("is_armed"):
            try:
                import asyncio

                bar_payload = {
                    "close":    entry,
                    "high":     float(bar.get("high", entry)),
                    "low":      float(bar.get("low", entry)),
                    "volume":   float(bar.get("volume", 100)),
                    "sigma":    {"Accumulation":0,"Manipulation":1,
                                 "Distribution":2,"Retracement":3}.get(amd_state, 0),
                    "phi":      confidence,
                    "killzone": bool(smk.get("session", {}).get("killzone", False)),
                }

                # infer signal_probs from p_fused
                long_p  = float(max(0.0, p_fused))
                short_p = float(max(0.0, -p_fused))
                flat_p  = float(max(0.0, 1.0 - long_p - short_p))
                probs   = np.array([long_p, flat_p, short_p], dtype=np.float32)

                # Run async on_signal in a new event loop if needed
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # We're inside an async context — schedule and get result
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                            future = pool.submit(
                                asyncio.run,
                                self._aegis.on_signal(
                                    bar          = bar_payload,
                                    signal       = float(p_fused),
                                    confidence   = confidence,
                                    signal_probs = probs,
                                )
                            )
                            aegis_result = future.result(timeout=2.0)
                    else:
                        aegis_result = loop.run_until_complete(
                            self._aegis.on_signal(
                                bar          = bar_payload,
                                signal       = float(p_fused),
                                confidence   = confidence,
                                signal_probs = probs,
                            )
                        )
                except RuntimeError:
                    aegis_result = asyncio.run(
                        self._aegis.on_signal(
                            bar          = bar_payload,
                            signal       = float(p_fused),
                            confidence   = confidence,
                            signal_probs = probs,
                        )
                    )

                # Merge AEGIS result into exe
                exe["action"]           = str(aegis_result.action)
                exe["kelly_size"]       = float(aegis_result.kelly_size)
                exe["venue_allocation"] = [float(x) for x in (aegis_result.venue_allocation or [])]
                exe["delta_e"]          = float(aegis_result.delta_e)
                exe["rev_score"]        = float(aegis_result.rev_score)

                if aegis_result.action == "HALT":
                    exe["reason"]    = str(aegis_result.halt_reason)
                    exe["is_armed"]  = False
                    exe["lot_size"]  = 0.0
                elif aegis_result.action == "REDUCE":
                    exe["lot_size"]  = round(exe["lot_size"] * 0.5, 2)

                # ── Record Trade in Backend state ─────────────────────────
                if exe.get("is_armed") and exe.get("action") in ("TRADE", "ARMED"):
                    self.active_trade = {
                        "entry": entry,
                        "direction": int(direction),
                        "stop_loss_price": exe["stop_loss_price"],
                        "take_profit_price": exe["take_profit_price"],
                        "lot_size": exe["lot_size"],
                        "ts": time.time()
                    }

            except Exception as e:
                log.warning("AegisExtensions error: %s", e)
                # Keep SLM result, just no AEGIS sizing

        # Final action normalisation
        if not exe.get("is_armed") and exe.get("action") not in ("HALT", "REDUCE", "WARMUP"):
            exe["action"] = "HALT"
        elif exe.get("is_armed") and exe.get("action") == "ARMED":
            exe["action"] = "TRADE"

        return exe

    def session_stats(self) -> dict:
        if self._slm_available:
            return self._slm.session_stats()
        return {}


# ── GLOBAL SINGLETON ──────────────────────────────────────────────────────────

_bridge: Optional[AegisBridge] = None

def get_bridge(**kwargs) -> AegisBridge:
    global _bridge
    if _bridge is None:
        _bridge = AegisBridge(**kwargs)
    return _bridge
