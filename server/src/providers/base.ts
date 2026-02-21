import type { ChatHistoryItem } from '../types/protocol.js';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatOptions {
  signal?: AbortSignal;
  tools?: ToolDefinition[];
}

/** Result from a chat call: either streamed text or a tool_calls request */
export interface ChatResult {
  type: 'text';
  stream: AsyncIterable<string>;
}

export interface ChatToolCallResult {
  type: 'tool_calls';
  toolCalls: ToolCall[];
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

  /**
   * Chat with tool/function calling support.
   * Returns either a text stream or a tool_calls request.
   * Providers that don't support tools fall back to regular chat.
   */
  chatWithTools?(
    messages: Array<{ role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }>,
    options: ChatOptions & { tools: ToolDefinition[] },
  ): Promise<ChatResult | ChatToolCallResult>;
}
