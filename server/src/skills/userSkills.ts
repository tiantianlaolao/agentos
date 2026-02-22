/**
 * User-level Skill state management.
 *
 * Provides install/uninstall per user, catalog sync from registry,
 * and catalog query functions.
 */

import db from '../auth/db.js';
import { skillRegistry } from './registry.js';

// ── Types ──

export interface SkillCatalogEntry {
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  category: string;
  emoji: string | null;
  environments: string[];
  permissions: string[];
  functions: Array<{ name: string; description: string }>;
  audit: string;
  auditSource: string | null;
  visibility: string;
  owner: string | null;
  isDefault: boolean;
  installCount: number;
  featured: boolean;
}

export interface CatalogListOptions {
  category?: string;
  search?: string;
  environment?: string;
  /** User context for visibility filtering (private skills only visible to owner) */
  userPhone?: string;
  userId?: string;
}

// ── Prepared statements (lazy init) ──

const stmts = {
  install: db.prepare(
    'INSERT OR IGNORE INTO user_installed_skills (user_id, skill_name, installed_at, source) VALUES (?, ?, ?, ?)'
  ),
  uninstall: db.prepare(
    'DELETE FROM user_installed_skills WHERE user_id = ? AND skill_name = ?'
  ),
  getInstalled: db.prepare(
    'SELECT skill_name FROM user_installed_skills WHERE user_id = ?'
  ),
  isInstalled: db.prepare(
    'SELECT 1 FROM user_installed_skills WHERE user_id = ? AND skill_name = ?'
  ),
  getDefaults: db.prepare(
    'SELECT name FROM skill_catalog WHERE is_default = 1 AND visibility = \'public\''
  ),
  deleteCatalogNotIn: db.prepare(
    'DELETE FROM skill_catalog WHERE name NOT IN (SELECT value FROM json_each(?))'
  ),
  upsertCatalog: db.prepare(`
    INSERT INTO skill_catalog (name, version, description, author, category, emoji, environments, permissions, functions, audit, audit_source, visibility, owner, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      version = excluded.version,
      description = excluded.description,
      author = excluded.author,
      category = excluded.category,
      emoji = excluded.emoji,
      environments = excluded.environments,
      permissions = excluded.permissions,
      functions = excluded.functions,
      audit = excluded.audit,
      audit_source = excluded.audit_source,
      visibility = excluded.visibility,
      owner = excluded.owner,
      updated_at = excluded.updated_at
  `),
  listCatalog: db.prepare('SELECT * FROM skill_catalog'),
  listCatalogByCategory: db.prepare('SELECT * FROM skill_catalog WHERE category = ?'),
  incrementInstallCount: db.prepare('UPDATE skill_catalog SET install_count = COALESCE(install_count, 0) + 1 WHERE name = ?'),
  decrementInstallCount: db.prepare('UPDATE skill_catalog SET install_count = MAX(0, COALESCE(install_count, 0) - 1) WHERE name = ?'),
};

// ── User Skill CRUD ──

export function installSkillForUser(userId: string, skillName: string, source = 'library'): boolean {
  const result = stmts.install.run(userId, skillName, Date.now(), source);
  if (result.changes > 0) {
    stmts.incrementInstallCount.run(skillName);
  }
  return result.changes > 0;
}

export function uninstallSkillForUser(userId: string, skillName: string): boolean {
  const result = stmts.uninstall.run(userId, skillName);
  if (result.changes > 0) {
    stmts.decrementInstallCount.run(skillName);
  }
  return result.changes > 0;
}

export function getUserInstalledSkillNames(userId: string): string[] {
  const rows = stmts.getInstalled.all(userId) as Array<{ skill_name: string }>;
  return rows.map((r) => r.skill_name);
}

export function isSkillInstalledForUser(userId: string, skillName: string): boolean {
  return !!stmts.isInstalled.get(userId, skillName);
}

/**
 * Install all default skills for a newly registered user.
 * Called from createUser().
 */
export function installDefaultSkillsForUser(userId: string): void {
  const defaults = stmts.getDefaults.all() as Array<{ name: string }>;
  const now = Date.now();
  const insertMany = db.transaction(() => {
    for (const { name } of defaults) {
      stmts.install.run(userId, name, now, 'library');
    }
  });
  insertMany();
  console.log(`[UserSkills] Installed ${defaults.length} default skills for user ${userId}`);
}

// ── Catalog ──

/**
 * Sync all skills currently in the registry into the skill_catalog DB table.
 * Called once at startup after loadBuiltinSkills().
 */
export function syncCatalogFromRegistry(): void {
  const now = Date.now();
  const allSkills = skillRegistry.list();

  const syncAll = db.transaction(() => {
    for (const registered of allSkills) {
      const m = registered.manifest;
      stmts.upsertCatalog.run(
        m.name,
        m.version,
        m.description,
        m.author,
        m.category || 'general',
        m.emoji || null,
        JSON.stringify(m.environments || ['cloud']),
        JSON.stringify(m.permissions || []),
        JSON.stringify((m.functions || []).map((f) => ({ name: f.name, description: f.description }))),
        m.audit || 'platform',
        m.auditSource || 'AgentOS',
        m.visibility || 'public',
        m.owner || null,
        m.isDefault !== false ? 1 : 0,
        now,
        now,
      );
    }
  });
  syncAll();

  // Remove skills from catalog that are no longer in the registry
  const activeNames = allSkills.map((s) => s.manifest.name);
  const deleted = stmts.deleteCatalogNotIn.run(JSON.stringify(activeNames));
  if (deleted.changes > 0) {
    console.log(`[UserSkills] Removed ${deleted.changes} stale skill(s) from catalog`);
  }

  console.log(`[UserSkills] Synced ${allSkills.length} skills to catalog`);
}

/**
 * List skill catalog entries with optional filters.
 */
export function listSkillCatalog(opts?: CatalogListOptions): SkillCatalogEntry[] {
  let rows: Array<Record<string, unknown>>;

  if (opts?.category) {
    rows = stmts.listCatalogByCategory.all(opts.category) as Array<Record<string, unknown>>;
  } else {
    rows = stmts.listCatalog.all() as Array<Record<string, unknown>>;
  }

  let entries = rows.map(rowToCatalogEntry);

  // Visibility filtering: private skills only visible to their owner
  entries = entries.filter((e) => {
    if (!e.visibility || e.visibility === 'public') return true;
    if (!opts?.userPhone && !opts?.userId) return false;
    if (!e.owner) return false;
    return (!!opts.userPhone && e.owner === opts.userPhone) ||
           (!!opts.userId && e.owner === opts.userId);
  });

  if (opts?.search) {
    const q = opts.search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q)
    );
  }

  if (opts?.environment) {
    entries = entries.filter((e) => e.environments.includes(opts.environment!));
  }

  return entries;
}

function rowToCatalogEntry(row: Record<string, unknown>): SkillCatalogEntry {
  return {
    name: row.name as string,
    version: row.version as string,
    description: row.description as string | null,
    author: row.author as string | null,
    category: (row.category as string) || 'general',
    emoji: (row.emoji as string) || null,
    environments: safeJsonArray(row.environments as string) as string[],
    permissions: safeJsonArray(row.permissions as string) as string[],
    functions: safeJsonArray(row.functions as string) as Array<{ name: string; description: string }>,
    audit: (row.audit as string) || 'unreviewed',
    auditSource: row.audit_source as string | null,
    visibility: (row.visibility as string) || 'public',
    owner: row.owner as string | null,
    isDefault: (row.is_default as number) === 1,
    installCount: (row.install_count as number) || 0,
    featured: (row.featured as number) === 1,
  };
}

function safeJsonArray(val: string | null | undefined): unknown[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── User Skill Config ──

const configStmts = {
  get: db.prepare('SELECT config_json FROM user_skill_config WHERE user_id = ? AND skill_name = ?'),
  set: db.prepare(`
    INSERT INTO user_skill_config (user_id, skill_name, config_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, skill_name) DO UPDATE SET
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `),
};

export function getUserSkillConfig(userId: string, skillName: string): Record<string, unknown> {
  const row = configStmts.get.get(userId, skillName) as { config_json: string } | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.config_json);
  } catch {
    return {};
  }
}

export function setUserSkillConfig(userId: string, skillName: string, config: Record<string, unknown>): void {
  configStmts.set.run(userId, skillName, JSON.stringify(config), Date.now());
}
