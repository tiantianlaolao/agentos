import OpenAI from 'openai';
import type { ChatHistoryItem } from '../types/protocol.js';
import type { LLMProvider, ChatOptions } from '../providers/base.js';

/**
 * OpenClaw adapter using the OpenAI-compatible HTTP API.
 *
 * OpenClaw's Gateway exposes `/v1/chat/completions` which is OpenAI-compatible.
 * This adapter leverages the OpenAI SDK pointed at the user's OpenClaw instance.
 *
 * Authentication: Bearer token (gateway.auth.token).
 * Model field: "openclaw:main" routes to the default agent.
 */
export class OpenClawAdapter implements LLMProvider {
  readonly name = 'openclaw';
  private client: OpenAI;
  private model: string;

  constructor(url: string, token?: string) {
    // Normalize URL: ensure it ends with /v1 for the OpenAI SDK
    const baseURL = url.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';

    this.client = new OpenAI({
      apiKey: token || 'openclaw',
      baseURL,
    });
    this.model = 'openclaw:main';
  }

  async *chat(
    messages: ChatHistoryItem[],
    options?: ChatOptions
  ): AsyncIterable<string> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          stream: true,
        },
        { signal: options?.signal }
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Wrap connection errors with a friendly message
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`OpenClaw connection failed: ${message}`);
    }
  }
}
