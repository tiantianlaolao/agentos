import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleConnection } from './websocket/handler.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = createServer(app);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[WS] New connection from ${clientIp}`);
  handleConnection(ws);
});

wss.on('error', (error) => {
  console.error('[WS] Server error:', error);
});

server.listen(PORT, HOST, () => {
  console.log(`[AgentOS] Server running on ${HOST}:${PORT}`);
  console.log(`[AgentOS] WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
  console.log(`[AgentOS] Health check: http://${HOST}:${PORT}/health`);
});
