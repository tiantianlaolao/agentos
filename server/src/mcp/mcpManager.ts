/**
 * MCPManager — Manages connections to multiple MCP (Model Context Protocol) servers.
 *
 * Each MCP server is a subprocess (stdio transport) that exposes tools.
 * The manager handles lifecycle: connect, list tools, call tools, disconnect.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPConnection {
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: MCPToolInfo[];
}

class MCPManager {
  private connections = new Map<string, MCPConnection>();

  /**
   * Connect to an MCP server and discover its tools.
   */
  async addServer(config: MCPServerConfig): Promise<MCPToolInfo[]> {
    if (this.connections.has(config.name)) {
      await this.removeServer(config.name);
    }

    console.log(`[MCP] Connecting to server "${config.name}": ${config.command} ${config.args.join(' ')}`);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
    });

    const client = new Client(
      { name: 'agentos-server', version: '0.1.0' },
      { capabilities: {} },
    );

    await client.connect(transport);
    console.log(`[MCP] Connected to "${config.name}"`);

    // Discover tools
    const toolsResult = await client.listTools();
    const tools: MCPToolInfo[] = (toolsResult.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: (t.inputSchema || {}) as Record<string, unknown>,
    }));

    console.log(`[MCP] Server "${config.name}" provides ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);

    this.connections.set(config.name, { config, client, transport, tools });
    return tools;
  }

  /**
   * Call a tool on a specific MCP server.
   */
  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const conn = this.connections.get(serverName);
    if (!conn) {
      throw new Error(`MCP server "${serverName}" not connected`);
    }

    console.log(`[MCP] Calling ${serverName}/${toolName}`);
    const result = await conn.client.callTool({ name: toolName, arguments: args });

    // Parse MCP result content array into a single string
    const parts: string[] = [];
    for (const item of result.content as Array<{ type: string; text?: string }>) {
      if (item.type === 'text' && item.text) {
        parts.push(item.text);
      }
    }
    return parts.join('\n') || JSON.stringify(result.content);
  }

  /**
   * Disconnect and remove an MCP server.
   */
  async removeServer(name: string): Promise<boolean> {
    const conn = this.connections.get(name);
    if (!conn) return false;

    try {
      await conn.client.close();
    } catch (err) {
      console.warn(`[MCP] Error closing "${name}":`, err);
    }

    this.connections.delete(name);
    console.log(`[MCP] Removed server "${name}"`);
    return true;
  }

  /** Get tools for a specific server */
  getTools(serverName: string): MCPToolInfo[] {
    return this.connections.get(serverName)?.tools || [];
  }

  /** Get all connected server names */
  listServers(): string[] {
    return Array.from(this.connections.keys());
  }

  /** Check if a server is connected */
  isConnected(name: string): boolean {
    return this.connections.has(name);
  }

  /** Shut down all connections */
  async shutdown(): Promise<void> {
    for (const name of this.connections.keys()) {
      await this.removeServer(name);
    }
  }
}

/** Singleton instance */
export const mcpManager = new MCPManager();
