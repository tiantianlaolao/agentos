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
  SKILL_INSTALL = 'skill.install',
  SKILL_UNINSTALL = 'skill.uninstall',
  SKILL_LIBRARY_REQUEST = 'skill.library.request',
  SKILL_CONFIG_GET = 'skill.config.get',
  SKILL_CONFIG_SET = 'skill.config.set',

  // Server -> Client
  CONNECTED = 'connected',
  CHAT_CHUNK = 'chat.chunk',
  CHAT_DONE = 'chat.done',
  SKILL_START = 'skill.start',
  SKILL_RESULT = 'skill.result',
  PUSH_MESSAGE = 'push.message',
  SKILL_LIST_RESPONSE = 'skill.list.response',
  SKILL_LIBRARY_RESPONSE = 'skill.library.response',
  SKILL_CONFIG_RESPONSE = 'skill.config.response',
  ERROR = 'error',

  // Bidirectional
  PING = 'ping',
  PONG = 'pong',
}

export type ConnectionMode = 'builtin' | 'openclaw' | 'copaw' | 'byok' | 'desktop';

export type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'qwen' | 'zhipu' | 'openrouter';

export type LLMModel = 'deepseek' | 'moonshot' | 'anthropic' | 'openai' | 'gemini' | 'qwen' | 'zhipu' | 'openrouter';

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
    copawHosted?: boolean;
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

export interface SkillInstallMessage extends BaseMessage {
  type: MessageType.SKILL_INSTALL;
  payload: {
    skillName: string;
  };
}

export interface SkillUninstallMessage extends BaseMessage {
  type: MessageType.SKILL_UNINSTALL;
  payload: {
    skillName: string;
  };
}

export interface SkillLibraryRequestMessage extends BaseMessage {
  type: MessageType.SKILL_LIBRARY_REQUEST;
  payload?: {
    category?: string;
    search?: string;
    environment?: string;
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
  installed?: boolean;
  environments?: string[];
  category?: string;
  visibility?: string;
  emoji?: string;
  eligible?: boolean;
  source?: string;
  functions: Array<{ name: string; description: string }>;
  locales?: Record<string, { displayName?: string; description?: string; functions?: Record<string, string> }>;
}

export interface SkillLibraryResponseMessage extends BaseMessage {
  type: MessageType.SKILL_LIBRARY_RESPONSE;
  payload: {
    skills: SkillLibraryItem[];
  };
}

export interface SkillLibraryItem {
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  emoji?: string;
  environments: string[];
  permissions: string[];
  audit: string;
  auditSource?: string;
  visibility: string;
  installed: boolean;
  isDefault: boolean;
  installCount: number;
  featured: boolean;
  functions: Array<{ name: string; description: string }>;
  locales?: Record<string, { displayName?: string; description?: string; functions?: Record<string, string> }>;
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

export type ClientMessage = ConnectMessage | ChatSendMessage | ChatStopMessage | SkillListRequestMessage | SkillToggleMessage | SkillInstallMessage | SkillUninstallMessage | SkillLibraryRequestMessage | PingMessage;

export type ServerMessage =
  | ConnectedMessage
  | ChatChunkMessage
  | ChatDoneMessage
  | SkillStartMessage
  | SkillResultMessage
  | PushMessage
  | SkillListResponseMessage
  | SkillLibraryResponseMessage
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
