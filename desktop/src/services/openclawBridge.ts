/**
 * OpenClaw Bridge — connects AgentOS Server to a local OpenClaw Gateway.
 *
 * Architecture:
 *   Phone App <-WS-> AgentOS Server <-WS-> Bridge (this) <-WS-> Local OpenClaw Gateway
 *
 * The bridge registers with the AgentOS Server using the user's auth token,
 * then listens for BRIDGE_CHAT_REQUEST messages. When a request arrives,
 * it sends the chat to the local OpenClaw Gateway via chat.send, streams
 * the response back to the server as BRIDGE_CHAT_CHUNK/DONE/ERROR messages.
 *
 * Both connections are outbound from the user's machine, so no port
 * forwarding or NAT traversal is needed.
 */

import {
  loadOrCreateDeviceIdentity,
  buildDeviceAuthPayload,
  signDevicePayload,
  getPublicKeyBase64Url,
  type DeviceIdentity,
} from './deviceIdentity';

// ── Callbacks ──

export type BridgeStatusCallback = (status: BridgeStatus) => void;

export interface BridgeStatus {
  serverConnected: boolean;
  gatewayConnected: boolean;
  bridgeId: string | null;
  error: string | null;
}

// ── Bridge class ──

export class OpenClawBridge {
  private serverWs: WebSocket | null = null;
  private gatewayWs: WebSocket | null = null;
  private serverUrl: string;
  private authToken: string;
  private gatewayUrl: string;
  private gatewayToken: string;

  private serverConnected = false;
  private gatewayConnected = false;
  private bridgeId: string | null = null;
  private autoReconnect = true;
  private deviceIdentity: DeviceIdentity | null = null;
  private deviceIdentityPromise: Promise<DeviceIdentity> | null = null;

  // Gateway request tracking
  private gatewayPendingRequests = new Map<string, {
    resolve: (payload: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }>();
  private gatewayTextDeltaListeners = new Map<string, (delta: string) => void>();
  private gatewayChatStateListeners = new Map<string, (state: string, payload: Record<string, unknown>) => void>();
  private gatewayToolEventCallback: ((event: { phase: string; name: string; args?: Record<string, unknown>; result?: string }) => void) | null = null;

  // Reconnect timers
  private serverReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private gatewayReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  onStatusChange: BridgeStatusCallback | null = null;

  constructor(
    serverUrl: string,
    authToken: string,
    gatewayUrl: string,
    gatewayToken: string,
  ) {
    this.serverUrl = serverUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    this.authToken = authToken;
    this.gatewayUrl = gatewayUrl.replace(/\/+$/, '').replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    this.gatewayToken = gatewayToken;
  }

  get status(): BridgeStatus {
    return {
      serverConnected: this.serverConnected,
      gatewayConnected: this.gatewayConnected,
      bridgeId: this.bridgeId,
      error: null,
    };
  }

  private emitStatus(error?: string): void {
    this.onStatusChange?.({
      ...this.status,
      error: error || null,
    });
  }

  // ── Device identity (shared with OpenClaw direct client) ──

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

  // ════════════════════════════════════════════════
  // 1. AgentOS Server connection
  // ════════════════════════════════════════════════

  async start(): Promise<void> {
    this.autoReconnect = true;
    await Promise.all([
      this.connectToServer(),
      this.connectToGateway(),
    ]);
  }

  stop(): void {
    this.autoReconnect = false;
    this.clearTimers();
    this.disconnectServer();
    this.disconnectGateway();
    this.emitStatus();
  }

  private clearTimers(): void {
    if (this.serverReconnectTimer) {
      clearTimeout(this.serverReconnectTimer);
      this.serverReconnectTimer = null;
    }
    if (this.gatewayReconnectTimer) {
      clearTimeout(this.gatewayReconnectTimer);
      this.gatewayReconnectTimer = null;
    }
  }

  private async connectToServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.serverWs) {
        try { this.serverWs.close(); } catch { /* ignore */ }
      }
      this.serverConnected = false;

      const ws = new WebSocket(this.serverUrl);
      this.serverWs = ws;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          this.scheduleServerReconnect();
          reject(new Error('Server connection timeout'));
        }
      }, 15000);

      ws.onopen = () => {
        // Send bridge.register message
        const msg = {
          id: crypto.randomUUID(),
          type: 'bridge.register',
          timestamp: Date.now(),
          payload: {
            authToken: this.authToken,
            gatewayUrl: this.gatewayUrl,
          },
        };
        ws.send(JSON.stringify(msg));
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(event.data as string); } catch { return; }

        const type = msg.type as string;

        if (type === 'bridge.registered') {
          const payload = msg.payload as Record<string, unknown>;
          this.serverConnected = true;
          this.bridgeId = payload.bridgeId as string;
          clearTimeout(timeout);
          settled = true;
          console.log(`[Bridge] Registered with server: bridgeId=${this.bridgeId}`);
          this.emitStatus();
          // Send initial gateway status
          this.sendGatewayStatus();
          resolve();
        } else if (type === 'bridge.chat.request') {
          this.handleChatRequest(msg);
        } else if (type === 'error') {
          const payload = msg.payload as Record<string, unknown>;
          const errMsg = (payload?.message as string) || 'Server error';
          console.error(`[Bridge] Server error: ${errMsg}`);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            this.emitStatus(errMsg);
            reject(new Error(errMsg));
          }
        } else if (type === 'pong') {
          // Keepalive response, ignore
        }
      };

      ws.onclose = () => {
        this.serverConnected = false;
        this.bridgeId = null;
        this.emitStatus();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Server connection closed'));
        }
        this.scheduleServerReconnect();
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Server connection error'));
        }
      };
    });
  }

  private disconnectServer(): void {
    this.serverConnected = false;
    this.bridgeId = null;
    if (this.serverWs) {
      try { this.serverWs.close(); } catch { /* ignore */ }
      this.serverWs = null;
    }
  }

  private scheduleServerReconnect(): void {
    if (!this.autoReconnect) return;
    if (this.serverReconnectTimer) return;
    console.log('[Bridge] Server reconnecting in 5s...');
    this.serverReconnectTimer = setTimeout(() => {
      this.serverReconnectTimer = null;
      this.connectToServer().catch(() => {});
    }, 5000);
  }

  private sendToServer(msg: Record<string, unknown>): void {
    if (this.serverWs && this.serverWs.readyState === WebSocket.OPEN) {
      this.serverWs.send(JSON.stringify(msg));
    }
  }

  private sendGatewayStatus(): void {
    this.sendToServer({
      id: crypto.randomUUID(),
      type: 'bridge.status',
      timestamp: Date.now(),
      payload: {
        gatewayConnected: this.gatewayConnected,
        gatewayUrl: this.gatewayUrl,
      },
    });
  }

  // ════════════════════════════════════════════════
  // 2. Local OpenClaw Gateway connection
  // ════════════════════════════════════════════════

  private async connectToGateway(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.gatewayWs) {
        try { this.gatewayWs.close(); } catch { /* ignore */ }
      }
      this.gatewayConnected = false;

      const ws = new WebSocket(this.gatewayUrl);
      this.gatewayWs = ws;
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          this.scheduleGatewayReconnect();
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
            const role = 'operator';
            const scopes = ['operator.admin', 'operator.write'];
            const authToken = this.gatewayToken || undefined;

            // Use token-only auth (no device identity) — gateway accepts this
            ws.send(JSON.stringify({
              type: 'req',
              id: crypto.randomUUID(),
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                role,
                scopes,
                auth: authToken ? { token: authToken } : {},
                client: {
                  id: 'gateway-client',
                  platform: 'desktop',
                  mode: 'backend',
                  version: '0.1.0',
                },
              },
            }));
            return;
          }

          // Agent events -- text deltas + tool events
          if (eventName === 'agent') {
            const stream = payload.stream as string | undefined;
            const agentSessionKey = payload.sessionKey as string | undefined;
            const matchedKey = this.matchGatewaySessionKey(agentSessionKey);

            if (stream === 'assistant' && matchedKey) {
              const agentData = payload.data as Record<string, unknown> | undefined;
              const delta = agentData?.delta as string | undefined;
              if (delta) {
                const listener = this.gatewayTextDeltaListeners.get(matchedKey);
                if (listener) listener(delta);
              }
            }

            if (stream === 'tool') {
              const toolData = payload.data as Record<string, unknown> | undefined;
              if (toolData && this.gatewayToolEventCallback) {
                this.gatewayToolEventCallback({
                  phase: toolData.phase as string,
                  name: toolData.name as string,
                  args: toolData.args as Record<string, unknown> | undefined,
                  result: toolData.result as string | undefined,
                });
              }
            }
          }

          // Chat state events
          if (eventName === 'chat') {
            const chatSessionKey = payload.sessionKey as string | undefined;
            const state = payload.state as string;
            const matchedKey = this.matchGatewaySessionKey(chatSessionKey);
            if (matchedKey) {
              const listener = this.gatewayChatStateListeners.get(matchedKey);
              if (listener) listener(state, payload);
            }
          }
        }

        // Response frames
        if (msg.type === 'res') {
          const id = msg.id as string;

          if (!this.gatewayConnected) {
            if (msg.ok) {
              this.gatewayConnected = true;
              clearTimeout(timeout);
              settled = true;
              console.log('[Bridge] Connected to local OpenClaw Gateway');
              this.emitStatus();
              this.sendGatewayStatus();
              resolve();
            } else {
              clearTimeout(timeout);
              settled = true;
              const err = msg.error as Record<string, unknown> | undefined;
              const errCode = err?.code as string | undefined;
              const errMsg = errCode === 'NOT_PAIRED'
                ? 'Device not paired with OpenClaw Gateway. Approve in Control UI.'
                : String(err?.message || 'Gateway connect failed');
              this.emitStatus(errMsg);
              reject(new Error(errMsg));
            }
            return;
          }

          const pending = this.gatewayPendingRequests.get(id);
          if (pending) {
            this.gatewayPendingRequests.delete(id);
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
        this.gatewayConnected = false;
        this.gatewayWs = null;
        this.emitStatus();
        this.sendGatewayStatus();
        for (const [, pending] of this.gatewayPendingRequests) {
          pending.reject(new Error('Gateway connection closed'));
        }
        this.gatewayPendingRequests.clear();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Gateway connection closed during handshake'));
        }
        this.scheduleGatewayReconnect();
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

  private disconnectGateway(): void {
    this.gatewayConnected = false;
    this.gatewayTextDeltaListeners.clear();
    this.gatewayChatStateListeners.clear();
    for (const [, pending] of this.gatewayPendingRequests) {
      pending.reject(new Error('Bridge stopped'));
    }
    this.gatewayPendingRequests.clear();
    if (this.gatewayWs) {
      try { this.gatewayWs.close(); } catch { /* ignore */ }
      this.gatewayWs = null;
    }
  }

  private scheduleGatewayReconnect(): void {
    if (!this.autoReconnect) return;
    if (this.gatewayReconnectTimer) return;
    console.log('[Bridge] Gateway reconnecting in 5s...');
    this.gatewayReconnectTimer = setTimeout(() => {
      this.gatewayReconnectTimer = null;
      this.connectToGateway().catch(() => {});
    }, 5000);
  }

  private matchGatewaySessionKey(gatewayKey: string | undefined): string | null {
    if (!gatewayKey) return null;
    if (this.gatewayChatStateListeners.has(gatewayKey)) return gatewayKey;
    const stripped = gatewayKey.replace(/^agent:main:/, '');
    if (this.gatewayChatStateListeners.has(stripped)) return stripped;
    return null;
  }

  private gatewayRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.gatewayWs || this.gatewayWs.readyState !== WebSocket.OPEN) {
        reject(new Error('Gateway not connected'));
        return;
      }
      const id = crypto.randomUUID();
      this.gatewayPendingRequests.set(id, { resolve, reject });
      this.gatewayWs.send(JSON.stringify({ type: 'req', id, method, params }));

      setTimeout(() => {
        if (this.gatewayPendingRequests.has(id)) {
          this.gatewayPendingRequests.delete(id);
          reject(new Error(`Gateway request ${method} timed out`));
        }
      }, 120000);
    });
  }

  // ════════════════════════════════════════════════
  // 3. Chat request handling (Server -> Bridge -> Gateway)
  // ════════════════════════════════════════════════

  private async handleChatRequest(msg: Record<string, unknown>): Promise<void> {
    const payload = msg.payload as Record<string, unknown>;
    const conversationId = payload.conversationId as string;
    const content = payload.content as string;
    const sessionKey = payload.sessionKey as string;

    console.log(`[Bridge] Chat request: convId=${conversationId}, content="${content.slice(0, 50)}"`);

    if (!this.gatewayConnected) {
      this.sendToServer({
        id: crypto.randomUUID(),
        type: 'bridge.chat.error',
        timestamp: Date.now(),
        payload: { conversationId, error: 'Local OpenClaw Gateway not connected' },
      });
      return;
    }

    const idempotencyKey = crypto.randomUUID();
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

    // Register text delta listener
    this.gatewayTextDeltaListeners.set(sessionKey, (delta: string) => {
      push({ type: 'delta', text: delta });
    });

    // Register chat state listener
    this.gatewayChatStateListeners.set(sessionKey, (state: string, statePayload: Record<string, unknown>) => {
      if (state === 'final' || state === 'aborted') {
        push({ type: 'done' });
      } else if (state === 'error') {
        push({ type: 'error', message: (statePayload.errorMessage as string) || 'Chat error' });
      }
    });

    // Register tool event forwarding
    this.gatewayToolEventCallback = (event) => {
      this.sendToServer({
        id: crypto.randomUUID(),
        type: 'bridge.skill.event',
        timestamp: Date.now(),
        payload: {
          conversationId,
          phase: event.phase,
          skillName: event.name,
          data: event.args || event.result ? { args: event.args, result: event.result } : undefined,
        },
      });
    };

    try {
      // Send chat.send to local OpenClaw Gateway
      const sendPromise = this.gatewayRequest('chat.send', {
        sessionKey,
        message: content,
        idempotencyKey,
        timeoutMs: 120000,
      });

      sendPromise.catch((err) => {
        if (!finished) push({ type: 'error', message: err.message });
      });

      // Process the queue: stream chunks back to server
      while (!finished) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { queueResolve = resolve; });
        }

        while (queue.length > 0) {
          const item = queue.shift()!;
          if (item.type === 'delta') {
            fullContent += item.text;
            // Send chunk to server
            this.sendToServer({
              id: crypto.randomUUID(),
              type: 'bridge.chat.chunk',
              timestamp: Date.now(),
              payload: { conversationId, delta: item.text },
            });
          } else if (item.type === 'done') {
            finished = true;
            this.sendToServer({
              id: crypto.randomUUID(),
              type: 'bridge.chat.done',
              timestamp: Date.now(),
              payload: { conversationId, fullContent },
            });
            break;
          } else if (item.type === 'error') {
            finished = true;
            this.sendToServer({
              id: crypto.randomUUID(),
              type: 'bridge.chat.error',
              timestamp: Date.now(),
              payload: { conversationId, error: item.message },
            });
            break;
          }
        }
      }
    } catch (err) {
      this.sendToServer({
        id: crypto.randomUUID(),
        type: 'bridge.chat.error',
        timestamp: Date.now(),
        payload: {
          conversationId,
          error: err instanceof Error ? err.message : 'Bridge chat error',
        },
      });
    } finally {
      this.gatewayTextDeltaListeners.delete(sessionKey);
      this.gatewayChatStateListeners.delete(sessionKey);
      this.gatewayToolEventCallback = null;
    }
  }
}
