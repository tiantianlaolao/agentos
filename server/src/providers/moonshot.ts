import OpenAI from 'openai';
import type { ChatHistoryItem } from '../types/protocol.js';
import type { LLMProvider, ChatOptions, ChatResult, ChatToolCallResult, ToolDefinition, ToolCall } from './base.js';

const SYSTEM_PROMPT = `You are AgentOS Assistant, a helpful AI assistant.
Keep responses concise and helpful. Respond in the same language the user uses.
When you have tools available, use them to answer user queries accurately instead of guessing.`;

export class MoonshotProvider implements LLMProvider {
  readonly name = 'moonshot';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.moonshot.cn/v1',
    });
    this.model = 'moonshot-v1-auto';
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

  async chatWithTools(
    messages: Array<{ role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }>,
    options: ChatOptions & { tools: ToolDefinition[] },
  ): Promise<ChatResult | ChatToolCallResult> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages as OpenAI.ChatCompletionMessageParam[],
        ],
        tools: options.tools as OpenAI.ChatCompletionTool[],
        tool_choice: 'auto',
      },
      { signal: options?.signal }
    );

    const choice = response.choices[0];

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      const functionCalls = choice.message.tool_calls.filter(
        (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function' } => tc.type === 'function',
      );
      if (functionCalls.length > 0) {
        return {
          type: 'tool_calls',
          toolCalls: functionCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }
    }

    const content = choice.message.content || '';
    return {
      type: 'text',
      stream: (async function* () { yield content; })(),
    };
  }
}
