/**
 * MCP Bridge — Converts MCP server tools into AgentOS Skills.
 *
 * For each MCP server, creates a SkillManifest and handler functions,
 * then registers them with the SkillRegistry so the FC loop can use them.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { mcpManager, type MCPServerConfig, type MCPToolInfo } from './mcpManager.js';
import { skillRegistry, type SkillHandler } from '../skills/registry.js';
import { syncCatalogFromRegistry } from '../skills/userSkills.js';
import type { SkillManifest } from '../adapters/base.js';

const CONFIG_PATH = join(import.meta.dirname, '../../mcp-servers.json');

/**
 * Convert MCP tools from a server into a SkillManifest and register it.
 */
export function registerMCPServerAsSkill(serverName: string, tools: MCPToolInfo[]): void {
  const skillName = `mcp-${serverName}`;

  const manifest: SkillManifest = {
    name: skillName,
    version: '1.0.0',
    description: `MCP Server: ${serverName} (${tools.length} tools)`,
    author: 'MCP',
    agents: '*',
    environments: ['cloud'],
    permissions: ['network'],
    functions: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
    audit: 'unreviewed',
    auditSource: 'MCP',
    category: 'tools',
    emoji: '🔌',
    isDefault: false,
  };

  // Create handlers: each tool calls mcpManager.callTool
  const handlers: Record<string, SkillHandler> = {};
  for (const tool of tools) {
    handlers[tool.name] = async (args: Record<string, unknown>) => {
      return mcpManager.callTool(serverName, tool.name, args);
    };
  }

  skillRegistry.register(manifest, handlers);
  console.log(`[MCP Bridge] Registered skill "${skillName}" with ${tools.length} tools`);
}

/**
 * Unregister a MCP server's skill from the registry.
 */
export function unregisterMCPServerSkill(serverName: string): void {
  const skillName = `mcp-${serverName}`;
  skillRegistry.unregister(skillName);
}

/**
 * Read MCP server configs from the config file.
 */
export function loadMCPConfig(): MCPServerConfig[] {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as MCPServerConfig[];
  } catch {
    return [];
  }
}

/**
 * Write MCP server configs to the config file.
 */
export function saveMCPConfig(configs: MCPServerConfig[]): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2), 'utf-8');
}

/**
 * Initialize all MCP servers from config on startup.
 * Connects to each enabled server and registers its tools as skills.
 */
export async function initMCPServers(): Promise<void> {
  const configs = loadMCPConfig();
  const enabled = configs.filter((c) => c.enabled !== false);

  if (enabled.length === 0) {
    console.log('[MCP Bridge] No MCP servers configured');
    return;
  }

  console.log(`[MCP Bridge] Initializing ${enabled.length} MCP server(s)...`);

  for (const config of enabled) {
    try {
      const tools = await mcpManager.addServer(config);
      registerMCPServerAsSkill(config.name, tools);
    } catch (err) {
      console.error(`[MCP Bridge] Failed to connect to "${config.name}":`, err instanceof Error ? err.message : err);
    }
  }

  // Sync MCP skills to the DB catalog so they appear in the skill library
  await syncCatalogFromRegistry();
}

/**
 * Add a new MCP server at runtime: connect, register, persist to config.
 */
export async function addMCPServer(config: MCPServerConfig): Promise<MCPToolInfo[]> {
  const tools = await mcpManager.addServer(config);
  registerMCPServerAsSkill(config.name, tools);

  // Persist to config file
  const configs = loadMCPConfig();
  const idx = configs.findIndex((c) => c.name === config.name);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  saveMCPConfig(configs);

  return tools;
}

/**
 * Remove an MCP server at runtime: disconnect, unregister, remove from config.
 */
export async function removeMCPServer(name: string): Promise<boolean> {
  unregisterMCPServerSkill(name);
  const removed = await mcpManager.removeServer(name);

  // Remove from config file
  const configs = loadMCPConfig();
  const filtered = configs.filter((c) => c.name !== name);
  saveMCPConfig(filtered);

  return removed;
}
