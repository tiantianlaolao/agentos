import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

// Late-bound import to avoid circular dependency (userSkills imports db)
let _installDefaultSkillsForUser: ((userId: string) => void) | null = null;

export function setInstallDefaultSkillsFn(fn: (userId: string) => void): void {
  _installDefaultSkillsForUser = fn;
}

const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'agentos.db');

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER,
    daily_limit INTEGER DEFAULT 50
  );

  CREATE TABLE IF NOT EXISTS sms_codes (
    phone TEXT,
    code TEXT,
    expires_at INTEGER,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS invitation_codes (
    code TEXT PRIMARY KEY,
    created_at INTEGER,
    redeemed_by TEXT,
    redeemed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS hosted_accounts (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    quota_total INTEGER DEFAULT 50,
    quota_used INTEGER DEFAULT 0,
    activated_at INTEGER,
    port INTEGER,
    instance_token TEXT,
    instance_status TEXT DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS skill_catalog (
    name TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    description TEXT,
    author TEXT,
    category TEXT DEFAULT 'general',
    environments TEXT DEFAULT '["cloud"]',
    permissions TEXT DEFAULT '[]',
    functions TEXT DEFAULT '[]',
    audit TEXT DEFAULT 'unreviewed',
    audit_source TEXT,
    visibility TEXT DEFAULT 'public',
    owner TEXT,
    is_default INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS user_installed_skills (
    user_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    installed_at INTEGER NOT NULL,
    source TEXT DEFAULT 'library',
    PRIMARY KEY (user_id, skill_name)
  );
`);

// Migration: add per-user instance columns for existing DBs
try { db.exec('ALTER TABLE hosted_accounts ADD COLUMN port INTEGER'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE hosted_accounts ADD COLUMN instance_token TEXT'); } catch { /* already exists */ }
try { db.exec("ALTER TABLE hosted_accounts ADD COLUMN instance_status TEXT DEFAULT 'pending'"); } catch { /* already exists */ }

// Migration: add emoji and install_count to skill_catalog
try { db.exec('ALTER TABLE skill_catalog ADD COLUMN emoji TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE skill_catalog ADD COLUMN install_count INTEGER DEFAULT 0'); } catch { /* already exists */ }
// Migration: add featured column to skill_catalog
try { db.exec('ALTER TABLE skill_catalog ADD COLUMN featured INTEGER DEFAULT 0'); } catch { /* already exists */ }
// Migration: add locales column to skill_catalog
try { db.exec('ALTER TABLE skill_catalog ADD COLUMN locales TEXT'); } catch { /* already exists */ }

// User skill config table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_skill_config (
    user_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    config_json TEXT DEFAULT '{}',
    updated_at INTEGER,
    PRIMARY KEY (user_id, skill_name)
  );
`);

// User MCP servers table (per-user isolation)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_mcp_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    args TEXT DEFAULT '[]',
    env TEXT,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER,
    UNIQUE(user_id, name)
  );
`);

export function initDatabase(): void {
  console.log('[DB] SQLite database initialized at', DB_PATH);
}

export function createUser(phone: string, passwordHash: string): { id: string; phone: string } {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO users (id, phone, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, phone, passwordHash, now);

  // Auto-install default skills for new user
  if (_installDefaultSkillsForUser) {
    try {
      _installDefaultSkillsForUser(id);
    } catch (err) {
      console.error('[DB] Failed to install default skills for new user:', err);
    }
  }

  return { id, phone };
}

export function findUserByPhone(phone: string) {
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as
    | { id: string; phone: string; password_hash: string; created_at: number; daily_limit: number }
    | undefined;
}

export function findUserById(id: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | { id: string; phone: string; password_hash: string; created_at: number; daily_limit: number }
    | undefined;
}

export function saveSmsCode(phone: string, code: string, expiresAt: number): void {
  const now = Date.now();
  db.prepare(
    'INSERT INTO sms_codes (phone, code, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(phone, code, expiresAt, now);
}

export function verifySmsCode(phone: string, code: string): boolean {
  const now = Date.now();
  const row = db.prepare(
    'SELECT rowid FROM sms_codes WHERE phone = ? AND code = ? AND expires_at > ?'
  ).get(phone, code, now) as { rowid: number } | undefined;

  if (!row) return false;

  // Delete used code
  db.prepare('DELETE FROM sms_codes WHERE phone = ? AND code = ?').run(phone, code);
  return true;
}

export function getLatestSmsCode(phone: string) {
  return db.prepare(
    'SELECT * FROM sms_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1'
  ).get(phone) as { phone: string; code: string; expires_at: number; created_at: number } | undefined;
}

export default db;
