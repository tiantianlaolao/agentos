/**
 * SQLite storage service.
 * Persists conversations and messages locally.
 *
 * TODO: Implement in Step 1 (frontend agent):
 * - Database initialization and migrations
 * - CRUD operations for conversations and messages
 * - Settings persistence
 */

import * as SQLite from 'expo-sqlite';
import type { ChatMessage, Conversation } from '../stores/chatStore';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('agentos.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      skill_name TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, timestamp);
  `);
}

export async function getConversations(): Promise<Conversation[]> {
  if (!db) throw new Error('Database not initialized');
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
  }>('SELECT * FROM conversations ORDER BY updated_at DESC');

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function saveConversation(conv: Conversation): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    conv.id,
    conv.title,
    conv.createdAt,
    conv.updatedAt
  );
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  if (!db) throw new Error('Database not initialized');
  const rows = await db.getAllAsync<{
    id: string;
    conversation_id: string;
    role: string;
    content: string;
    timestamp: number;
    skill_name: string | null;
  }>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC', conversationId);

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    timestamp: r.timestamp,
    skillName: r.skill_name || undefined,
  }));
}

export async function saveMessage(msg: ChatMessage): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT OR REPLACE INTO messages (id, conversation_id, role, content, timestamp, skill_name) VALUES (?, ?, ?, ?, ?, ?)',
    msg.id,
    msg.conversationId,
    msg.role,
    msg.content,
    msg.timestamp,
    msg.skillName || null
  );
}

export async function deleteConversation(id: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM conversations WHERE id = ?', id);
}

export async function getSetting(key: string): Promise<string | null> {
  if (!db) throw new Error('Database not initialized');
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    value
  );
}
