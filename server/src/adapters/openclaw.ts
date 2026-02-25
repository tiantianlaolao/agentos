import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentAdapter,
  AgentType,
  AgentConnectOptions,
  AgentChatOptions,
  ChatHistoryItem,
  ToolEvent,
  ToolEventCallback,
  PushMessageCallback,
  SkillManifest,
} from './base.js';
import {
  loadOrCreateDeviceIdentity,
  buildDeviceAuthPayload,
  signDevicePayload,
  publicKeyRawBase64Url,
  type DeviceIdentity,
} from './device-identity.js';

/**
 * OpenClaw Gateway adapter — full WebSocket protocol.
 *
 * Uses the Gateway WS `chat.send` method for chat, which provides
 * complete agent context: memory, session history, skills, and tools.
 *
 * Streaming uses `agent` events (stream: "assistant") for per-token deltas,
 * and `chat` events for final/error/aborted states.
 *
 * Note: Gateway prefixes sessionKey with "agent:main:", so we match by suffix.
 */
export class OpenClawAdapter implements AgentAdapter {
  readonly name = 'openclaw';
  readonly type: AgentType = 'openclaw';

  private wsUrl: string;
  private token: string;
  private ws: WebSocket | null = null;
  private wsConnected = false;
  private wsConnectPromise: Promise<void> | null = null;
  private deviceIdentity: DeviceIdentity;

  // Pending response resolvers by request id
  private pendingRequests = new Map<string, {
    resolve: (payload: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }>();

  // Chat state listeners keyed by original sessionKey (without prefix)
  // Handles: final, error, aborted
  private chatStateListeners = new Map<string, (state: string, payload: Record<string, unknown>) => void>();

  // Agent text delta listeners keyed by original sessionKey
  private textDeltaListeners = new Map<string, (delta: string) => void>();

  /** Optional callback for forwarding tool events to the mobile client. */
  onToolEvent: ToolEventCallback | null = null;

  /** Optional callback for push messages (cron jobs, scheduled tasks). */
  onPushMessage: PushMessageCallback | null = null;

  /** Called when the Gateway WS connection closes (for reconnect logic). */
  onDisconnect: (() => void) | null = null;

  // Tracks push message accumulation per run (supports concurrent runs)
  private pushAccumulators = new Map<string, string>();

  constructor(url: string, token?: string) {
    // Ensure ws:// prefix
    this.wsUrl = url.replace(/\/+$/, '').replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    this.token = token || '';
    this.deviceIdentity = loadOrCreateDeviceIdentity();
    console.log(`[OpenClaw] Device ID: ${this.deviceIdentity.deviceId}`);
  }

  // --- AgentAdapter lifecycle ---

  async connect(options?: AgentConnectOptions): Promise<void> {
    if (options?.url) {
      this.wsUrl = options.url.replace(/\/+$/, '').replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    }
    if (options?.token) {
      this.token = options.token;
    }
    await this.ensureConnected();
  }

  isConnected(): boolean {
    return this.wsConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.wsConnected = false;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  /**
   * Match a Gateway sessionKey (which has "agent:main:" prefix) to our original key.
   */
  private matchSessionKey(gatewayKey: string | undefined): string | null {
    if (!gatewayKey) return null;
    // Try exact match first
    if (this.chatStateListeners.has(gatewayKey)) return gatewayKey;
    // Strip "agent:main:" prefix and try again
    const stripped = gatewayKey.replace(/^agent:main:/, '');
    if (this.chatStateListeners.has(stripped)) return stripped;
    return null;
  }

  /**
   * Ensure a WS connection to the gateway is established.
   */
  async ensureConnected(): Promise<void> {
    if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) return;
    if (this.wsConnectPromise) return this.wsConnectPromise;
    this.wsConnectPromise = this._connectWS();
    try {
      await this.wsConnectPromise;
    } finally {
      this.wsConnectPromise = null;
    }
  }

  private _connectWS(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        try { this.ws.close(); } catch { /* ignore */ }
      }
      this.wsConnected = false;

      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error('Gateway connection timeout'));
        }
      }, 15000);

      ws.on('message', (data) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        // Event frames
        if (msg.type === 'event' || (!msg.type && msg.event)) {
          const event = msg.event as string;
          const payload = (msg.payload || {}) as Record<string, unknown>;

          if (event === 'connect.challenge') {
            // Extract nonce from challenge for device auth v2
            const challengePayload = payload as { nonce?: string };
            const nonce = typeof challengePayload.nonce === 'string' ? challengePayload.nonce : undefined;

            const role = 'operator';
            const scopes = ['operator.admin', 'operator.write'];
            const clientId = 'gateway-client';
            const clientMode = 'backend';
            const signedAtMs = Date.now();
            const authToken = this.token || undefined;

            // Build and sign device auth payload
            const deviceAuthPayload = buildDeviceAuthPayload({
              deviceId: this.deviceIdentity.deviceId,
              clientId,
              clientMode,
              role,
              scopes,
              signedAtMs,
              token: authToken ?? null,
              nonce,
            });
            const signature = signDevicePayload(this.deviceIdentity.privateKeyPem, deviceAuthPayload);

            ws.send(JSON.stringify({
              type: 'req',
              id: uuidv4(),
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                role,
                scopes,
                auth: authToken ? { token: authToken } : {},
                client: {
                  id: clientId,
                  platform: 'linux',
                  mode: clientMode,
                  version: '0.1.0',
                },
                device: {
                  id: this.deviceIdentity.deviceId,
                  publicKey: publicKeyRawBase64Url(this.deviceIdentity.publicKeyPem),
                  signature,
                  signedAt: signedAtMs,
                  nonce,
                },
              },
            }));
            return;
          }

          // Agent events — text deltas + tool events
          if (event === 'agent') {
            const stream = payload.stream as string | undefined;
            const agentSessionKey = payload.sessionKey as string | undefined;
            const matchedKey = this.matchSessionKey(agentSessionKey);

            // Per-token text streaming
            if (stream === 'assistant' && matchedKey) {
              const agentData = payload.data as Record<string, unknown> | undefined;
              const delta = agentData?.delta as string | undefined;
              if (delta) {
                const listener = this.textDeltaListeners.get(matchedKey);
                if (listener) listener(delta);
              }
            }

            // Tool events → forward to mobile client
            if (stream === 'tool') {
              const toolData = payload.data as Record<string, unknown> | undefined;
              if (toolData && this.onToolEvent) {
                this.onToolEvent({
                  phase: toolData.phase as ToolEvent['phase'],
                  name: toolData.name as string,
                  args: toolData.args as Record<string, unknown> | undefined,
                  result: toolData.result as string | undefined,
                });
              }
            }
          }

          // Chat state events → final, error, aborted
          if (event === 'chat') {
            const chatSessionKey = payload.sessionKey as string | undefined;
            const state = payload.state as string;

            // Check if this is a user-initiated chat (matches registered listener)
            const matchedKey = this.matchSessionKey(chatSessionKey);
            if (matchedKey) {
              const listener = this.chatStateListeners.get(matchedKey);
              if (listener) listener(state, payload);
            }

            // Push messages: only from cron/scheduled sessions, NOT user chat sessions.
            // User sessions have "agentos-" in sessionKey; skip those to avoid duplicates.
            const isUserSession = chatSessionKey?.includes('agentos-') ?? false;
            if (!matchedKey && !isUserSession && this.onPushMessage) {
              const runKey = (payload.runId as string) || chatSessionKey || 'unknown';
              if (state === 'delta') {
                const pmsg = payload.message as Record<string, unknown> | undefined;
                if (pmsg && Array.isArray(pmsg.content)) {
                  const text = (pmsg.content as Array<{ type: string; text: string }>)
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('');
                  this.pushAccumulators.set(runKey, text);
                }
              } else if (state === 'final') {
                const pmsg = payload.message as Record<string, unknown> | undefined;
                let text = this.pushAccumulators.get(runKey) || '';
                if (pmsg && Array.isArray(pmsg.content)) {
                  text = (pmsg.content as Array<{ type: string; text: string }>)
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('');
                }
                if (text) {
                  console.log(`[OpenClaw] Push from: ${chatSessionKey}`);
                  this.onPushMessage(text);
                }
                this.pushAccumulators.delete(runKey);
              }
            }
          }
        }

        // Response frames → resolve pending requests
        if (msg.type === 'res') {
          const id = msg.id as string;

          // Handle connect response
          if (!this.wsConnected) {
            if (msg.ok) {
              this.wsConnected = true;
              // Store device token if returned by Gateway
              const helloPayload = msg.payload as Record<string, unknown> | undefined;
              const authInfo = helloPayload?.auth as Record<string, unknown> | undefined;
              if (authInfo?.deviceToken) {
                console.log('[OpenClaw] Received device token from Gateway');
              }
              console.log('[OpenClaw] Gateway WS connected (full agent mode, device authenticated)');
              clearTimeout(timeout);
              settled = true;
              resolve();
            } else {
              clearTimeout(timeout);
              settled = true;
              const err = msg.error as Record<string, unknown> | undefined;
              const errCode = err?.code as string | undefined;
              if (errCode === 'NOT_PAIRED') {
                const details = err?.details as Record<string, unknown> | undefined;
                console.error('[OpenClaw] Device not paired! Request ID:', details?.requestId);
                console.error('[OpenClaw] Please approve this device in the OpenClaw Control UI or via:');
                console.error(`[OpenClaw]   openclaw gateway call device.pair.approve '{"requestId":"${details?.requestId}"}'`);
                reject(new Error('Device not paired. Approve in OpenClaw Control UI or CLI.'));
              } else {
                reject(new Error(String(err?.message || 'Gateway connect failed')));
              }
            }
            return;
          }

          // Handle other responses
          const pending = this.pendingRequests.get(id);
          if (pending) {
            this.pendingRequests.delete(id);
            if (msg.ok) {
              pending.resolve((msg.payload || {}) as Record<string, unknown>);
            } else {
              const err = msg.error as Record<string, unknown> | undefined;
              pending.reject(new Error(String(err?.message || 'Request failed')));
            }
          }
        }
      });

      ws.on('close', () => {
        this.wsConnected = false;
        this.ws = null;
        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Gateway connection closed'));
        }
        this.pendingRequests.clear();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Gateway connection closed during handshake'));
        }
        // Notify disconnect listener (for reconnect logic)
        if (this.onDisconnect) {
          this.onDisconnect();
        }
      });

      ws.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Gateway error: ${err.message}`));
        }
      });
    });
  }

  /**
   * Send a request to the gateway and wait for its response.
   */
  private request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway not connected'));
        return;
      }

      const id = uuidv4();
      this.pendingRequests.set(id, { resolve, reject });

      this.ws.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params,
      }));

      // Timeout for individual requests
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 120000);
    });
  }

  /**
   * Stream a chat via WS `chat.send`. Yields text chunks.
   *
   * Uses `agent` events (stream: "assistant", data.delta) for per-token streaming,
   * and `chat` events for final/error/aborted signals.
   */
  /** Session key used for conversation isolation. Defaults to 'agentos-session'. */
  sessionKey = 'agentos-session';

  async *chat(
    messages: ChatHistoryItem[],
    options?: AgentChatOptions
  ): AsyncIterable<string> {
    await this.ensureConnected();

    // Extract the latest user message
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) return;

    const sessionKey = this.sessionKey;
    const idempotencyKey = uuidv4();

    // Create a promise-based queue for streaming chunks
    type QueueItem = { type: 'delta'; text: string } | { type: 'done' } | { type: 'error'; message: string };
    const queue: QueueItem[] = [];
    let queueResolve: (() => void) | null = null;
    let finished = false;

    const push = (item: QueueItem) => {
      queue.push(item);
      if (queueResolve) {
        const r = queueResolve;
        queueResolve = null;
        r();
      }
    };

    // Register text delta listener (agent events, per-token)
    this.textDeltaListeners.set(sessionKey, (delta: string) => {
      push({ type: 'delta', text: delta });
    });

    // Register chat state listener (chat events, final/error/aborted)
    this.chatStateListeners.set(sessionKey, (state: string, payload: Record<string, unknown>) => {
      if (state === 'final') {
        push({ type: 'done' });
      } else if (state === 'error') {
        push({ type: 'error', message: (payload.errorMessage as string) || 'Chat error' });
      } else if (state === 'aborted') {
        push({ type: 'done' });
      }
      // Ignore 'delta' from chat events — we use agent events for streaming
    });

    try {
      // Send chat.send request
      console.log('[OpenClaw] chat.send:', lastUserMsg.content.slice(0, 80));
      const sendPromise = this.request('chat.send', {
        sessionKey,
        message: lastUserMsg.content,
        idempotencyKey,
        timeoutMs: 120000,
      });

      // Handle abort
      if (options?.signal) {
        const onAbort = () => {
          this.request('chat.abort', { sessionKey }).catch(() => {});
          push({ type: 'done' });
        };
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      // Handle chat.send response error (non-streaming error)
      sendPromise.catch((err) => {
        if (!finished) {
          push({ type: 'error', message: err.message });
        }
      });

      // Yield chunks as they arrive
      while (!finished) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { queueResolve = resolve; });
        }

        while (queue.length > 0) {
          const item = queue.shift()!;
          if (item.type === 'delta') {
            yield item.text;
          } else if (item.type === 'done') {
            finished = true;
            break;
          } else if (item.type === 'error') {
            finished = true;
            throw new Error(`OpenClaw: ${item.message}`);
          }
        }

        if (options?.signal?.aborted) {
          finished = true;
          break;
        }
      }
    } finally {
      this.textDeltaListeners.delete(sessionKey);
      this.chatStateListeners.delete(sessionKey);
    }
  }

  // --- Skill management ---

  // Cache skill list to avoid repeated Gateway round-trips
  private skillsCache: SkillManifest[] | null = null;
  private skillsCacheTime = 0;
  private static SKILLS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async listSkills(): Promise<SkillManifest[]> {
    // Return cache if fresh
    if (this.skillsCache && Date.now() - this.skillsCacheTime < OpenClawAdapter.SKILLS_CACHE_TTL) {
      return this.skillsCache;
    }

    try {
      await this.ensureConnected();
      const result = await this.request('skills.status', {}) as {
        skills?: Array<{
          name: string;
          description?: string;
          emoji?: string;
          source?: string;
          eligible?: boolean;
          disabled?: boolean;
          missing?: { bins?: string[]; env?: string[]; os?: string[] };
        }>;
      };

      if (!result.skills || !Array.isArray(result.skills)) {
        return this.skillsCache || [];
      }

      this.skillsCache = result.skills.map((s) => ({
        name: s.name,
        version: '1.0.0',
        description: s.description || '',
        author: s.source || 'OpenClaw',
        agents: ['openclaw'],
        environments: ['cloud'],
        permissions: [],
        functions: [],
        audit: 'ecosystem' as const,
        auditSource: 'OpenClaw',
        // Extra metadata for display
        emoji: s.emoji,
        eligible: s.eligible ?? false,
        disabled: s.disabled ?? false,
      }));
      this.skillsCacheTime = Date.now();
      console.log(`[OpenClaw] Fetched ${this.skillsCache.length} skills`);
      return this.skillsCache;
    } catch (err) {
      console.error('[OpenClaw] listSkills failed:', err instanceof Error ? err.message : err);
      return this.skillsCache || [];
    }
  }

  async installSkill(manifest: SkillManifest): Promise<void> {
    try {
      await this.ensureConnected();
      await this.request('skills.install', { name: manifest.name });
      console.log(`[OpenClaw] Skill "${manifest.name}" installed`);
      this.skillsCache = null; // Invalidate cache
    } catch (err) {
      // Gateway may not support skills.install yet — log and continue
      console.log(`[OpenClaw] installSkill not available: ${err instanceof Error ? err.message : err}`);
    }
  }

  async uninstallSkill(skillName: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.request('skills.uninstall', { name: skillName });
      console.log(`[OpenClaw] Skill "${skillName}" uninstalled`);
      this.skillsCache = null; // Invalidate cache
    } catch (err) {
      // Gateway may not support skills.uninstall yet — log and continue
      console.log(`[OpenClaw] uninstallSkill not available: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Close connections. */
  cleanup(): void {
    this.wsConnected = false;
    this.chatStateListeners.clear();
    this.textDeltaListeners.clear();
    this.pushAccumulators.clear();
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Adapter cleanup'));
    }
    this.pendingRequests.clear();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }
}
