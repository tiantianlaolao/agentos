/**
 * AgentOS Shared Interface Contracts
 *
 * THIS FILE IS THE SOURCE OF TRUTH for all agent/skill interfaces.
 * All three workstreams (Skills, Adapter+CoPaw, Desktop) MUST use these types.
 * Do NOT define parallel interfaces elsewhere.
 *
 * Changes to this file must be coordinated through the team lead.
 */

// ============================================================
// 1. SkillManifest — Unified Skill description format
// ============================================================

export interface SkillManifest {
  /** Unique skill identifier, e.g. "weather", "file-manager" */
  name: string;
  /** Semver version */
  version: string;
  /** Human-readable description (also shown to LLM for tool selection) */
  description: string;
  /** Author or source organization */
  author: string;

  /** Which agents can use this skill. "*" = universal, or specific agent names */
  agents: string[] | '*';
  /** Where this skill can run */
  environments: SkillEnvironment[];

  /** Required permissions */
  permissions: SkillPermission[];

  /** Function definitions in OpenAI Function Calling format (MCP compatible) */
  functions: SkillFunction[];

  /** Trust/audit status */
  audit: SkillAuditLevel;
  /** Visual trust badge shown in UI */
  auditSource?: string; // e.g. "AgentOS", "ClawHub", "CoPaw Community"

  /** Skill category for Library grouping */
  category?: SkillCategory;
  /** Emoji icon shown in Library UI */
  emoji?: string;

  /** Whether this skill is auto-installed for new users (default: true for public skills) */
  isDefault?: boolean;

  /** User-configurable fields for this skill (e.g. API keys) */
  config?: SkillConfigField[];

  /** Skill visibility: 'public' (default) | 'private' (only owner can see/use) */
  visibility?: 'public' | 'private';
  /** Owner identifier (phone number) — required when visibility='private' */
  owner?: string;
}

export interface SkillConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  /** If true, value is masked in UI (like a password field) */
  secret?: boolean;
  description?: string;
  defaultValue?: string | number | boolean;
}

export type SkillCategory =
  | 'tools'
  | 'knowledge'
  | 'productivity'
  | 'finance'
  | 'creative'
  | 'general';

export type SkillEnvironment = 'cloud' | 'desktop' | 'mobile';

export type SkillPermission =
  | 'network'       // HTTP/WS requests
  | 'filesystem'    // Read/write files
  | 'browser'       // Browser automation
  | 'contacts'      // Address book access
  | 'location'      // GPS
  | 'camera'        // Camera/photos
  | 'system'        // OS-level operations
  | 'exec';         // Execute arbitrary commands

export interface SkillFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export type SkillAuditLevel =
  | 'platform'     // 🟢 AgentOS official, fully trusted
  | 'ecosystem'    // 🟡🔵 Reviewed by agent ecosystem (ClawHub, CoPaw Community)
  | 'unreviewed';  // ⚪ User assumes risk

// ============================================================
// 2. AgentAdapter — Unified Agent interface
// ============================================================

export interface AgentAdapter {
  /** Human-readable adapter name, e.g. "openclaw", "copaw", "desktop" */
  readonly name: string;

  /** Agent type identifier matching ConnectionMode */
  readonly type: AgentType;

  // --- Connection lifecycle ---

  /** Establish connection to the agent backend */
  connect(options: AgentConnectOptions): Promise<void>;

  /** Check if currently connected */
  isConnected(): boolean;

  /** Gracefully disconnect */
  disconnect(): void;

  /** Full cleanup (disconnect + release resources) */
  cleanup(): void;

  // --- Chat ---

  /** Send a message and stream the response */
  chat(messages: ChatHistoryItem[], options?: AgentChatOptions): AsyncIterable<string>;

  /** Session key for conversation isolation */
  sessionKey: string;

  // --- Callbacks ---

  /** Tool/skill execution events (forwarded to mobile client as SKILL_START/SKILL_RESULT) */
  onToolEvent: ToolEventCallback | null;

  /** Push messages from background tasks (cron, scheduled) */
  onPushMessage: PushMessageCallback | null;

  /** Connection lost callback */
  onDisconnect: (() => void) | null;

  // --- Skill management (optional, not all adapters support it) ---

  /** List skills available on this agent */
  listSkills?(): Promise<SkillManifest[]>;

  /** Install a skill on this agent */
  installSkill?(manifest: SkillManifest): Promise<void>;

  /** Uninstall a skill from this agent */
  uninstallSkill?(skillName: string): Promise<void>;

  /** Enable/disable a skill */
  setSkillEnabled?(skillName: string, enabled: boolean): Promise<void>;
}

export type AgentType = 'builtin' | 'openclaw' | 'copaw' | 'desktop';

export interface AgentConnectOptions {
  url?: string;
  token?: string;
  deviceId?: string;
  userId?: string;
  /** Additional adapter-specific options */
  [key: string]: unknown;
}

export interface AgentChatOptions {
  signal?: AbortSignal;
}

// ============================================================
// 3. Shared callback types
// ============================================================

export interface ToolEvent {
  phase: 'start' | 'result' | 'error';
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
}

export type ToolEventCallback = (event: ToolEvent) => void;
export type PushMessageCallback = (content: string) => void;

// ============================================================
// 4. Chat types (shared between adapters)
// ============================================================

export interface ChatHistoryItem {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ============================================================
// 5. LLMProvider — Legacy interface (still used by builtin/byok)
// ============================================================

export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatHistoryItem[], options?: AgentChatOptions): AsyncIterable<string>;
}

/**
 * Type guard: check if a provider is a full AgentAdapter (vs simple LLMProvider)
 * Use this instead of `instanceof` checks in handler.ts
 */
export function isAgentAdapter(provider: LLMProvider | AgentAdapter): provider is AgentAdapter {
  return 'type' in provider && 'onToolEvent' in provider && 'sessionKey' in provider;
}
