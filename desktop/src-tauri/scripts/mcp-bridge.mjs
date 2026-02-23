#!/usr/bin/env node
/**
 * AgentOS MCP Bridge — Local HTTP service for desktop MCP server management.
 *
 * Connects to local MCP servers (stdio transport), discovers their tools,
 * and exposes an HTTP API for the Tauri desktop app to call.
 *
 * Usage:
 *   node mcp-bridge.mjs [config-path]
 *
 * Config file format (JSON array):
 *   [{ "name": "filesystem", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"], "env": {} }]
 *
 * HTTP Endpoints:
 *   GET  /tools      — List all discovered tools from all servers
 *   POST /call       — Call a specific tool: { server, tool, arguments }
 *   POST /shutdown   — Graceful shutdown
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ── Config ──

const DEFAULT_CONFIG_PATH = resolve(homedir(), '.agentos', 'mcp-config.json');
const configPath = process.argv[2] || DEFAULT_CONFIG_PATH;

// ── MCP Connection Manager ──

const connections = new Map(); // name → { client, transport, tools }

async function connectServer(config) {
  const { name, command, args = [], env } = config;

  console.error(`[MCP Bridge] Connecting to "${name}": ${command} ${args.join(' ')}`);

  const transport = new StdioClientTransport({
    command,
    args,
    env: env ? { ...process.env, ...env } : undefined,
  });

  const client = new Client(
    { name: 'agentos-desktop', version: '0.1.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  const toolsResult = await client.listTools();
  const tools = (toolsResult.tools || []).map((t) => ({
    server: name,
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || {},
  }));

  connections.set(name, { client, transport, tools, config });
  console.error(`[MCP Bridge] "${name}" connected: ${tools.length} tools`);

  return tools;
}

async function callTool(serverName, toolName, args) {
  const conn = connections.get(serverName);
  if (!conn) throw new Error(`Server "${serverName}" not connected`);

  const result = await conn.client.callTool({ name: toolName, arguments: args });

  const parts = [];
  for (const item of result.content) {
    if (item.type === 'text' && item.text) {
      parts.push(item.text);
    }
  }
  return parts.join('\n') || JSON.stringify(result.content);
}

async function shutdown() {
  for (const [name, conn] of connections) {
    try {
      await conn.client.close();
      console.error(`[MCP Bridge] Closed "${name}"`);
    } catch (err) {
      console.error(`[MCP Bridge] Error closing "${name}":`, err.message);
    }
  }
  connections.clear();
}

// ── HTTP Server ──

function getAllTools() {
  const allTools = [];
  for (const conn of connections.values()) {
    allTools.push(...conn.tools);
  }
  return allTools;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);

  try {
    if (req.method === 'GET' && url.pathname === '/tools') {
      sendJson(res, 200, { tools: getAllTools() });

    } else if (req.method === 'POST' && url.pathname === '/call') {
      const body = await parseBody(req);
      const { server, tool, arguments: args } = body;

      if (!server || !tool) {
        sendJson(res, 400, { error: 'Missing "server" or "tool" in body' });
        return;
      }

      const result = await callTool(server, tool, args || {});
      sendJson(res, 200, { result });

    } else if (req.method === 'POST' && url.pathname === '/shutdown') {
      sendJson(res, 200, { ok: true });
      await shutdown();
      process.exit(0);

    } else if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        servers: Array.from(connections.keys()),
        toolCount: getAllTools().length,
      });

    } else {
      sendJson(res, 404, { error: 'Not found' });
    }
  } catch (err) {
    console.error(`[MCP Bridge] Error handling ${req.method} ${url.pathname}:`, err.message);
    sendJson(res, 500, { error: err.message });
  }
});

// ── Startup ──

async function main() {
  // Load config
  if (!existsSync(configPath)) {
    console.error(`[MCP Bridge] No config file at ${configPath}, starting with no servers`);
  } else {
    try {
      const configs = JSON.parse(readFileSync(configPath, 'utf-8'));
      console.error(`[MCP Bridge] Loading ${configs.length} server(s) from ${configPath}`);

      for (const config of configs) {
        try {
          await connectServer(config);
        } catch (err) {
          console.error(`[MCP Bridge] Failed to connect "${config.name}":`, err.message);
        }
      }
    } catch (err) {
      console.error(`[MCP Bridge] Failed to read config:`, err.message);
    }
  }

  // Start HTTP server on random port
  httpServer.listen(0, '127.0.0.1', () => {
    const port = httpServer.address().port;
    // Print port marker to stdout — Tauri reads this from process logs
    console.log(`MCP_BRIDGE_PORT=${port}`);
    console.error(`[MCP Bridge] HTTP server listening on 127.0.0.1:${port}`);
    console.error(`[MCP Bridge] ${getAllTools().length} tools available`);
  });
}

// Graceful shutdown on signals
process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

main().catch((err) => {
  console.error('[MCP Bridge] Fatal error:', err);
  process.exit(1);
});
