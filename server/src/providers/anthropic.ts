import Anthropic from '@anthropic-ai/sdk';
import type { ChatHistoryItem } from '../types/protocol.js';
import type { LLMProvider, ChatOptions, ChatResult, ChatToolCallResult, ToolDefinition, ToolCall } from './base.js';

const SYSTEM_PROMPT = `You are AgentOS Assistant, a helpful AI assistant.
Keep responses concise and helpful. Respond in the same language the user uses.
When you have tools available, use them to answer user queries accurately instead of guessing.`;

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    this.model = 'claude-sonnet-4-5-20250929';
  }

  async *chat(
    messages: ChatHistoryItem[],
    options?: ChatOptions
  ): AsyncIterable<string> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
      { signal: options?.signal ?? null }
    );

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }

  async chatWithTools(
    messages: Array<{ role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }>,
    options: ChatOptions & { tools: ToolDefinition[] },
  ): Promise<ChatResult | ChatToolCallResult> {
    // Convert OpenAI-format tools to Anthropic format
    const anthropicTools: Anthropic.Tool[] = options.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
    }));

    // Convert messages to Anthropic format
    // Anthropic uses a different structure for tool calls/results
    const anthropicMessages: Anthropic.MessageParam[] = [];
    for (const msg of messages) {
      if (msg.role === 'user') {
        anthropicMessages.push({ role: 'user', content: msg.content || '' });
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Assistant message with tool use
          const content: Anthropic.ContentBlockParam[] = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
          anthropicMessages.push({ role: 'assistant', content });
        } else {
          anthropicMessages.push({ role: 'assistant', content: msg.content || '' });
        }
      } else if (msg.role === 'tool') {
        // Tool result — in Anthropic format, this is a user message with tool_result blocks
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
          (lastMsg.content as Anthropic.ContentBlockParam[]).push({
            type: 'tool_result',
            tool_use_id: msg.tool_call_id!,
            content: msg.content || '',
          });
        } else {
          anthropicMessages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: msg.tool_call_id!,
              content: msg.content || '',
            }],
          });
        }
      }
    }

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
        tools: anthropicTools,
      },
      { signal: options?.signal ?? null }
    );

    // Check if there are tool_use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUseBlocks.length > 0) {
      return {
        type: 'tool_calls',
        toolCalls: toolUseBlocks.map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input),
          },
        })),
      };
    }

    // Regular text response
    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      type: 'text',
      stream: (async function* () { yield textBlocks; })(),
    };
  }
}
