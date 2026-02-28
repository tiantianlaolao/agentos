/**
 * CoPaw Bridge — connects AgentOS Server to a local CoPaw Runtime.
 *
 * Architecture:
 *   Phone App <-WS-> AgentOS Server <-WS-> Bridge (this) <-HTTP/SSE-> Local CoPaw Runtime
 *
 * The bridge registers with the AgentOS Server (agentType: 'copaw'),
 * then listens for bridge.chat.request messages. When a request arrives,
 * it sends the chat to the local CoPaw Runtime via HTTP POST /ag-ui (SSE),
 * and streams the response back to the server.
 */

export type CoPawBridgeStatusCallback = (status: CoPawBridgeStatus) => void;

export interface CoPawBridgeStatus {
  serverConnected: boolean;
  copawReachable: boolean;
  bridgeId: string | null;
  error: string | null;
}

export class CoPawBridge {
  private serverWs: WebSocket | null = null;
  private serverUrl: string;
  private authToken: string;
  private copawBaseUrl: string;

  private serverConnected = false;
  private copawReachable = false;
  private bridgeId: string | null = null;
  private autoReconnect = true;
  private serverReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  onStatusChange: CoPawBridgeStatusCallback | null = null;

  constructor(
    serverUrl: string,
    authToken: string,
    copawBaseUrl: string,
  ) {
    this.serverUrl = serverUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    this.authToken = authToken;
    this.copawBaseUrl = copawBaseUrl.replace(/\/+$/, '');
  }

  get status(): CoPawBridgeStatus {
    return {
      serverConnected: this.serverConnected,
      copawReachable: this.copawReachable,
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

  async start(): Promise<void> {
    this.autoReconnect = true;
    // Start health check for local CoPaw
    this.startHealthCheck();
    await this.connectToServer();
  }

  stop(): void {
    this.autoReconnect = false;
    this.clearTimers();
    this.disconnectServer();
    this.emitStatus();
  }

  private clearTimers(): void {
    if (this.serverReconnectTimer) {
      clearTimeout(this.serverReconnectTimer);
      this.serverReconnectTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private startHealthCheck(): void {
    const check = async () => {
      try {
        const resp = await fetch(`${this.copawBaseUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        this.copawReachable = resp.ok;
      } catch {
        this.copawReachable = false;
      }
    };
    check(); // immediate
    this.healthCheckTimer = setInterval(check, 10000);
  }

  // ── Server connection ──

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
        // Send bridge.register with agentType: 'copaw'
        const msg = {
          id: crypto.randomUUID(),
          type: 'bridge.register',
          timestamp: Date.now(),
          payload: {
            authToken: this.authToken,
            agentType: 'copaw',
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
          console.log(`[CoPaw Bridge] Registered with server: bridgeId=${this.bridgeId}`);
          this.emitStatus();
          resolve();
        } else if (type === 'bridge.chat.request') {
          this.handleChatRequest(msg);
        } else if (type === 'error') {
          const payload = msg.payload as Record<string, unknown>;
          const errMsg = (payload?.message as string) || 'Server error';
          console.error(`[CoPaw Bridge] Server error: ${errMsg}`);
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
    console.log('[CoPaw Bridge] Server reconnecting in 5s...');
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

  // ── Chat request handling (Server -> Bridge -> CoPaw HTTP) ──

  private async handleChatRequest(msg: Record<string, unknown>): Promise<void> {
    const payload = msg.payload as Record<string, unknown>;
    const conversationId = payload.conversationId as string;
    const content = payload.content as string;
    const sessionKey = payload.sessionKey as string;

    console.log(`[CoPaw Bridge] Chat request: convId=${conversationId}, content="${content.slice(0, 50)}"`);

    if (!this.copawReachable) {
      this.sendToServer({
        id: crypto.randomUUID(),
        type: 'bridge.chat.error',
        timestamp: Date.now(),
        payload: { conversationId, error: 'Local CoPaw Runtime not reachable' },
      });
      return;
    }

    try {
      const response = await fetch(`${this.copawBaseUrl}/ag-ui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: sessionKey,
          runId: `run_${Date.now()}`,
          messages: [{ id: `msg_${Date.now()}`, role: 'user', content }],
          tools: [],
          context: [],
          forwardedProps: {},
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.sendToServer({
          id: crypto.randomUUID(),
          type: 'bridge.chat.error',
          timestamp: Date.now(),
          payload: { conversationId, error: `CoPaw HTTP ${response.status}: ${text.slice(0, 200)}` },
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        this.sendToServer({
          id: crypto.randomUUID(),
          type: 'bridge.chat.error',
          timestamp: Date.now(),
          payload: { conversationId, error: 'No response body from CoPaw' },
        });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            finished = true;
            break;
          }

          try {
            const event = JSON.parse(dataStr);
            const eventType = event.type as string;

            switch (eventType) {
              case 'TEXT_MESSAGE_CONTENT': {
                const delta = event.delta as string;
                if (delta) {
                  fullContent += delta;
                  this.sendToServer({
                    id: crypto.randomUUID(),
                    type: 'bridge.chat.chunk',
                    timestamp: Date.now(),
                    payload: { conversationId, delta },
                  });
                }
                break;
              }
              case 'RUN_FINISHED':
                finished = true;
                break;
              case 'RUN_ERROR':
                this.sendToServer({
                  id: crypto.randomUUID(),
                  type: 'bridge.chat.error',
                  timestamp: Date.now(),
                  payload: { conversationId, error: event.message || 'CoPaw run error' },
                });
                return;
              case 'TOOL_CALL_START':
                this.sendToServer({
                  id: crypto.randomUUID(),
                  type: 'bridge.skill.event',
                  timestamp: Date.now(),
                  payload: {
                    conversationId,
                    phase: 'start',
                    skillName: event.toolCallName || event.name || 'unknown',
                    data: event.args ? { args: event.args } : undefined,
                  },
                });
                break;
              case 'TOOL_CALL_END':
                this.sendToServer({
                  id: crypto.randomUUID(),
                  type: 'bridge.skill.event',
                  timestamp: Date.now(),
                  payload: {
                    conversationId,
                    phase: 'result',
                    skillName: event.toolCallName || event.name || 'unknown',
                    data: event.result ? { result: event.result } : undefined,
                  },
                });
                break;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Send done
      this.sendToServer({
        id: crypto.randomUUID(),
        type: 'bridge.chat.done',
        timestamp: Date.now(),
        payload: { conversationId, fullContent },
      });
    } catch (err) {
      this.sendToServer({
        id: crypto.randomUUID(),
        type: 'bridge.chat.error',
        timestamp: Date.now(),
        payload: {
          conversationId,
          error: err instanceof Error ? err.message : 'CoPaw bridge chat error',
        },
      });
    }
  }
}
