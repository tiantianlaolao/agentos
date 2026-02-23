/**
 * MCP Server Management REST API.
 *
 * All endpoints require admin authentication.
 * Routes:
 *   GET    /mcp/servers          — List configured MCP servers
 *   POST   /mcp/servers          — Add and connect a new MCP server
 *   DELETE /mcp/servers/:name    — Remove and disconnect an MCP server
 */

import { Router, type Request, type Response } from 'express';
import { mcpManager } from './mcpManager.js';
import { loadMCPConfig, addMCPServer, removeMCPServer } from './mcpBridge.js';
import { verifyToken } from '../auth/jwt.js';

const router = Router();

const ADMIN_PHONES = ['13501161326'];

/** Simple admin check middleware */
function requireAdmin(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded || !ADMIN_PHONES.includes(decoded.phone)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/** GET /mcp/servers — List all configured MCP servers with status */
router.get('/servers', requireAdmin, (_req: Request, res: Response) => {
  const configs = loadMCPConfig();
  const servers = configs.map((c) => ({
    name: c.name,
    command: c.command,
    args: c.args,
    enabled: c.enabled !== false,
    connected: mcpManager.isConnected(c.name),
    tools: mcpManager.getTools(c.name).map((t) => ({
      name: t.name,
      description: t.description,
    })),
  }));

  res.json({ servers });
});

/** POST /mcp/servers — Add a new MCP server */
router.post('/servers', requireAdmin, async (req: Request, res: Response) => {
  const { name, command, args, env, enabled } = req.body;

  if (!name || !command) {
    res.status(400).json({ error: 'name and command are required' });
    return;
  }

  try {
    const tools = await addMCPServer({
      name,
      command,
      args: args || [],
      env,
      enabled: enabled !== false,
    });

    res.json({
      name,
      connected: true,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    });
  } catch (err) {
    res.status(500).json({
      error: `Failed to connect to MCP server: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
});

/** DELETE /mcp/servers/:name — Remove an MCP server */
router.delete('/servers/:name', requireAdmin, async (req: Request, res: Response) => {
  const name = req.params.name as string;

  const removed = await removeMCPServer(name);
  if (!removed) {
    res.status(404).json({ error: `MCP server "${name}" not found` });
    return;
  }

  res.json({ removed: true });
});

export default router;
