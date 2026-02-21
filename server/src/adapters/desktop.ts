import type {
  AgentAdapter,
  AgentType,
  AgentConnectOptions,
  AgentChatOptions,
  ChatHistoryItem,
  ToolEventCallback,
  PushMessageCallback,
  SkillManifest,
} from './base.js';

/**
 * DesktopAdapter — server-side representation of a connected desktop client.
 *
 * Unlike OpenClaw/CoPaw (which proxy to external agent backends), the
 * DesktopAdapter delegates chat to the server's built-in LLM providers.
 * Its main purpose is:
 *   1. Track the desktop client's online/offline status
 *   2. Store desktop device capabilities (OS, skills, agent runtimes)
 *   3. Route commands from mobile → desktop (via server relay)
 *   4. Manage desktop-side skill manifests
 *
 * Chat is handled by the server's builtin/byok providers in handler.ts,
 * so DesktopAdapter.chat() is a thin wrapper that throws — the handler
 * should route chat through the LLM provider directly. This adapter
 * is primarily used for desktop registration and command relay.
 */
export class DesktopAdapter implements AgentAdapter {
  readonly name = 'desktop';
  readonly type: AgentType = 'desktop';

  sessionKey = 'desktop-session';
  onToolEvent: ToolEventCallback | null = null;
  onPushMessage: PushMessageCallback | null = null;
  onDisconnect: (() => void) | null = null;

  private _connected = false;
  private _deviceId: string | null = null;
  private _userId: string | null = null;
  private _capabilities: DesktopCapabilities = {};
  private _skills: SkillManifest[] = [];

  async connect(options: AgentConnectOptions): Promise<void> {
    this._deviceId = options.deviceId || null;
    this._userId = options.userId || null;
    this._connected = true;
    console.log(`[Desktop] Client connected: device=${this._deviceId}, user=${this._userId}`);
  }

  isConnected(): boolean {
    return this._connected;
  }

  disconnect(): void {
    this._connected = false;
    console.log(`[Desktop] Client disconnected: device=${this._deviceId}`);
    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  cleanup(): void {
    this.disconnect();
    this.onToolEvent = null;
    this.onPushMessage = null;
    this.onDisconnect = null;
    this._skills = [];
  }

  /**
   * Chat is NOT handled by DesktopAdapter directly.
   * The handler.ts should use a builtin LLM provider for desktop mode chat.
   * This method exists only to satisfy the AgentAdapter interface.
   */
  async *chat(
    _messages: ChatHistoryItem[],
    _options?: AgentChatOptions,
  ): AsyncIterable<string> {
    throw new Error(
      'DesktopAdapter does not handle chat directly. Use builtin LLM provider.',
    );
  }

  // ── Desktop-specific methods ──

  get deviceId(): string | null {
    return this._deviceId;
  }

  get userId(): string | null {
    return this._userId;
  }

  get capabilities(): DesktopCapabilities {
    return this._capabilities;
  }

  /** Called when desktop sends DESKTOP_REGISTER with its capabilities */
  registerCapabilities(caps: DesktopCapabilities): void {
    this._capabilities = caps;
    console.log(`[Desktop] Capabilities registered:`, JSON.stringify(caps));
  }

  // ── Skill management ──

  async listSkills(): Promise<SkillManifest[]> {
    return this._skills;
  }

  /** Called when desktop reports its locally available skills */
  updateSkills(skills: SkillManifest[]): void {
    this._skills = skills;
  }

  async installSkill(manifest: SkillManifest): Promise<void> {
    this._skills.push(manifest);
  }

  async uninstallSkill(skillName: string): Promise<void> {
    this._skills = this._skills.filter((s) => s.name !== skillName);
  }
}

export interface DesktopCapabilities {
  os?: string;
  arch?: string;
  hostname?: string;
  /** Local agent runtimes available (e.g., ["openclaw", "copaw"]) */
  localAgents?: string[];
  /** Locally registered skills */
  localSkills?: string[];
}

// ── Desktop Session Registry ──
// Tracks all connected desktop clients for command routing

const desktopSessions = new Map<string, DesktopAdapter>();

export function registerDesktopSession(userId: string, adapter: DesktopAdapter): void {
  desktopSessions.set(userId, adapter);
}

export function unregisterDesktopSession(userId: string): void {
  desktopSessions.delete(userId);
}

export function getDesktopSession(userId: string): DesktopAdapter | undefined {
  return desktopSessions.get(userId);
}

export function hasDesktopOnline(userId: string): boolean {
  const session = desktopSessions.get(userId);
  return session ? session.isConnected() : false;
}
