/**
 * Direct LLM client for BYOK mode.
 * Calls LLM provider APIs directly from the desktop app,
 * bypassing the AgentOS server entirely.
 * API keys never leave the device.
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
  onDone: (fullContent: string) => void;
  onError: (error: string) => void;
}

export type Provider = 'deepseek' | 'openai' | 'anthropic' | 'moonshot';

const PROVIDER_CONFIG: Record<Provider, { baseUrl: string; defaultModel: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com', defaultModel: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-5-20250929' },
  moonshot: { baseUrl: 'https://api.moonshot.cn', defaultModel: 'moonshot-v1-8k' },
};

const SYSTEM_PROMPT = 'You are AgentOS Assistant, a helpful AI assistant.';

/**
 * Stream a chat completion directly from an LLM provider.
 * Supports DeepSeek, OpenAI, Moonshot (OpenAI-compatible), and Anthropic.
 */
export async function sendChat(
  provider: Provider,
  apiKey: string,
  model: string | undefined,
  content: string,
  history: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    callbacks.onError(`Unknown provider: ${provider}`);
    return;
  }

  const modelToUse = model || config.defaultModel;
  const messages: ChatMessage[] = [...history, { role: 'user', content }];

  try {
    if (provider === 'anthropic') {
      await streamAnthropic(config.baseUrl, apiKey, modelToUse, messages, callbacks, signal);
    } else {
      await streamOpenAICompatible(config.baseUrl, apiKey, modelToUse, messages, callbacks, signal);
    }
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError(err instanceof Error ? err.message : 'Stream failed');
  }
}

// -- OpenAI-compatible streaming (DeepSeek, OpenAI, Moonshot) --

async function streamOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status}: ${text.slice(0, 200) || response.statusText}`);
  }

  let fullContent = '';

  if (response.body) {
    await readSSEStream(response.body, (data) => {
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          callbacks.onChunk(delta);
        }
      } catch { /* skip malformed chunk */ }
    }, signal);
  } else {
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            callbacks.onChunk(delta);
          }
        } catch { /* skip */ }
      }
    }
  }

  if (!signal?.aborted) {
    callbacks.onDone(fullContent);
  }
}

// -- Anthropic streaming --

async function streamAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status}: ${text.slice(0, 200) || response.statusText}`);
  }

  let fullContent = '';

  if (response.body) {
    await readSSEStream(response.body, (data) => {
      try {
        const json = JSON.parse(data);
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const text = json.delta.text;
          if (text) {
            fullContent += text;
            callbacks.onChunk(text);
          }
        }
      } catch { /* skip */ }
    }, signal);
  } else {
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            const t = json.delta.text;
            if (t) {
              fullContent += t;
              callbacks.onChunk(t);
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  if (!signal?.aborted) {
    callbacks.onDone(fullContent);
  }
}

// -- SSE stream reader --

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          onData(trimmed.slice(6));
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
