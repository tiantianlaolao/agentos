import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  MessageType,
  ErrorCode,
  type ClientMessage,
  type ServerMessage,
  type ConnectMessage,
  type ChatSendMessage,
  type ConnectionMode,
} from '../types/protocol.js';
import { createProvider } from '../providers/factory.js';
import type { LLMProvider } from '../providers/base.js';

interface Session {
  id: string;
  mode: ConnectionMode;
  provider: LLMProvider | null;
  abortController: AbortController | null;
}

export function handleConnection(ws: WebSocket): void {
  let session: Session | null = null;

  ws.on('message', async (data) => {
    let message: ClientMessage;

    try {
      message = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      sendError(ws, ErrorCode.INVALID_MESSAGE, 'Invalid JSON');
      return;
    }

    try {
      switch (message.type) {
        case MessageType.CONNECT:
          session = await handleConnect(ws, message);
          break;

        case MessageType.CHAT_SEND:
          if (!session) {
            sendError(ws, ErrorCode.INVALID_MESSAGE, 'Not connected');
            return;
          }
          await handleChatSend(ws, session, message);
          break;

        case MessageType.CHAT_STOP:
          if (session?.abortController) {
            session.abortController.abort();
            session.abortController = null;
          }
          break;

        case MessageType.PING:
          send(ws, { id: uuidv4(), type: MessageType.PONG, timestamp: Date.now() });
          break;

        default:
          sendError(ws, ErrorCode.INVALID_MESSAGE, `Unknown message type`);
      }
    } catch (error) {
      console.error('[WS] Handler error:', error);
      sendError(
        ws,
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Internal error'
      );
    }
  });

  ws.on('close', () => {
    if (session) {
      session.abortController?.abort();
      console.log(`[WS] Session ${session.id} disconnected`);
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] Connection error:', error);
  });
}

async function handleConnect(ws: WebSocket, message: ConnectMessage): Promise<Session> {
  const { mode, provider: providerName, apiKey, openclawUrl } = message.payload;

  const llmProvider = createProvider(mode, { provider: providerName, apiKey, openclawUrl });

  const session: Session = {
    id: uuidv4(),
    mode,
    provider: llmProvider,
    abortController: null,
  };

  send(ws, {
    id: uuidv4(),
    type: MessageType.CONNECTED,
    timestamp: Date.now(),
    payload: {
      sessionId: session.id,
      mode,
      skills: mode === 'openclaw' ? [] : ['weather'],
    },
  });

  console.log(`[WS] Session ${session.id} connected (mode: ${mode})`);
  return session;
}

async function handleChatSend(
  ws: WebSocket,
  session: Session,
  message: ChatSendMessage
): Promise<void> {
  const { conversationId, content, history } = message.payload;

  if (!session.provider) {
    sendError(ws, ErrorCode.PROVIDER_ERROR, 'No LLM provider configured', conversationId);
    return;
  }

  const abortController = new AbortController();
  session.abortController = abortController;

  let fullContent = '';

  try {
    const stream = session.provider.chat(
      [...(history || []), { role: 'user', content }],
      { signal: abortController.signal }
    );

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;

      fullContent += chunk;
      send(ws, {
        id: uuidv4(),
        type: MessageType.CHAT_CHUNK,
        timestamp: Date.now(),
        payload: { conversationId, delta: chunk },
      });
    }

    if (!abortController.signal.aborted) {
      send(ws, {
        id: uuidv4(),
        type: MessageType.CHAT_DONE,
        timestamp: Date.now(),
        payload: { conversationId, fullContent },
      });
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      sendError(
        ws,
        ErrorCode.PROVIDER_ERROR,
        error instanceof Error ? error.message : 'LLM provider error',
        conversationId
      );
    }
  } finally {
    session.abortController = null;
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(
  ws: WebSocket,
  code: ErrorCode,
  message: string,
  conversationId?: string
): void {
  send(ws, {
    id: uuidv4(),
    type: MessageType.ERROR,
    timestamp: Date.now(),
    payload: { code, message, conversationId },
  });
}
