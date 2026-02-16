import type { ChatHistoryItem } from '../types/protocol.js';

export interface ChatOptions {
  signal?: AbortSignal;
}

/**
 * Abstract LLM provider interface.
 * All providers (DeepSeek, OpenAI, Anthropic, OpenClaw) implement this.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Stream a chat completion. Yields text chunks.
   */
  chat(
    messages: ChatHistoryItem[],
    options?: ChatOptions
  ): AsyncIterable<string>;
}
