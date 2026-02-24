/**
 * MCP Server Management REST API.
 *
 * Open to all authenticated users with per-user isolation.
 * System-wide preset servers (from mcp-servers.json) are listed as read-only.
 * Users can add/remove their own MCP servers stored in the database.
 *
 * Routes:
 *   GET    /mcp/servers          — List system + user's MCP servers
 *   POST   /mcp/servers          — Add a user-specific MCP server
 *   DELETE /mcp/servers/:name    — Remove a user-specific MCP server
 */

import { Router, type Request, type Response } from 'express';
import { mcpManager } from './mcpManager.js';
import { loadMCPConfig, registerMCPServerAsSkill } from './mcpBridge.js';
import { verifyToken } from '../auth/jwt.js';
import {
  listUserMcpServers,
  addUserMcpServer,
  removeUserMcpServer,
  isUserMcpServer,
} from './userMcpServers.js';
import { syncCatalogFromRegistry } from '../skills/userSkills.js';

const router = Router();

/** Auth middleware: any logged-in user */
function requireAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Attach user info to request for downstream use
  (req as any)._user = { userId: decoded.userId, phone: decoded.phone };
  next();
}

/**
 * GET /mcp/servers
 * List system-wide preset servers + user's own servers.
 * System servers are marked with `system: true` (read-only).
 */
router.get('/servers', requireAuth, (req: Request, res: Response) => {
  const user = (req as any)._user as { userId: string; phone: string };

  // System servers from mcp-servers.json
  const systemConfigs = loadMCPConfig();
  const systemServers = systemConfigs.map((c) => ({
    name: c.name,
    command: c.command,
    args: c.args,
    enabled: c.enabled !== false,
    connected: mcpManager.isConnected(c.name),
    system: true,
    tools: mcpManager.getTools(c.name).map((t) => ({
      name: t.name,
      description: t.description,
    })),
  }));

  // User's own servers from DB
  const userConfigs = listUserMcpServers(user.userId);
  const userServers = userConfigs.map((c) => ({
    name: c.name,
    command: c.command,
    args: c.args,
    enabled: c.enabled !== false,
    connected: mcpManager.isConnected(c.name),
    system: false,
    tools: mcpManager.getTools(c.name).map((t) => ({
      name: t.name,
      description: t.description,
    })),
  }));

  res.json({ servers: [...systemServers, ...userServers] });
});

/**
 * POST /mcp/servers
 * Add a new user-specific MCP server.
 * Saves to DB, connects via mcpManager, registers as skill.
 */
router.post('/servers', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any)._user as { userId: string; phone: string };
  const { name, command, args, env, enabled } = req.body;

  if (!name || !command) {
    res.status(400).json({ error: 'name and command are required' });
    return;
  }

  // Prefix user MCP server names to avoid collisions with system servers
  const serverName = `user-${user.userId.slice(0, 8)}-${name}`;

  try {
    const config = {
      name: serverName,
      command,
      args: args || [],
      env,
      enabled: enabled !== false,
    };

    // Save to DB
    addUserMcpServer(user.userId, config);

    // Connect and register as skill
    const tools = await mcpManager.addServer(config);
    registerMCPServerAsSkill(serverName, tools);
    syncCatalogFromRegistry();

    res.json({
      name: serverName,
      connected: true,
      tools: tools.map((t) => ({ name: t.name, description: t.description })),
    });
  } catch (err) {
    res.status(500).json({
      error: `Failed to connect to MCP server: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }
});

/**
 * DELETE /mcp/servers/:name
 * Remove a user-specific MCP server. System servers cannot be deleted by users.
 */
router.delete('/servers/:name', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any)._user as { userId: string; phone: string };
  const name = req.params.name as string;

  // Check ownership — only user's own servers can be deleted
  if (!isUserMcpServer(user.userId, name)) {
    res.status(403).json({ error: 'You can only delete your own MCP servers' });
    return;
  }

  // Remove from DB
  removeUserMcpServer(user.userId, name);

  // Disconnect and unregister
  await mcpManager.removeServer(name);
  syncCatalogFromRegistry();

  res.json({ removed: true });
});

export default router;
