/**
 * User-level MCP Server management.
 *
 * Stores per-user MCP server configs in the DB, separate from system-wide
 * preset servers in mcp-servers.json.
 */

import db from '../auth/db.js';
import type { MCPServerConfig } from './mcpManager.js';

interface UserMcpRow {
  id: number;
  user_id: string;
  name: string;
  command: string;
  args: string;
  env: string | null;
  enabled: number;
  created_at: number;
}

const stmts = {
  list: db.prepare('SELECT * FROM user_mcp_servers WHERE user_id = ?'),
  get: db.prepare('SELECT * FROM user_mcp_servers WHERE user_id = ? AND name = ?'),
  insert: db.prepare(`
    INSERT INTO user_mcp_servers (user_id, name, command, args, env, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  delete: db.prepare('DELETE FROM user_mcp_servers WHERE user_id = ? AND name = ?'),
  isOwner: db.prepare('SELECT 1 FROM user_mcp_servers WHERE user_id = ? AND name = ?'),
};

function rowToConfig(row: UserMcpRow): MCPServerConfig & { userId: string } {
  return {
    name: row.name,
    command: row.command,
    args: JSON.parse(row.args || '[]'),
    env: row.env ? JSON.parse(row.env) : undefined,
    enabled: row.enabled === 1,
    userId: row.user_id,
  };
}

/** List all MCP servers for a specific user */
export function listUserMcpServers(userId: string): Array<MCPServerConfig & { userId: string }> {
  const rows = stmts.list.all(userId) as UserMcpRow[];
  return rows.map(rowToConfig);
}

/** Add a user-specific MCP server config to the DB */
export function addUserMcpServer(
  userId: string,
  config: MCPServerConfig,
): void {
  stmts.insert.run(
    userId,
    config.name,
    config.command,
    JSON.stringify(config.args || []),
    config.env ? JSON.stringify(config.env) : null,
    config.enabled !== false ? 1 : 0,
    Date.now(),
  );
}

/** Remove a user-specific MCP server */
export function removeUserMcpServer(userId: string, name: string): boolean {
  const result = stmts.delete.run(userId, name);
  return result.changes > 0;
}

/** Check if a user owns a specific MCP server */
export function isUserMcpServer(userId: string, name: string): boolean {
  return !!stmts.isOwner.get(userId, name);
}
