/**
 * External Skills — User-created HTTP Skill endpoints.
 *
 * Users can register their own skill implementations via HTTP endpoints.
 * External skills are namespaced as "ext:{userId}:{name}" and marked as 'unreviewed'.
 */

import db from '../auth/db.js';
import type { SkillManifest, SkillFunction } from '../adapters/base.js';

export interface ExternalSkillDef {
  name: string;
  displayName: string;
  description: string;
  endpointUrl: string;
  functions: SkillFunction[];
  userId: string;
  createdAt: number;
}

// ── DB table migration ──

db.exec(`
  CREATE TABLE IF NOT EXISTS external_skills (
    name TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT,
    endpoint_url TEXT NOT NULL,
    functions TEXT DEFAULT '[]',
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const stmts = {
  insert: db.prepare(`
    INSERT INTO external_skills (name, display_name, description, endpoint_url, functions, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  delete: db.prepare('DELETE FROM external_skills WHERE name = ? AND user_id = ?'),
  listByUser: db.prepare('SELECT * FROM external_skills WHERE user_id = ?'),
  listAll: db.prepare('SELECT * FROM external_skills'),
  getByName: db.prepare('SELECT * FROM external_skills WHERE name = ?'),
};

/**
 * Generate namespaced skill name.
 * Format: ext:{shortUserId}:{name}
 */
function makeExternalName(userId: string, name: string): string {
  const shortId = userId.slice(0, 8);
  return `ext:${shortId}:${name}`;
}

/**
 * Register an external HTTP skill.
 */
export function registerExternalSkill(
  userId: string,
  rawName: string,
  displayName: string,
  description: string,
  endpointUrl: string,
  functions: SkillFunction[],
): ExternalSkillDef {
  const name = makeExternalName(userId, rawName);

  // Check if already exists
  const existing = stmts.getByName.get(name) as Record<string, unknown> | undefined;
  if (existing) {
    throw new Error(`External skill "${name}" already registered`);
  }

  const now = Date.now();
  stmts.insert.run(
    name,
    displayName,
    description,
    endpointUrl,
    JSON.stringify(functions),
    userId,
    now,
  );

  console.log(`[ExternalSkills] Registered "${name}" by user ${userId}`);

  return { name, displayName, description, endpointUrl, functions, userId, createdAt: now };
}

/**
 * Unregister an external skill (owner only).
 */
export function unregisterExternalSkill(userId: string, name: string): boolean {
  const result = stmts.delete.run(name, userId);
  if (result.changes > 0) {
    console.log(`[ExternalSkills] Unregistered "${name}"`);
  }
  return result.changes > 0;
}

/**
 * List all external skills for a specific user.
 */
export function listUserExternalSkills(userId: string): ExternalSkillDef[] {
  const rows = stmts.listByUser.all(userId) as Array<Record<string, unknown>>;
  return rows.map(rowToDef);
}

/**
 * List ALL external skills (for startup loading).
 */
export function listAllExternalSkills(): ExternalSkillDef[] {
  const rows = stmts.listAll.all() as Array<Record<string, unknown>>;
  return rows.map(rowToDef);
}

/**
 * Get a single external skill by name.
 */
export function getExternalSkill(name: string): ExternalSkillDef | null {
  const row = stmts.getByName.get(name) as Record<string, unknown> | undefined;
  return row ? rowToDef(row) : null;
}

/**
 * Convert an ExternalSkillDef to a SkillManifest.
 */
export function externalToManifest(def: ExternalSkillDef): SkillManifest {
  return {
    name: def.name,
    version: '1.0.0',
    description: def.description,
    author: `user:${def.userId.slice(0, 8)}`,
    agents: '*',
    environments: ['cloud'],
    permissions: ['network'],
    functions: def.functions,
    audit: 'unreviewed',
    category: 'general',
    emoji: '🔌',
    isDefault: false,
    visibility: 'private',
    owner: def.userId,
  };
}

function rowToDef(row: Record<string, unknown>): ExternalSkillDef {
  let functions: SkillFunction[] = [];
  try {
    functions = JSON.parse(row.functions as string);
  } catch { /* ignore */ }

  return {
    name: row.name as string,
    displayName: row.display_name as string,
    description: (row.description as string) || '',
    endpointUrl: row.endpoint_url as string,
    functions,
    userId: row.user_id as string,
    createdAt: row.created_at as number,
  };
}
