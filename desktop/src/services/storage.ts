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

/** Run once: keep only the latest conversation per (mode, userId). */
export function migrateToSingleConversation(): void {
  const migrated = localStorage.getItem('agentos-single-conv-migrated');
  if (migrated) return;
  const all = loadConversations();
  const groups = new Map<string, Conversation[]>();
  for (const c of all) {
    const key = `${c.mode}|${c.userId || ''}`;
    const arr = groups.get(key) || [];
    arr.push(c);
    groups.set(key, arr);
  }
  for (const [, convs] of groups) {
    convs.sort((a, b) => b.updatedAt - a.updatedAt);
    for (let i = 1; i < convs.length; i++) {
      localStorage.removeItem(messagesKey(convs[i].id));
    }
  }
  const kept = [...groups.values()].map((g) => g[0]);
  storeConversations(kept);
  localStorage.setItem('agentos-single-conv-migrated', '1');
}

/** Get the single conversation for a (mode, userId) pair, creating one if it doesn't exist. */
export function getOrCreateSingleConversation(mode: AgentMode, userId?: string): Conversation {
  const convs = getConversations(mode, userId);
  if (convs.length > 0) return convs[0];
  const now = Date.now();
  const conv: Conversation = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 8),
    title: 'Chat',
    mode,
    userId,
    createdAt: now,
    updatedAt: now,
  };
  saveConversation(conv);
  return conv;
}

/** Clear all messages for a conversation (keep conversation itself). */
export function clearConversationMessages(conversationId: string): void {
  localStorage.setItem(messagesKey(conversationId), JSON.stringify([]));
}

/** Get messages with pagination (returns messages in chronological order). */
export function getMessagesPaginated(conversationId: string, limit: number, beforeTimestamp?: number): Message[] {
  let msgs = getMessages(conversationId);
  if (beforeTimestamp) {
    msgs = msgs.filter((m) => m.timestamp < beforeTimestamp);
  }
  // Take the last `limit` messages (most recent)
  return msgs.slice(-limit);
}

/** Get total message count for a conversation. */
export function getMessageCount(conversationId: string): number {
  return getMessages(conversationId).length;
}

/** Delete the oldest N messages from a conversation, returning their content. */
export function deleteOldestMessages(conversationId: string, count: number): { role: string; content: string }[] {
  const msgs = getMessages(conversationId);
  const deleted = msgs.slice(0, count);
  const remaining = msgs.slice(count);
  localStorage.setItem(messagesKey(conversationId), JSON.stringify(remaining));
  return deleted.map((m) => ({ role: m.role, content: m.content }));
}
