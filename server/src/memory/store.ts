import db from '../auth/db.js';

// Create user_memories table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

export function getMemory(userId: string): string | null {
  const row = db.prepare(
    'SELECT content FROM user_memories WHERE userId = ?'
  ).get(userId) as { content: string } | undefined;
  return row?.content ?? null;
}

export function getMemoryWithMeta(userId: string): { content: string; updatedAt: string } | null {
  const row = db.prepare(
    'SELECT content, updatedAt FROM user_memories WHERE userId = ?'
  ).get(userId) as { content: string; updatedAt: string } | undefined;
  return row ?? null;
}

export function updateMemory(userId: string, content: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_memories (userId, content, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET content = excluded.content, updatedAt = excluded.updatedAt
  `).run(userId, content, now);
}

/**
 * Migrate memory from deviceId to userId on first login.
 * If userId already has memory, merge; otherwise move.
 */
export function migrateMemory(deviceId: string, userId: string): void {
  const deviceMemory = getMemory(deviceId);
  if (!deviceMemory) return;

  const userMemory = getMemory(userId);
  if (userMemory) {
    // Both exist — append device memory to user memory
    updateMemory(userId, userMemory + '\n' + deviceMemory);
  } else {
    // Move device memory to userId
    updateMemory(userId, deviceMemory);
  }
  // Delete old device memory
  db.prepare('DELETE FROM user_memories WHERE userId = ?').run(deviceId);
  console.log(`[Memory] Migrated memory from device ${deviceId.slice(0, 8)}… to user ${userId.slice(0, 8)}…`);
}
