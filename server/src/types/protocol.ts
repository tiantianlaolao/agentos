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
  SKILL_LIST_REQUEST = 'skill.list.request',
  SKILL_TOGGLE = 'skill.toggle',

  // Server -> Client
  CONNECTED = 'connected',
  CHAT_CHUNK = 'chat.chunk',
  CHAT_DONE = 'chat.done',
  SKILL_START = 'skill.start',
  SKILL_RESULT = 'skill.result',
  PUSH_MESSAGE = 'push.message',
  SKILL_LIST_RESPONSE = 'skill.list.response',
  ERROR = 'error',

  // Desktop <-> Server
  DESKTOP_REGISTER = 'desktop.register',
  DESKTOP_COMMAND = 'desktop.command',
  DESKTOP_RESULT = 'desktop.result',

  // Bidirectional
  PING = 'ping',
  PONG = 'pong',
}

export type ConnectionMode = 'builtin' | 'openclaw' | 'copaw' | 'byok' | 'desktop';

export type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'moonshot';

export enum ErrorCode {
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  AUTH_FAILED = 'AUTH_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  SKILL_ERROR = 'SKILL_ERROR',
  OPENCLAW_DISCONNECTED = 'OPENCLAW_DISCONNECTED',
  HOSTED_QUOTA_EXCEEDED = 'HOSTED_QUOTA_EXCEEDED',
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
    openclawToken?: string;
    openclawHosted?: boolean;
    copawUrl?: string;
    copawToken?: string;
    deviceId?: string;
    authToken?: string;
    model?: string;
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

export interface SkillListRequestMessage extends BaseMessage {
  type: MessageType.SKILL_LIST_REQUEST;
}

export interface SkillToggleMessage extends BaseMessage {
  type: MessageType.SKILL_TOGGLE;
  payload: {
    skillName: string;
    enabled: boolean;
  };
}

// ===== Server -> Client =====

export interface ConnectedMessage extends BaseMessage {
  type: MessageType.CONNECTED;
  payload: {
    sessionId: string;
    mode: ConnectionMode;
    skills: string[];
    hostedQuota?: { used: number; total: number };
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

export interface PushMessage extends BaseMessage {
  type: MessageType.PUSH_MESSAGE;
  payload: {
    content: string;
    source: string; // e.g. 'openclaw-cron'
  };
}

export interface SkillListResponseMessage extends BaseMessage {
  type: MessageType.SKILL_LIST_RESPONSE;
  payload: {
    skills: SkillManifestInfo[];
  };
}

export interface SkillManifestInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  audit: string;
  auditSource?: string;
  enabled: boolean;
  emoji?: string;
  eligible?: boolean;
  functions: Array<{ name: string; description: string }>;
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  payload: {
    code: ErrorCode;
    message: string;
    conversationId?: string;
  };
}

// ===== Desktop Messages =====

/** Desktop client registers with server, reports capabilities */
export interface DesktopRegisterMessage extends BaseMessage {
  type: MessageType.DESKTOP_REGISTER;
  payload: {
    os?: string;
    arch?: string;
    hostname?: string;
    localAgents?: string[];
    localSkills?: string[];
  };
}

/** Mobile sends command to desktop (routed through server) */
export interface DesktopCommandMessage extends BaseMessage {
  type: MessageType.DESKTOP_COMMAND;
  payload: {
    command: string;
    args?: Record<string, unknown>;
    targetDeviceId?: string;
  };
}

/** Desktop sends execution result back */
export interface DesktopResultMessage extends BaseMessage {
  type: MessageType.DESKTOP_RESULT;
  payload: {
    commandId: string;
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
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

export type ClientMessage = ConnectMessage | ChatSendMessage | ChatStopMessage | SkillListRequestMessage | SkillToggleMessage | DesktopRegisterMessage | DesktopCommandMessage | DesktopResultMessage | PingMessage;

export type ServerMessage =
  | ConnectedMessage
  | ChatChunkMessage
  | ChatDoneMessage
  | SkillStartMessage
  | SkillResultMessage
  | PushMessage
  | SkillListResponseMessage
  | DesktopCommandMessage
  | DesktopResultMessage
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
