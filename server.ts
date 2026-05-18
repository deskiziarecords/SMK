import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { SMKEngine } from './src/lib/smk-engine';
import { OHLCV } from './src/types/smk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { logServer, saveTradeLog } from './server_logger';

import { createServer as createViteServer } from 'vite';

import { generateSyntheticData } from './src/lib/data-utils';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  logServer('Starting QUIMERIA SMK Web Server...');
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const PORT = 3000;
  const engine = new SMKEngine();
  const REMOTE_SMK_URL = process.env.SMK_REMOTE_API_URL || 'https://mt.itimbre.com';
  let remotePollingInterval: NodeJS.Timeout | null = null;
  let isRemoteLinked = false;

  app.use(express.json({ limit: '10mb' }));

  // --- REMOTE LINK HELPER ---
  const broadcastToAll = (msg: any) => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    });
  };

  const startRemoteLink = () => {
    if (remotePollingInterval) return;
    logServer(`Establishing HyperLink to Remote SMK: ${REMOTE_SMK_URL}`);
    isRemoteLinked = true;
    
    remotePollingInterval = setInterval(async () => {
      try {
        const response = await fetch(`${REMOTE_SMK_URL}/api/mcp/snapshot`);
        if (!response.ok) return;
        const data: any = await response.json();
        // The real API returns a snapshot which might be a single result or state
        if (data && data.bar) {
          broadcastToAll({ type: 'bar', data: data });
        }
      } catch (err) {
        // Silent fail for polling
      }
    }, 1000); // 1s sync
  };

  const stopRemoteLink = () => {
    if (remotePollingInterval) {
      clearInterval(remotePollingInterval);
      remotePollingInterval = null;
    }
    isRemoteLinked = false;
  };

  // --- BITGET LIVE FEED ---
  let bitgetWs: WebSocket | null = null;
  let lastCandleTime = 0;
  let currentLiveCandle: OHLCV | null = null;

  const startBitgetLive = (symbol: string = 'BTCUSDT') => {
    if (bitgetWs) bitgetWs.close();
    logServer(`Opening Bitget Live Feed for ${symbol}...`);
    
    // Bitget V2 WebSocket
    bitgetWs = new WebSocket('wss://ws.bitget.com/v2/ws/public');

    bitgetWs.on('open', () => {
      const subscribeMsg = {
        op: 'subscribe',
        args: [{ instType: 'SPOT', channel: 'ticker', instId: symbol }]
      };
      bitgetWs?.send(JSON.stringify(subscribeMsg));
      broadcastToAll({ type: 'log', data: `BITGET LIVE: Subscribed to ${symbol}` });
    });

    bitgetWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.action === 'snapshot' && msg.data && msg.data[0]) {
          const tick = msg.data[0];
          const price = parseFloat(tick.lastPr);
          const volume = parseFloat(tick.baseVolume);
          const now = Math.floor(Date.now() / 1000);
          const candleInterval = 300; // 5 min
          const candleTime = Math.floor(now / candleInterval) * candleInterval;

          if (candleTime > lastCandleTime) {
            if (currentLiveCandle) {
              engine.addBar(currentLiveCandle);
              const res = engine.step();
              if (res) broadcastToAll({ type: 'bar', data: res });
            }
            lastCandleTime = candleTime;
            currentLiveCandle = {
              time: candleTime,
              open: price,
              high: price,
              low: price,
              close: price,
              volume: 0
            };
          } else if (currentLiveCandle) {
            currentLiveCandle.close = price;
            currentLiveCandle.high = Math.max(currentLiveCandle.high, price);
            currentLiveCandle.low = Math.min(currentLiveCandle.low, price);
            currentLiveCandle.volume += (volume / 288); // rough approximation of volume per tick if not provided
            
            // For live feel, we can step the engine with the current unclosed candle
            // But we should be careful about state persistence.
            // Better to just push the tick update to frontend for the chart, 
            // and only 'step' the SMK engine on candle close or every 10s.
          }
          
          // Throttled heartbeat to UI
          if (now % 2 === 0) {
              broadcastToAll({ type: 'tick', data: { price, symbol, time: now } });
          }
        }
      } catch (e) {}
    });

    bitgetWs.on('error', (e) => logServer(`Bitget WS Error: ${e.message}`));
    bitgetWs.on('close', () => logServer(`Bitget WS Closed`));
  };

  // --- API ROUTES ---
  app.get('/api/status', async (req, res) => {
    try {
        const remoteRes = await fetch(`${REMOTE_SMK_URL}/api/status`);
        const remoteData = await remoteRes.json();
        res.json({
            local: { status: 'ok', engine: 'active' },
            remote: remoteData,
            link: isRemoteLinked ? 'CONNECTED' : 'DISCONNECTED'
        });
    } catch (e) {
        res.json({ local: { status: 'ok' }, remote: 'offline', link: 'DISCONNECTED' });
    }
  });

  app.post('/api/remote/toggle', (req, res) => {
    const { enabled } = req.body;
    if (enabled) startRemoteLink();
    else stopRemoteLink();
    res.json({ status: 'ok', linked: isRemoteLinked });
  });

  app.post('/api/live/toggle', (req, res) => {
    const { enabled, symbol } = req.body;
    if (enabled) {
      startBitgetLive(symbol || 'BTCUSDT');
    } else {
      if (bitgetWs) bitgetWs.close();
      bitgetWs = null;
    }
    res.json({ status: 'ok', live: !!bitgetWs });
  });

  app.post('/api/simulator/save-trades', (req, res) => {
    const { trades } = req.body;
    saveTradeLog(trades);
    logServer(`Saved ${trades?.length || 0} simulator trades to /logs folder.`);
    res.json({ status: 'ok' });
  });

  app.post('/api/load/sample', (req, res) => {
    const bars = generateSyntheticData(400);
    engine.loadBars(bars);
    const snapshot = engine.getSnapshot(100);
    res.json({ status: 'ok', count: bars.length, source: 'synthetic', snapshot });
  });

  app.post('/api/load/bitget', async (req, res) => {
    const { symbol = 'BTCUSDT', granularity = '5min', limit = 300 } = req.body;
    try {
      const url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`;
      const response = await fetch(url);
      const data: any = await response.json();
      if (!data.data) throw new Error(data.msg || 'No data from Bitget');
      
      const bars: OHLCV[] = data.data.map((c: any) => ({
        time: Math.floor(parseInt(c[0]) / 1000),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      })).sort((a: any, b: any) => a.time - b.time);

      const uniqueBars = bars.filter((b, i, self) => i === 0 || b.time > self[i - 1].time);
      engine.loadBars(uniqueBars);
      const snapshot = engine.getSnapshot(100);
      res.json({ status: 'ok', count: uniqueBars.length, source: `bitget:${symbol}`, snapshot });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.get('/api/asset/alignment/:symbol', (req, res) => {
    const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"];
    const results = timeframes.map(tf => ({
      tf: tf.toUpperCase(),
      score: Number((Math.random() * 2 - 1).toFixed(2))
    }));
    res.json(results);
  });

  app.post('/api/smk/macro', (req, res) => {
    const { regime, lambdaScore, dxyTrend } = req.body;
    engine.setMacroState({ regime, lambdaScore, dxyTrend });
    res.json({ status: 'ok' });
  });

  app.post('/api/smk/params', (req, res) => {
    const params = req.body;
    engine.updateParams(params);
    res.json({ status: 'ok' });
  });

  app.post('/api/load/csv', (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ status: 'error', message: 'No CSV content provided' });

    try {
      const lines = text.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      const bars: OHLCV[] = [];

      // Detect delimiter
      const firstLine = lines[0];
      const delimiter = firstLine.includes(';') ? ';' : ',';

      // Basic heuristic: check if first line is header
      let startIdx = 0;
      const firstParts = lines[0].split(delimiter);
      if (isNaN(parseFloat(firstParts[1]))) {
        startIdx = 1;
      }

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(delimiter); 
        if (parts.length < 5) continue;

        let timeValue = parts[0].trim();
        let timestamp = 0;

        // Custom parser for "24.03.2026 12:00:00.000 UTC"
        const historicalMatch = timeValue.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        
        if (historicalMatch) {
            const [_, d, m, y, hh, mm, ss, ms] = historicalMatch;
            timestamp = Math.floor(new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}Z`).getTime() / 1000);
        } else if (timeValue.includes('-') || timeValue.includes('/')) {
            timestamp = Math.floor(new Date(timeValue).getTime() / 1000);
        } else {
            // Assume unix timestamp (could be ms or s)
            timestamp = parseFloat(timeValue);
            if (timestamp > 9999999999) timestamp = Math.floor(timestamp / 1000);
        }

        if (isNaN(timestamp) || timestamp === 0) continue;

        bars.push({
          time: timestamp,
          open: parseFloat(parts[1]),
          high: parseFloat(parts[2]),
          low: parseFloat(parts[3]),
          close: parseFloat(parts[4]),
          volume: parts[5] ? parseFloat(parts[5]) : 0
        });
      }

      if (bars.length === 0) {
        throw new Error('No valid bars found in CSV');
      }

      const sortedBars = bars.sort((a, b) => a.time - b.time);
      const uniqueBars = sortedBars.filter((b, i, self) => i === 0 || b.time > self[i - 1].time);
      
      engine.loadBars(uniqueBars);
      const snapshot = engine.getSnapshot(100);
      res.json({ status: 'ok', count: uniqueBars.length, snapshot });
    } catch (err: any) {
      console.error("[CSV LOAD ERROR]", err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.post('/api/config/modules', (req, res) => {
    const { disabled_modules } = req.body;
    if (Array.isArray(disabled_modules)) {
      engine.setDisabledModules(disabled_modules);
      res.json({ status: 'ok', disabled: disabled_modules.length });
    } else {
      res.status(400).json({ status: 'error', message: 'Invalid configuration' });
    }
  });

  // --- HYPERION PROXY ---
  app.post('/api/hyperion/order', async (req, res) => {
    try {
        const response = await fetch(`${REMOTE_SMK_URL}/api/hyperion/orderbooking/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ status: 'error', message: err.message });
    }
  });

  app.get('/api/hyperion/positions', async (req, res) => {
    try {
        const response = await fetch(`${REMOTE_SMK_URL}/api/broker/positions`);
        const data = await response.json();
        res.json(data);
    } catch (err: any) {
        res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // MCP ENDPOINTS for Model Monitoring
  app.get('/api/mcp/state', (req, res) => {
    const lastResult = engine.getLastResult();
    res.json({
      timestamp: Date.now(),
      engine_status: lastResult ? 'ACTIVE' : 'IDLE',
      current_state: lastResult || null,
      mcp_node: 'Node-01-Alpha'
    });
  });

  app.post('/api/mcp/command', (req, res) => {
    const { action, params } = req.body;
    // This allows an external model to inject commands into the engine stream
    // For now, we log it and can extend to server-side trade execution
    console.log(`[MCP COMMAND] ${action}`, params);
    res.json({ status: 'received', action });
  });

  // --- WEBSOCKET HANDLING ---
  wss.on('connection', (ws) => {
    let running = false;
    let interval: NodeJS.Timeout | null = null;

    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.action === 'run') {
        running = true;
        const speed = Math.max(16, msg.speed || 300);
        if (interval) clearInterval(interval);
        
        const runStep = () => {
          if (!running) return;
          const res = engine.step();
          if (res) {
            ws.send(JSON.stringify({ type: 'bar', data: res }));
          } else {
            ws.send(JSON.stringify({ type: 'done' }));
            if (interval) clearInterval(interval);
            running = false;
          }
        };

        runStep(); // Fire immediately
        interval = setInterval(runStep, speed);
      } else if (msg.action === 'stop') {
        running = false;
        if (interval) clearInterval(interval);
      } else if (msg.action === 'step') {
        const result = engine.step();
        if (result) ws.send(JSON.stringify({ type: 'bar', data: result }));
        else ws.send(JSON.stringify({ type: 'done' }));
      } else if (msg.action === 'reset') {
        engine.reset();
        ws.send(JSON.stringify({ type: 'reset' }));
      }
    });

    ws.on('close', () => {
      if (interval) clearInterval(interval);
    });
  });

  // --- STATIC ASSETS / VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SMK Server running on port ${PORT}`);
  });
}

startServer();

