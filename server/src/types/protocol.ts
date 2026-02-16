/**
 * AgentOS WebSocket Protocol v1
 * Shared type definitions for client-server communication.
 *
 * IMPORTANT: This file is mirrored in mobile/src/types/protocol.ts.
 * Any changes here must be reflected there as well.
 */

// ===== Enums =====

export enum MessageType {
  // Client -> Server
  CONNECT = 'connect',
  CHAT_SEND = 'chat.send',
  CHAT_STOP = 'chat.stop',

  // Server -> Client
  CONNECTED = 'connected',
  CHAT_CHUNK = 'chat.chunk',
  CHAT_DONE = 'chat.done',
  SKILL_START = 'skill.start',
  SKILL_RESULT = 'skill.result',
  ERROR = 'error',

  // Bidirectional
  PING = 'ping',
  PONG = 'pong',
}

export type ConnectionMode = 'builtin' | 'openclaw' | 'byok';

export type LLMProvider = 'deepseek' | 'openai' | 'anthropic';

export enum ErrorCode {
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  AUTH_FAILED = 'AUTH_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  SKILL_ERROR = 'SKILL_ERROR',
  OPENCLAW_DISCONNECTED = 'OPENCLAW_DISCONNECTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// ===== Base =====

export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: number;
}

// ===== Client -> Server =====

export interface ConnectMessage extends BaseMessage {
  type: MessageType.CONNECT;
  payload: {
    mode: ConnectionMode;
    provider?: LLMProvider;
    apiKey?: string;
    openclawUrl?: string;
    deviceId?: string;
  };
}

export interface ChatSendMessage extends BaseMessage {
  type: MessageType.CHAT_SEND;
  payload: {
    conversationId: string;
    content: string;
    history?: ChatHistoryItem[];
  };
}

export interface ChatStopMessage extends BaseMessage {
  type: MessageType.CHAT_STOP;
  payload: {
    conversationId: string;
  };
}

// ===== Server -> Client =====

export interface ConnectedMessage extends BaseMessage {
  type: MessageType.CONNECTED;
  payload: {
    sessionId: string;
    mode: ConnectionMode;
    skills: string[];
  };
}

export interface ChatChunkMessage extends BaseMessage {
  type: MessageType.CHAT_CHUNK;
  payload: {
    conversationId: string;
    delta: string;
  };
}

export interface ChatDoneMessage extends BaseMessage {
  type: MessageType.CHAT_DONE;
  payload: {
    conversationId: string;
    fullContent: string;
    usage?: TokenUsage;
    skillsInvoked?: SkillInvocation[];
  };
}

export interface SkillStartMessage extends BaseMessage {
  type: MessageType.SKILL_START;
  payload: {
    conversationId: string;
    skillName: string;
    description: string;
  };
}

export interface SkillResultMessage extends BaseMessage {
  type: MessageType.SKILL_RESULT;
  payload: {
    conversationId: string;
    skillName: string;
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  };
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  payload: {
    code: ErrorCode;
    message: string;
    conversationId?: string;
  };
}

// ===== Bidirectional =====

export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

// ===== Union =====

export type ClientMessage = ConnectMessage | ChatSendMessage | ChatStopMessage | PingMessage;

export type ServerMessage =
  | ConnectedMessage
  | ChatChunkMessage
  | ChatDoneMessage
  | SkillStartMessage
  | SkillResultMessage
  | ErrorMessage
  | PongMessage;

export type WSMessage = ClientMessage | ServerMessage;

// ===== Supporting Types =====

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface SkillInvocation {
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface SkillDefinition {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required?: boolean;
    }
  >;
}
