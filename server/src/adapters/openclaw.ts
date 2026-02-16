import WebSocket from 'ws';
import type { ChatHistoryItem } from '../types/protocol.js';
import type { LLMProvider, ChatOptions } from '../providers/base.js';

/**
 * OpenClaw WebSocket adapter.
 * Connects to a user's OpenClaw instance and proxies messages.
 *
 * TODO: Implement in Step 1 (backend agent).
 * This is a skeleton showing the expected interface.
 */
export class OpenClawAdapter implements LLMProvider {
  readonly name = 'openclaw';
  private url: string;
  private ws: WebSocket | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async *chat(
    messages: ChatHistoryItem[],
    _options?: ChatOptions
  ): AsyncIterable<string> {
    // TODO: Implement OpenClaw WebSocket protocol
    // 1. Connect to OpenClaw instance at this.url
    // 2. Send the last user message
    // 3. Stream back response chunks
    // 4. Handle disconnection and reconnection

    void messages;
    throw new Error('OpenClaw adapter not yet implemented');
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
