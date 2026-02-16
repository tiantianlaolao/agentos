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
  type SkillInvocation,
} from '../types/protocol.js';
import { createProvider } from '../providers/factory.js';
import type { LLMProvider } from '../providers/base.js';
import { queryWeather, type WeatherResult } from '../skills/weather.js';
import { checkRateLimit, incrementCount } from '../middleware/rateLimit.js';

interface Session {
  id: string;
  mode: ConnectionMode;
  deviceId: string;
  provider: LLMProvider | null;
  abortController: AbortController | null;
}

// Weather-related keywords for simple skill detection
const WEATHER_KEYWORDS = [
  'weather', 'forecast', 'temperature', 'temp',
  '天气', '温度', '气温', '预报', '下雨', '下雪', '晴天', '阴天',
];

/**
 * Extract city from a weather query. Simple heuristic for MVP.
 * Looks for patterns like "weather in Beijing", "北京天气", etc.
 */
function extractCity(content: string): string | null {
  // English patterns: "weather in <city>", "temperature in <city>", "<city> weather"
  const enPatterns = [
    /(?:weather|temperature|forecast)\s+(?:in|for|at)\s+([A-Za-z\s]+)/i,
    /([A-Za-z\s]+?)\s+(?:weather|temperature|forecast)/i,
  ];
  for (const pattern of enPatterns) {
    const match = content.match(pattern);
    if (match) return match[1].trim();
  }

  // Chinese patterns: "<city>天气", "<city>的天气", "<city>温度"
  const zhPatterns = [
    /([一-龥a-zA-Z]+?)(?:的)?(?:天气|温度|气温|预报)/,
    /(?:天气|温度|气温|预报).*?([一-龥]{2,})/,
  ];
  for (const pattern of zhPatterns) {
    const match = content.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

function isWeatherQuery(content: string): boolean {
  const lower = content.toLowerCase();
  return WEATHER_KEYWORDS.some((kw) => lower.includes(kw));
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
  const { mode, provider: providerName, apiKey, openclawUrl, openclawToken, deviceId } = message.payload;

  const llmProvider = createProvider(mode, { provider: providerName, apiKey, openclawUrl, openclawToken });

  const session: Session = {
    id: uuidv4(),
    mode,
    deviceId: deviceId || 'anonymous',
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

  // Rate limiting (builtin mode only)
  const { allowed, remaining } = checkRateLimit(session.deviceId, session.mode);
  if (!allowed) {
    sendError(
      ws,
      ErrorCode.RATE_LIMITED,
      `Daily message limit reached (${remaining} remaining). Try again tomorrow or switch to BYOK/OpenClaw mode.`,
      conversationId
    );
    return;
  }

  if (!session.provider) {
    sendError(ws, ErrorCode.PROVIDER_ERROR, 'No LLM provider configured', conversationId);
    return;
  }

  const abortController = new AbortController();
  session.abortController = abortController;

  let fullContent = '';
  const skillsInvoked: SkillInvocation[] = [];

  try {
    // Skill detection & execution (skip for openclaw mode)
    let skillContext = '';
    if (session.mode !== 'openclaw' && isWeatherQuery(content)) {
      const city = extractCity(content);
      if (city) {
        // Notify client that skill is starting
        send(ws, {
          id: uuidv4(),
          type: MessageType.SKILL_START,
          timestamp: Date.now(),
          payload: {
            conversationId,
            skillName: 'weather',
            description: `Querying weather for ${city}...`,
          },
        });

        try {
          const result: WeatherResult = await queryWeather(city);

          // Notify client of skill result
          send(ws, {
            id: uuidv4(),
            type: MessageType.SKILL_RESULT,
            timestamp: Date.now(),
            payload: {
              conversationId,
              skillName: 'weather',
              success: true,
              data: result as unknown as Record<string, unknown>,
            },
          });

          skillsInvoked.push({
            name: 'weather',
            input: { city },
            output: result as unknown as Record<string, unknown>,
          });

          // Build context for LLM
          skillContext =
            `[Weather data for ${result.city}: ` +
            `${result.temperature}°C, ${result.condition}, ` +
            `humidity ${result.humidity}%, wind ${result.windSpeed} km/h, ` +
            `feels like ${result.feelsLike}°C]`;
        } catch (skillError) {
          // Skill failed - notify client but continue with LLM
          send(ws, {
            id: uuidv4(),
            type: MessageType.SKILL_RESULT,
            timestamp: Date.now(),
            payload: {
              conversationId,
              skillName: 'weather',
              success: false,
              error: skillError instanceof Error ? skillError.message : 'Weather query failed',
            },
          });

          skillContext = `[Weather query for "${city}" failed: ${skillError instanceof Error ? skillError.message : 'unknown error'}]`;
        }
      }
    }

    // Build messages for LLM, injecting skill context if available
    const llmMessages = [...(history || [])];
    if (skillContext) {
      llmMessages.push({ role: 'user', content: `${skillContext}\n\n${content}` });
    } else {
      llmMessages.push({ role: 'user', content });
    }

    const stream = session.provider.chat(llmMessages, { signal: abortController.signal });

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
      // Increment rate limit counter on success
      incrementCount(session.deviceId);

      send(ws, {
        id: uuidv4(),
        type: MessageType.CHAT_DONE,
        timestamp: Date.now(),
        payload: {
          conversationId,
          fullContent,
          skillsInvoked: skillsInvoked.length > 0 ? skillsInvoked : undefined,
        },
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
