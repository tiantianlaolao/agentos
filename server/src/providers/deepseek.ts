import OpenAI from 'openai';
import type { ChatHistoryItem } from '../types/protocol.js';
import type { LLMProvider, ChatOptions } from './base.js';

const SYSTEM_PROMPT = `You are AgentOS Assistant, a helpful AI assistant. You can help users with various tasks.
You have access to the following skills:
- weather: Query weather information for any city

When users ask about weather, respond naturally and include the weather data.
Keep responses concise and helpful. Respond in the same language the user uses.`;

export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.deepseek.com',
    });
    this.model = 'deepseek-chat';
  }

  async *chat(
    messages: ChatHistoryItem[],
    options?: ChatOptions
  ): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
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
  }
}
