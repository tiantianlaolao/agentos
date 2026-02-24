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

import { randomUUID } from 'expo-crypto';
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
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private lastMode: ConnectionMode | null = null;
  private lastOptions: any = undefined;

  constructor(url: string) {
    this.url = url;
  }

  connect(mode: ConnectionMode, options?: { provider?: LLMProvider; apiKey?: string; openclawUrl?: string; openclawToken?: string; authToken?: string; model?: string; deviceId?: string; openclawHosted?: boolean; copawUrl?: string; copawToken?: string; copawHosted?: boolean }): void {
    this.lastMode = mode;
    this.lastOptions = options;
    this.cleanup();

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0; // Reset on successful connection
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
        payload: { code: 'CONNECTION_CLOSED' as never, message: 'Reconnecting...' },
      } as never);
      this.scheduleReconnect(mode, options);
    };

    this.ws.onerror = () => {
      console.error('[WS] Connection error');
    };
  }

  /** Silently close current connection without triggering error/reconnect. */
  private cleanup(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Null out handlers BEFORE close to prevent zombie callbacks
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  disconnect(): void {
    this.cleanup();
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

  /** Force an immediate reconnect if the connection is not open. */
  reconnectNow(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    // Clear any pending backoff timer and reconnect immediately
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    if (this.lastMode) {
      this.connect(this.lastMode, this.lastOptions);
    }
  }

  private sendConnect(
    mode: ConnectionMode,
    options?: { provider?: LLMProvider; apiKey?: string; openclawUrl?: string; openclawToken?: string; authToken?: string; model?: string; deviceId?: string; openclawHosted?: boolean; copawUrl?: string; copawToken?: string; copawHosted?: boolean }
  ): void {
    this.send({
      id: randomUUID(),
      type: MessageType.CONNECT,
      timestamp: Date.now(),
      payload: {
        mode,
        provider: options?.provider,
        apiKey: options?.apiKey,
        openclawUrl: options?.openclawUrl,
        openclawToken: options?.openclawToken,
        openclawHosted: options?.openclawHosted,
        copawUrl: options?.copawUrl,
        copawToken: options?.copawToken,
        copawHosted: options?.copawHosted,
        authToken: options?.authToken,
        model: options?.model,
        deviceId: options?.deviceId,
      },
    });
  }

  private dispatch(message: ServerMessage): void {
    // Clear pong timeout on any PONG response
    if (message.type === MessageType.PONG && this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

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
        id: randomUUID(),
        type: MessageType.PING,
        timestamp: Date.now(),
      });
      // Set 10s pong timeout — if no PONG received, close socket to trigger reconnect
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        console.log('[WS] Pong timeout — closing connection');
        this.pongTimer = null;
        if (this.ws) {
          this.ws.close();
        }
      }, 10000);
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private scheduleReconnect(
    mode: ConnectionMode,
    options?: { provider?: LLMProvider; apiKey?: string; openclawUrl?: string; openclawToken?: string; authToken?: string; model?: string; deviceId?: string; openclawHosted?: boolean; copawUrl?: string; copawToken?: string; copawHosted?: boolean }
  ): void {
    // Exponential backoff: 1s, 2s, 4s, 8s, ... max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      console.log(`[WS] Reconnecting (attempt ${this.reconnectAttempts}, delay ${delay}ms)...`);
      this.connect(mode, options);
    }, delay);
  }
}
