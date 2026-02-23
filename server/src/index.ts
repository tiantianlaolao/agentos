import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleConnection, initPushListener } from './websocket/handler.js';
import { initDatabase } from './auth/db.js';
import { loadBuiltinSkills } from './skills/loader.js';
import { initMCPServers } from './mcp/mcpBridge.js';
import mcpRoutes from './mcp/routes.js';
import authRoutes from './auth/routes.js';
import hostedRoutes from './auth/hostedRoutes.js';
import memoryRoutes from './memory/routes.js';
import skillRoutes from './skills/routes.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = createServer(app);

// Parse JSON bodies
app.use(express.json());

// Initialize database
initDatabase();

// Load built-in skills (weather, translate, etc.)
loadBuiltinSkills()
  .then(() => initMCPServers())
  .catch((err) => {
    console.error('[AgentOS] Failed to load skills/MCP:', err);
  });

// Auth routes
app.use('/auth', authRoutes);

// Hosted OpenClaw routes
app.use('/hosted', hostedRoutes);

// Memory routes
app.use('/memory', memoryRoutes);

// External skills routes
app.use('/skills', skillRoutes);

// MCP server management routes
app.use('/mcp', mcpRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// APK download page (static files from /var/www/agentos-download)
app.use('/download', express.static('/var/www/agentos-download'));

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

  // Start background push listener for OpenClaw cron/scheduled tasks
  const openclawUrl = process.env.OPENCLAW_URL;
  const openclawToken = process.env.OPENCLAW_TOKEN;
  if (openclawUrl) {
    initPushListener(openclawUrl, openclawToken);
  }
});
