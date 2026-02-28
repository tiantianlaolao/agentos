/**
 * CoPaw Direct Client — connects directly to a local CoPaw Runtime via HTTP/SSE.
 *
 * Uses the AG-UI protocol endpoint (POST /ag-ui) for richer lifecycle events.
 */

export interface ToolEvent {
  phase: string; // 'start' | 'result'
  name: string;
  args?: Record<string, unknown>;
  result?: string;
}

export class CoPawDirectClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    // Normalize: remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Send a chat message to CoPaw via the AG-UI protocol endpoint.
   * Uses SSE streaming to return results.
   */
  async sendChat(
    content: string,
    sessionKey: string,
    callbacks: {
      onChunk: (delta: string) => void;
      onDone: (fullContent: string) => void;
      onError: (error: string) => void;
      onToolEvent?: (event: ToolEvent) => void;
    },
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    const threadId = sessionKey;
    const runId = `run_${Date.now()}`;

    try {
      const response = await fetch(`${this.baseUrl}/ag-ui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          runId,
          messages: [{ id: `msg_${Date.now()}`, role: 'user', content }],
          tools: [],
          context: [],
          forwardedProps: {},
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        callbacks.onError(`CoPaw HTTP ${response.status}: ${text.slice(0, 200)}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            callbacks.onDone(fullContent);
            return;
          }

          try {
            const event = JSON.parse(dataStr);
            const eventType = event.type as string;

            switch (eventType) {
              case 'TEXT_MESSAGE_CONTENT': {
                const delta = event.delta as string;
                if (delta) {
                  fullContent += delta;
                  callbacks.onChunk(delta);
                }
                break;
              }
              case 'RUN_FINISHED':
                callbacks.onDone(fullContent);
                return;
              case 'RUN_ERROR':
                callbacks.onError(event.message || 'CoPaw run error');
                return;
              case 'TOOL_CALL_START':
                callbacks.onToolEvent?.({
                  phase: 'start',
                  name: event.toolCallName || event.name || 'unknown',
                  args: event.args,
                });
                break;
              case 'TOOL_CALL_END':
                callbacks.onToolEvent?.({
                  phase: 'result',
                  name: event.toolCallName || event.name || 'unknown',
                  result: event.result,
                });
                break;
              // TEXT_MESSAGE_START, TEXT_MESSAGE_END, RUN_STARTED — lifecycle, no action needed
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // If we reach here without RUN_FINISHED, still deliver what we have
      if (fullContent) {
        callbacks.onDone(fullContent);
      }
    } catch (err) {
      if (options?.signal?.aborted) return;
      callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Check if CoPaw is reachable via health endpoint.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
