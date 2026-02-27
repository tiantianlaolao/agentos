/**
 * Direct OpenClaw Gateway client for desktop.
 * Connects directly to the user's self-hosted OpenClaw Gateway,
 * bypassing the AgentOS server entirely.
 *
 * Implements Gateway WS protocol v3:
 * - Challenge-response authentication with device identity
 * - chat.send for chat with full agent context
 * - Agent events for per-token streaming
 * - Chat events for final/error/aborted states
 * - Push messages from cron/scheduled tasks
 */

import {
  loadOrCreateDeviceIdentity,
  buildDeviceAuthPayload,
  signDevicePayload,
  getPublicKeyBase64Url,
  type DeviceIdentity,
} from './deviceIdentity';

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: string) => void;
}

export interface ToolEvent {
  phase: 'start' | 'result' | 'error';
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export type PushCallback = (content: string) => void;
export type ToolEventCallback = (event: ToolEvent) => void;
export type ConnectionCallback = (connected: boolean) => void;
export type PairingErrorCallback = (message: string) => void;

export class OpenClawDirectClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private token: string;
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private deviceIdentity: DeviceIdentity | null = null;
  private deviceIdentityPromise: Promise<DeviceIdentity> | null = null;

  // Request/response tracking
  private pendingRequests = new Map<string, {
    resolve: (payload: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }>();

  // Streaming listeners keyed by sessionKey
  private textDeltaListeners = new Map<string, (delta: string) => void>();
  private chatStateListeners = new Map<string, (state: string, payload: Record<string, unknown>) => void>();

  // Push message accumulators per run
  private pushAccumulators = new Map<string, string>();

  // Session key for conversation isolation
  sessionKey = 'agentos-session';

  // Callbacks
  onPush: PushCallback | null = null;
  onToolEvent: ToolEventCallback | null = null;
  onConnectionChange: ConnectionCallback | null = null;
  onPairingError: PairingErrorCallback | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private autoReconnect = true;

  constructor(url: string, token: string) {
    this.wsUrl = url.replace(/\/+$/, '').replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    this.token = token;
  }

  get isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  private async ensureDeviceIdentity(): Promise<DeviceIdentity> {
    if (this.deviceIdentity) return this.deviceIdentity;
    if (!this.deviceIdentityPromise) {
      this.deviceIdentityPromise = loadOrCreateDeviceIdentity().then((id) => {
        this.deviceIdentity = id;
        this.deviceIdentityPromise = null;
        return id;
      });
    }
    return this.deviceIdentityPromise;
  }

  async ensureConnected(): Promise<void> {
    if (this.isConnected) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this._connect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async _connect(): Promise<void> {
    // Only load device identity if no token (device auth fallback)
    const identity = this.token ? null : await this.ensureDeviceIdentity();

    return new Promise((resolve, reject) => {
      if (this.ws) {
        try { this.ws.close(); } catch { /* ignore */ }
      }
      this.connected = false;

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

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(event.data as string); } catch { return; }

        // Event frames
        if (msg.type === 'event' || (!msg.type && msg.event)) {
          const eventName = msg.event as string;
          const payload = (msg.payload || {}) as Record<string, unknown>;

          if (eventName === 'connect.challenge') {
            const nonce = typeof payload.nonce === 'string' ? payload.nonce : undefined;

            const role = 'operator';
            const scopes = ['operator.admin', 'operator.write'];
            const clientId = 'gateway-client';
            const clientMode = 'backend';
            const signedAtMs = Date.now();
            const authToken = this.token || undefined;

            // Build connect params — use token-only auth when token available,
            // fall back to device identity when no token.
            const connectParams: Record<string, unknown> = {
              minProtocol: 3,
              maxProtocol: 3,
              role,
              scopes,
              auth: authToken ? { token: authToken } : {},
              client: {
                id: clientId,
                platform: 'desktop',
                mode: clientMode,
                version: '0.1.0',
              },
            };

            // Only include device identity if no token (selfhosted without token)
            if (!authToken && identity) {
              const devicePayload = buildDeviceAuthPayload({
                deviceId: identity.deviceId,
                clientId,
                clientMode,
                role,
                scopes,
                signedAtMs,
                token: null,
                nonce,
              });
              const signature = signDevicePayload(identity.secretKey, devicePayload);
              connectParams.device = {
                id: identity.deviceId,
                publicKey: getPublicKeyBase64Url(identity),
                signature,
                signedAt: signedAtMs,
                nonce,
              };
            }

            ws.send(JSON.stringify({
              type: 'req',
              id: crypto.randomUUID(),
              method: 'connect',
              params: connectParams,
            }));
            return;
          }

          // Agent events -- text deltas + tool events
          if (eventName === 'agent') {
            const stream = payload.stream as string | undefined;
            const agentSessionKey = payload.sessionKey as string | undefined;
            const matchedKey = this._matchSessionKey(agentSessionKey);

            if (stream === 'assistant' && matchedKey) {
              const agentData = payload.data as Record<string, unknown> | undefined;
              const delta = agentData?.delta as string | undefined;
              if (delta) {
                const listener = this.textDeltaListeners.get(matchedKey);
                if (listener) listener(delta);
              }
            }

            if (stream === 'tool') {
              const toolData = payload.data as Record<string, unknown> | undefined;
              if (toolData && this.onToolEvent) {
                this.onToolEvent({
                  phase: toolData.phase as ToolEvent['phase'],
                  name: toolData.name as string,
                  args: toolData.args as Record<string, unknown> | undefined,
                  result: toolData.result,
                });
              }
            }
          }

          // Chat state events
          if (eventName === 'chat') {
            const chatSessionKey = payload.sessionKey as string | undefined;
            const state = payload.state as string;

            const matchedKey = this._matchSessionKey(chatSessionKey);
            if (matchedKey) {
              const listener = this.chatStateListeners.get(matchedKey);
              if (listener) listener(state, payload);
            }

            // Push messages from cron/scheduled sessions
            const isUserSession = chatSessionKey?.includes('agentos-') ?? false;
            if (!matchedKey && !isUserSession && this.onPush) {
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
                if (text) this.onPush(text);
                this.pushAccumulators.delete(runKey);
              }
            }
          }
        }

        // Response frames
        if (msg.type === 'res') {
          const id = msg.id as string;

          if (!this.connected) {
            if (msg.ok) {
              this.connected = true;
              clearTimeout(timeout);
              settled = true;
              this.onConnectionChange?.(true);
              resolve();
            } else {
              clearTimeout(timeout);
              settled = true;
              const err = msg.error as Record<string, unknown> | undefined;
              const errCode = err?.code as string | undefined;
              if (errCode === 'NOT_PAIRED') {
                const pairingMsg = 'Device not yet paired. Please approve this device in the OpenClaw Control UI or Telegram bot, then retry.';
                this.onPairingError?.(pairingMsg);
                reject(new Error(pairingMsg));
              } else {
                reject(new Error(String(err?.message || 'Gateway connect failed')));
              }
            }
            return;
          }

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
      };

      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.onConnectionChange?.(false);
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error('Gateway connection closed'));
        }
        this.pendingRequests.clear();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Gateway connection closed during handshake'));
        }
        // Auto-reconnect with 5s delay
        if (this.autoReconnect) {
          this.reconnectTimer = setTimeout(() => {
            console.log('[OpenClaw Direct] Reconnecting...');
            this.ensureConnected().catch(() => {});
          }, 5000);
        }
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Gateway connection error'));
        }
      };
    });
  }

  private _matchSessionKey(gatewayKey: string | undefined): string | null {
    if (!gatewayKey) return null;
    if (this.chatStateListeners.has(gatewayKey)) return gatewayKey;
    const stripped = gatewayKey.replace(/^agent:main:/, '');
    if (this.chatStateListeners.has(stripped)) return stripped;
    return null;
  }

  private _request(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway not connected'));
        return;
      }
      const id = crypto.randomUUID();
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 120000);
    });
  }

  /**
   * Send a chat message and stream the response via callbacks.
   */
  async sendChat(
    content: string,
    callbacks: StreamCallbacks,
    options?: { onToolEvent?: ToolEventCallback; signal?: AbortSignal },
  ): Promise<void> {
    await this.ensureConnected();

    const sessionKey = this.sessionKey;
    const idempotencyKey = crypto.randomUUID();

    // Set up tool event forwarding for this chat
    const prevToolCb = this.onToolEvent;
    if (options?.onToolEvent) {
      this.onToolEvent = options.onToolEvent;
    }

    let fullContent = '';
    let finished = false;

    type QueueItem = { type: 'delta'; text: string } | { type: 'done' } | { type: 'error'; message: string };
    const queue: QueueItem[] = [];
    let queueResolve: (() => void) | null = null;

    const push = (item: QueueItem) => {
      queue.push(item);
      if (queueResolve) {
        const r = queueResolve;
        queueResolve = null;
        r();
      }
    };

    this.textDeltaListeners.set(sessionKey, (delta: string) => {
      push({ type: 'delta', text: delta });
    });

    this.chatStateListeners.set(sessionKey, (state: string, payload: Record<string, unknown>) => {
      if (state === 'final' || state === 'aborted') {
        push({ type: 'done' });
      } else if (state === 'error') {
        push({ type: 'error', message: (payload.errorMessage as string) || 'Chat error' });
      }
    });

    try {
      const sendPromise = this._request('chat.send', {
        sessionKey,
        message: content,
        idempotencyKey,
        timeoutMs: 120000,
      });

      if (options?.signal) {
        const onAbort = () => {
          this._request('chat.abort', { sessionKey }).catch(() => {});
          push({ type: 'done' });
        };
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      sendPromise.catch((err) => {
        if (!finished) push({ type: 'error', message: err.message });
      });

      while (!finished) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { queueResolve = resolve; });
        }

        while (queue.length > 0) {
          const item = queue.shift()!;
          if (item.type === 'delta') {
            fullContent += item.text;
            callbacks.onChunk(item.text);
          } else if (item.type === 'done') {
            finished = true;
            callbacks.onDone(fullContent);
            break;
          } else if (item.type === 'error') {
            finished = true;
            callbacks.onError(item.message);
            break;
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
      this.onToolEvent = prevToolCb;
    }
  }

  /**
   * Query skills from Gateway via skills.status WS method.
   */
  async listSkills(): Promise<Array<{
    name: string;
    description: string;
    emoji?: string;
    eligible?: boolean;
    disabled?: boolean;
    source?: string;
  }>> {
    await this.ensureConnected();
    try {
      const result = await this._request('skills.status', {});
      const skills = result.skills as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(skills)) return [];
      return skills.map((s) => ({
        name: s.name as string,
        description: (s.description as string) || '',
        emoji: s.emoji as string | undefined,
        eligible: s.eligible as boolean | undefined,
        disabled: s.disabled as boolean | undefined,
        source: s.source as string | undefined,
      }));
    } catch (err) {
      console.log('[OpenClaw Direct] listSkills failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  disconnect(): void {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
    this.chatStateListeners.clear();
    this.textDeltaListeners.clear();
    this.pushAccumulators.clear();
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
    this.onPairingError = null;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }
}
