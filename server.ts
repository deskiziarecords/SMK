import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { SMKEngine } from './src/lib/smk-engine';
import { OHLCV } from './src/types/smk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

import { createServer as createViteServer } from 'vite';

import { generateSyntheticData } from './src/lib/data-utils';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const PORT = 3000;
  const engine = new SMKEngine();

  app.use(express.json({ limit: '10mb' }));

  // --- API ROUTES ---
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

  app.post('/api/load/csv', (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ status: 'error', message: 'No CSV content provided' });

    try {
      const lines = text.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      const bars: OHLCV[] = [];

      // Basic heuristic: check if first line is header
      let startIdx = 0;
      if (isNaN(parseFloat(lines[0].split(/[;,]/)[0]))) {
        startIdx = 1;
      }

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(/[;,]/); // support both comma and semicolon
        if (parts.length < 5) continue;

        let timeValue = parts[0].trim();
        let timestamp = 0;

        // Handle various date/time formats
        if (timeValue.includes('-') || timeValue.includes('/')) {
            timestamp = Math.floor(new Date(timeValue).getTime() / 1000);
        } else {
            // Assume unix timestamp (could be ms or s)
            timestamp = parseFloat(timeValue);
            if (timestamp > 9999999999) timestamp = Math.floor(timestamp / 1000);
        }

        if (isNaN(timestamp)) continue;

        bars.push({
          time: timestamp,
          open: parseFloat(parts[1]),
          high: parseFloat(parts[2]),
          low: parseFloat(parts[3]),
          close: parseFloat(parts[4]),
          volume: parts[5] ? parseFloat(parts[5]) : 0
        });
      }

      const sortedBars = bars.sort((a, b) => a.time - b.time);
      const uniqueBars = sortedBars.filter((b, i, self) => i === 0 || b.time > self[i - 1].time);
      
      engine.loadBars(uniqueBars);
      const snapshot = engine.getSnapshot(100);
      res.json({ status: 'ok', count: uniqueBars.length, snapshot });
    } catch (err: any) {
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
        interval = setInterval(() => {
          if (!running) return;
          const result = engine.step();
          if (result) {
            ws.send(JSON.stringify({ type: 'bar', data: result }));
          } else {
            ws.send(JSON.stringify({ type: 'done' }));
            if (interval) clearInterval(interval);
          }
        }, speed);
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

