import type {
  AgentAdapter,
  AgentType,
  AgentConnectOptions,
  AgentChatOptions,
  ChatHistoryItem,
  ToolEvent,
  ToolEventCallback,
  PushMessageCallback,
  SkillManifest,
} from './base.js';

/**
 * CoPaw adapter — connects to Alibaba's CoPaw / AgentScope Runtime.
 *
 * CoPaw exposes an HTTP SSE endpoint at /process (default port 8088 or 8090).
 * Protocol: POST JSON request, receive Server-Sent Events (SSE) streaming response.
 *
 * Key endpoints:
 *   POST /process — SSE streaming chat (Agent API Protocol)
 *   POST /compatible-mode/v1/responses — OpenAI-compatible
 *   POST /ag-ui — AG-UI protocol (tool events)
 *
 * We use the /ag-ui endpoint for richer tool event support (TOOL_CALL_START, etc).
 * Falls back to /process for simpler deployments.
 */
export class CoPawAdapter implements AgentAdapter {
  readonly name = 'copaw';
  readonly type: AgentType = 'copaw';

  private baseUrl: string;
  private token: string;
  private connected = false;

  sessionKey = 'agentos-copaw-session';

  onToolEvent: ToolEventCallback | null = null;
  onPushMessage: PushMessageCallback | null = null;
  onDisconnect: (() => void) | null = null;

  // Track whether this instance supports AG-UI (richer protocol)
  private useAgUi = true;

  constructor(url: string, token?: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.token = token || '';
  }

  async connect(options?: AgentConnectOptions): Promise<void> {
    if (options?.url) {
      this.baseUrl = options.url.replace(/\/+$/, '');
    }
    if (options?.token) {
      this.token = options.token;
    }

    // Mark as connected immediately — real connectivity is verified on first chat.
    // Avoids the old blocking health check that sent a full LLM request (1-3s delay).
    this.connected = true;
    console.log(`[CoPaw] Ready (${this.baseUrl})`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  cleanup(): void {
    this.disconnect();
    this.onToolEvent = null;
    this.onPushMessage = null;
    this.onDisconnect = null;
  }

  async *chat(
    messages: ChatHistoryItem[],
    options?: AgentChatOptions,
  ): AsyncIterable<string> {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) return;

    if (this.useAgUi) {
      yield* this._chatAgUi(lastUserMsg.content, options);
    } else {
      yield* this._chatProcess(lastUserMsg.content, options);
    }
  }

  // --- AG-UI protocol: richer tool events ---

  private async *_chatAgUi(
    content: string,
    options?: AgentChatOptions,
  ): AsyncIterable<string> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const body = JSON.stringify({
      threadId: this.sessionKey,
      runId,
      messages: [{ id: `msg_${Date.now()}`, role: 'user', content }],
      tools: [],
      context: [],
      forwardedProps: {},
    });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/ag-ui`, {
        method: 'POST',
        headers: this._headers(),
        body,
        signal: options?.signal,
      });
    } catch (err) {
      // If AG-UI endpoint not available, fall back to /process
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
        console.log('[CoPaw] AG-UI endpoint not available, falling back to /process');
        this.useAgUi = false;
        yield* this._chatProcess(content, options);
        return;
      }
      throw err;
    }

    if (!response.ok) {
      // 404/405 means AG-UI not supported — fall back to /process
      if (response.status === 404 || response.status === 405) {
        console.log(`[CoPaw] AG-UI endpoint returned ${response.status}, falling back to /process`);
        this.useAgUi = false;
        yield* this._chatProcess(content, options);
        return;
      }
      throw new Error(`CoPaw AG-UI error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('CoPaw: No response body');
    }

    const reader = (response.body as unknown as { getReader(): ReadableStreamDefaultReader<Uint8Array> }).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (options?.signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') return;

          try {
            const event = JSON.parse(dataStr);
            const eventType = event.type as string;

            switch (eventType) {
              case 'TEXT_MESSAGE_CONTENT':
                if (event.delta) yield event.delta as string;
                break;
              case 'TOOL_CALL_START':
                if (this.onToolEvent) {
                  this.onToolEvent({
                    phase: 'start',
                    name: event.tool_call_name || 'unknown',
                    args: {},
                  });
                }
                break;
              case 'TOOL_CALL_RESULT':
                if (this.onToolEvent) {
                  this.onToolEvent({
                    phase: 'result',
                    name: event.tool_call_name || 'tool',
                    result: typeof event.content === 'string' ? event.content : JSON.stringify(event.content),
                  });
                }
                break;
              case 'RUN_ERROR':
                if (this.onToolEvent) {
                  this.onToolEvent({
                    phase: 'error',
                    name: 'system',
                    error: event.message || 'CoPaw run error',
                  });
                }
                throw new Error(event.message || 'CoPaw run error');
              // RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_END, RUN_FINISHED, TOOL_CALL_ARGS, TOOL_CALL_END
              // are lifecycle events that don't produce text output
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue; // skip malformed SSE lines
            throw parseErr;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  // --- /process endpoint: simpler streaming ---

  private async *_chatProcess(
    content: string,
    options?: AgentChatOptions,
  ): AsyncIterable<string> {
    const body = JSON.stringify({
      input: [
        {
          role: 'user',
          content: [{ type: 'text', text: content }],
        },
      ],
      session_id: this.sessionKey,
    });

    const response = await fetch(`${this.baseUrl}/process`, {
      method: 'POST',
      headers: this._headers(),
      body,
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`CoPaw error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('CoPaw: No response body');
    }

    const reader = (response.body as unknown as { getReader(): ReadableStreamDefaultReader<Uint8Array> }).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (options?.signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') return;

          try {
            const event = JSON.parse(dataStr);

            // Extract text from /process SSE format
            // Format: {"output":[{"content":[{"type":"text","text":"..."}]}]}
            // OR flat text delta format:
            // Format: {"status":"in_progress","type":"text","delta":true,"text":"Hello"}
            // Both formats may appear in the same event — only yield once.
            let yielded = false;
            const output = event.output;
            if (Array.isArray(output)) {
              for (const msg of output) {
                if (Array.isArray(msg.content)) {
                  for (const part of msg.content) {
                    if (part.type === 'text' && part.text) {
                      yield part.text as string;
                      yielded = true;
                    }
                  }
                }
              }
            }

            // Fallback to flat text delta format only if structured format didn't yield
            if (!yielded && event.type === 'text' && event.delta && event.text) {
              yield event.text as string;
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  // --- Skill management ---

  // Cache skill list to avoid repeated HTTP calls
  private skillsCache: SkillManifest[] | null = null;
  private skillsCacheTime = 0;
  private static SKILLS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async listSkills(): Promise<SkillManifest[]> {
    // Return cache if fresh
    if (this.skillsCache && Date.now() - this.skillsCacheTime < CoPawAdapter.SKILLS_CACHE_TTL) {
      return this.skillsCache;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      // CoPaw /skills API returns: [{name, content, source, enabled, ...}]
      const res = await fetch(`${this.baseUrl.replace(/\/agent\/?$/, '')}/skills`, {
        headers: this._headers(),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return this.skillsCache || [];

      const skills = await res.json() as Array<{
        name: string;
        content?: string;
        source?: string;
        enabled?: boolean;
      }>;

      this.skillsCache = skills.map((s) => {
        // Extract description from YAML frontmatter in content field
        let description = '';
        if (s.content) {
          const descMatch = s.content.match(/description:\s*"([^"]+)"/);
          if (descMatch) description = descMatch[1];
        }
        return {
          name: s.name,
          version: '1.0.0',
          description,
          author: s.source || 'CoPaw',
          agents: ['copaw'],
          environments: ['cloud'],
          permissions: [],
          functions: [],
          audit: 'ecosystem' as const,
          auditSource: 'CoPaw',
        };
      });
      this.skillsCacheTime = Date.now();
      return this.skillsCache;
    } catch (err) {
      console.error('[CoPaw] listSkills failed:', err instanceof Error ? err.message : err);
      return this.skillsCache || [];
    }
  }

  // --- Internal helpers ---

  private _headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }
}
