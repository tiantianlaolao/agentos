/**
 * ClawHub CLI wrapper — used by hosted OpenClaw mode to browse/install/uninstall
 * community skills from the ClawHub marketplace.
 *
 * Gateway has no ClawHub RPC, so we shell out to the `clawhub` CLI.
 */

import { execFile } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

// ── Types ──

export interface ClawHubSkillInfo {
  name: string;
  slug: string;
  description: string;
  author: string;
  version: string;
  category?: string;
  emoji?: string;
}

// ── In-memory cache for explore results (60s TTL) ──

let _exploreCache: ClawHubSkillInfo[] | null = null;
let _exploreCacheTime = 0;
const EXPLORE_CACHE_TTL = 60_000;

// ── Slug validation (prevents command injection) ──

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function validateSlug(slug: string): void {
  if (!slug || !SLUG_RE.test(slug) || slug.length > 128) {
    throw new Error(`Invalid skill slug: "${slug}"`);
  }
}

// ── Shell helpers ──

function execClawhub(args: string[], timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('clawhub', args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`clawhub ${args[0]} failed: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Parse `clawhub explore` / `clawhub search` output.
 *
 * Expected format (one skill per line):
 *   slug  description  (author)  vX.Y.Z
 * or JSON array output if `--json` flag is supported.
 */
function parseSkillList(output: string): ClawHubSkillInfo[] {
  if (!output) return [];

  // Try JSON first (clawhub may support --json)
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed.map((item: Record<string, unknown>) => ({
        name: String(item.name || item.slug || ''),
        slug: String(item.slug || item.name || ''),
        description: String(item.description || ''),
        author: String(item.author || ''),
        version: String(item.version || '1.0.0'),
        category: typeof item.category === 'string' ? item.category : undefined,
        emoji: typeof item.emoji === 'string' ? item.emoji : undefined,
      }));
    }
  } catch {
    // Not JSON — parse line-by-line
  }

  const skills: ClawHubSkillInfo[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

    // explore format: "slug  vX.Y.Z  time_ago  description…"
    // search format:  "slug vX.Y.Z  Display Name  (score)"
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length >= 2) {
      // First part may be "slug vX.Y.Z" (search) or just "slug" (explore)
      const firstPart = parts[0].trim();
      const slugVersionMatch = firstPart.match(/^([a-z0-9][a-z0-9-]*)\s+v(\d+\.\d+\.\d+)$/);
      let slug: string;
      let version = '1.0.0';

      if (slugVersionMatch) {
        // search format: "slug vX.Y.Z"
        slug = slugVersionMatch[1];
        version = slugVersionMatch[2];
      } else if (SLUG_RE.test(firstPart)) {
        slug = firstPart;
        // explore format: second part is "vX.Y.Z"
        const vMatch = parts[1]?.match(/^v(\d+\.\d+\.\d+)$/);
        if (vMatch) {
          version = vMatch[1];
        }
      } else {
        continue;
      }

      // Collect description from remaining parts (skip version/time fields)
      const descParts = parts.slice(1).filter((p) => {
        if (/^v\d+\.\d+\.\d+$/.test(p)) return false; // version
        if (/^\d+[smhd] ago$/.test(p) || p === 'just now') return false; // time
        if (/^\(\d+\.\d+\)$/.test(p)) return false; // score
        return true;
      });

      skills.push({
        name: slug,
        slug,
        description: descParts.join(' ').trim(),
        author: 'ClawHub',
        version,
      });
    }
  }
  return skills;
}

// ── Name → Slug resolution ──

/**
 * Scan workspace/skills/ to build a displayName → dirName mapping.
 * Gateway returns the SKILL.md `name` field (e.g. "DOCX", "Inspiration"),
 * but clawhub install/uninstall and the filesystem use the directory slug
 * (e.g. "word-docx", "inspiration").
 */
export async function resolveSkillSlug(displayName: string, workdir: string): Promise<string> {
  // If it already looks like a valid slug, check if directory exists first
  if (SLUG_RE.test(displayName)) {
    try {
      const entries = await readdir(path.join(workdir, 'skills'));
      if (entries.includes(displayName)) return displayName;
    } catch { /* fall through */ }
  }

  // Scan all skill dirs and match by name field in SKILL.md / skill.yaml
  try {
    const skillsDir = path.join(workdir, 'skills');
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirName = entry.name;
      // Try skill.yaml first, then SKILL.md
      for (const filename of ['skill.yaml', 'SKILL.md']) {
        try {
          const raw = await readFile(path.join(skillsDir, dirName, filename), 'utf-8');
          // Extract name from YAML frontmatter: "name: <value>"
          const nameMatch = raw.match(/^name:\s*(.+)$/m);
          if (nameMatch) {
            const skillName = nameMatch[1].trim();
            if (skillName === displayName) {
              console.log(`[ClawHub] Resolved display name "${displayName}" → slug "${dirName}"`);
              return dirName;
            }
          }
        } catch { /* file doesn't exist, try next */ }
      }
    }
  } catch {
    // skills dir doesn't exist
  }

  // Last resort: lowercase + replace spaces with hyphens
  const guessed = displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  console.log(`[ClawHub] Could not resolve "${displayName}", guessing slug: "${guessed}"`);
  return guessed;
}

// ── Public API ──

/**
 * List all available skills on ClawHub (cached for 60s).
 */
export async function clawhubExplore(): Promise<ClawHubSkillInfo[]> {
  if (_exploreCache && Date.now() - _exploreCacheTime < EXPLORE_CACHE_TTL) {
    return _exploreCache;
  }

  try {
    const output = await execClawhub(['explore', '--limit', '500']);
    _exploreCache = parseSkillList(output);
    _exploreCacheTime = Date.now();
    console.log(`[ClawHub] Explore returned ${_exploreCache.length} skills`);
  } catch (err) {
    console.error('[ClawHub] explore failed:', err instanceof Error ? err.message : err);
    return _exploreCache || [];
  }

  return _exploreCache;
}

/**
 * Search ClawHub for skills matching a query.
 */
export async function clawhubSearch(query: string): Promise<ClawHubSkillInfo[]> {
  if (!query.trim()) return clawhubExplore();

  try {
    const output = await execClawhub(['search', query, '--limit', '30']);
    return parseSkillList(output);
  } catch (err) {
    console.error('[ClawHub] search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Install a ClawHub skill into a hosted workspace.
 * Gateway auto-hot-reloads when it detects the new skill directory.
 */
export async function clawhubInstall(slug: string, workdir: string): Promise<void> {
  validateSlug(slug);
  console.log(`[ClawHub] Installing "${slug}" into ${workdir}`);
  await execClawhub(['install', slug, '--workdir', workdir, '--force', '--no-input'], 60_000);
  console.log(`[ClawHub] Installed "${slug}" successfully`);
}

/**
 * Uninstall a ClawHub skill by removing its directory from the workspace.
 * Gateway auto-removes the skill when the directory disappears.
 */
export async function clawhubUninstall(slug: string, workdir: string): Promise<void> {
  validateSlug(slug);
  console.log(`[ClawHub] Uninstalling "${slug}" from ${workdir}`);
  try {
    await execClawhub(['uninstall', slug, '--workdir', workdir], 30_000);
  } catch {
    // Fallback: remove directory directly if CLI uninstall fails
    const skillDir = path.join(workdir, 'skills', slug);
    await rm(skillDir, { recursive: true, force: true });
  }
  console.log(`[ClawHub] Uninstalled "${slug}" successfully`);
}

