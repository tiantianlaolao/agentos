import type { AgentMode } from '../types/index.ts';

export interface Conversation {
  id: string;
  title: string;
  mode: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  skillName?: string;
}

const CONVERSATIONS_KEY = 'agentos-conversations';

function messagesKey(conversationId: string): string {
  return `agentos-messages-${conversationId}`;
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

function storeConversations(conversations: Conversation[]): void {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

export function getConversations(mode?: AgentMode, userId?: string): Conversation[] {
  let conversations = loadConversations();
  if (mode) {
    conversations = conversations.filter((c) => c.mode === mode);
  }
  // Always filter by userId: logged-in users see only their own,
  // anonymous users (userId=undefined) see only conversations without userId
  conversations = conversations.filter((c) => (c.userId || '') === (userId || ''));
  conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  return conversations;
}

export function saveConversation(conv: Conversation): void {
  const conversations = loadConversations();
  const idx = conversations.findIndex((c) => c.id === conv.id);
  if (idx >= 0) {
    conversations[idx] = conv;
  } else {
    conversations.push(conv);
  }
  storeConversations(conversations);
}

export function getMessages(conversationId: string): Message[] {
  try {
    const raw = localStorage.getItem(messagesKey(conversationId));
    if (!raw) return [];
    const msgs = JSON.parse(raw) as Message[];
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    return msgs;
  } catch {
    return [];
  }
}

export function saveMessage(msg: Message): void {
  const msgs = getMessages(msg.conversationId);
  const idx = msgs.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    msgs[idx] = msg;
  } else {
    msgs.push(msg);
  }
  localStorage.setItem(messagesKey(msg.conversationId), JSON.stringify(msgs));
}

export function getConversationById(id: string): Conversation | undefined {
  return loadConversations().find((c) => c.id === id);
}

export function deleteConversation(id: string): void {
  const conversations = loadConversations().filter((c) => c.id !== id);
  storeConversations(conversations);
  localStorage.removeItem(messagesKey(id));
}
