import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_BACKEND = 'http://localhost:8000';
const PYTHON_WS = 'ws://localhost:8000/ws/stream';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Helper for proxying to Python backend
  const proxyToPython = async (req: express.Request, res: express.Response, path: string) => {
    try {
      const response = await fetch(`${PYTHON_BACKEND}${path}`, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
      });
      const data: any = await response.json();
      
      // If loading data, we also want to return a snapshot of the first 100 bars
      // Since the Python backend doesn't provide this by default, we'll fetch it from the new endpoint
      if (path.startsWith('/api/load/') && data.status === 'ok') {
        try {
          const snapshotResp = await fetch(`${PYTHON_BACKEND}/api/snapshot?limit=100`);
          if (snapshotResp.ok) {
             data.snapshot = await snapshotResp.json();
          }
        } catch(snapErr) {
          console.error("[SNAPSHOT PROXY ERROR]", snapErr);
        }
      }

      res.status(response.status).json(data);
    } catch (err: any) {
      console.error(`[PROXY ERROR] ${path}`, err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  };

  // --- API ROUTES ---
  app.post('/api/load/sample', (req, res) => proxyToPython(req, res, '/api/load/sample'));
  app.post('/api/load/bitget', (req, res) => proxyToPython(req, res, '/api/load/bitget'));
  app.post('/api/load/csv', (req, res) => proxyToPython(req, res, '/api/load/csv'));
  app.post('/api/config/modules', (req, res) => proxyToPython(req, res, '/api/config/modules'));

  // MCP ENDPOINTS for Model Monitoring
  app.get('/api/mcp/state', async (req, res) => {
    try {
        const response = await fetch(`${PYTHON_BACKEND}/api/status`);
        const status: any = await response.json();
        res.json({
            timestamp: Date.now(),
            engine_status: status.bars_loaded > 0 ? 'ACTIVE' : 'IDLE',
            current_state: null,
            mcp_node: 'Node-01-Alpha-Python'
        });
    } catch(err) {
        res.status(500).json({ status: 'error' });
    }
  });

  app.post('/api/mcp/command', (req, res) => {
    const { action, params } = req.body;
    console.log(`[MCP COMMAND] ${action}`, params);
    res.json({ status: 'received', action });
  });

  // --- WEBSOCKET HANDLING ---
  wss.on('connection', (ws) => {
    console.log("[WS] Client connected, establishing link to Python backend...");
    const pythonWs = new WebSocket(PYTHON_WS);

    pythonWs.on('message', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data.toString());
      }
    });

    pythonWs.on('error', (err) => {
      console.error("[WS] Python backend error:", err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Python backend connection error' }));
    });

    pythonWs.on('close', () => {
      console.log("[WS] Python backend connection closed");
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    const messageBuffer: string[] = [];

    ws.on('message', (data) => {
      const message = data.toString();
      if (pythonWs.readyState === WebSocket.OPEN) {
        pythonWs.send(message);
      } else if (pythonWs.readyState === WebSocket.CONNECTING) {
        console.log("[WS] Buffering message while Python backend connects");
        messageBuffer.push(message);
      } else {
        console.warn("[WS] Python backend not open, dropping message");
      }
    });

    pythonWs.on('open', () => {
      console.log("[WS] Python backend link established");
      while (messageBuffer.length > 0) {
        const msg = messageBuffer.shift();
        if (msg) pythonWs.send(msg);
      }
    });

    ws.on('close', () => {
      console.log("[WS] Client disconnected");
      if (pythonWs.readyState === WebSocket.OPEN || pythonWs.readyState === WebSocket.CONNECTING) {
        pythonWs.close();
      }
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
