/**
 * WebSocket client service.
 * Manages connection to AgentOS server and message handling.
 *
 * TODO: Implement in Step 1 (frontend agent):
 * - Connection lifecycle (connect, reconnect, heartbeat)
 * - Message sending and receiving
 * - Stream handling (chat.chunk -> chat.done)
 * - Integration with chatStore
 */

import {
  MessageType,
  type ClientMessage,
  type ServerMessage,
  type ConnectionMode,
  type LLMProvider,
} from '../types/protocol';

type MessageHandler = (message: ServerMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(mode: ConnectionMode, options?: { provider?: LLMProvider; apiKey?: string; openclawUrl?: string }): void {
    this.disconnect();

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.sendConnect(mode, options);
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as ServerMessage;
        this.dispatch(message);
      } catch {
        console.error('[WS] Failed to parse message');
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      this.dispatch({
        id: '',
        type: MessageType.ERROR,
        timestamp: Date.now(),
        payload: { code: 'CONNECTION_CLOSED' as never, message: 'Connection closed' },
      } as never);
      this.scheduleReconnect(mode, options);
    };

    this.ws.onerror = () => {
      console.error('[WS] Connection error');
    };
  }

  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private sendConnect(
    mode: ConnectionMode,
    options?: { provider?: LLMProvider; apiKey?: string; openclawUrl?: string }
  ): void {
    this.send({
      id: crypto.randomUUID(),
      type: MessageType.CONNECT,
      timestamp: Date.now(),
      payload: {
        mode,
        provider: options?.provider,
        apiKey: options?.apiKey,
        openclawUrl: options?.openclawUrl,
      },
    });
  }

  private dispatch(message: ServerMessage): void {
    const handlers = this.handlers.get(message.type) || [];
    for (const handler of handlers) {
      handler(message);
    }
    // Also dispatch to wildcard listeners
    const wildcardHandlers = this.handlers.get('*') || [];
    for (const handler of wildcardHandlers) {
      handler(message);
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({
        id: crypto.randomUUID(),
        type: MessageType.PING,
        timestamp: Date.now(),
      });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(
    mode: ConnectionMode,
    options?: { provider?: LLMProvider; apiKey?: string; openclawUrl?: string }
  ): void {
    this.reconnectTimer = setTimeout(() => {
      console.log('[WS] Reconnecting...');
      this.connect(mode, options);
    }, 3000);
  }
}
