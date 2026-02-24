/**
 * SKILL.md Loader — Scans data/skills-md/ for SKILL.md files and registers them
 * as FC function-trigger skills in the SkillRegistry.
 *
 * Supports two layout conventions:
 *   data/skills-md/github-cli.md          (single file)
 *   data/skills-md/github-cli/SKILL.md    (sub-directory, OpenClaw convention)
 */

import fs from 'fs';
import path from 'path';
import { parseSkillMd } from './parser.js';
import { skillRegistry } from '../registry.js';
import type { SkillManifest } from '../../adapters/base.js';
import type { SkillHandler } from '../registry.js';

const SKILLMD_DIR = path.join(process.cwd(), 'data', 'skills-md');

/** In-memory cache: parsed.name → markdown body */
const skillMdContent = new Map<string, string>();

/** In-memory cache for directory-mode skills: parsed.name → Map<relativePath, docContent> */
const skillMdDocs = new Map<string, Map<string, string>>();

/** Convert a skill name to a safe function-name suffix (lowercase, underscores) */
function toSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

/**
 * Recursively scan a directory for .md files (excluding SKILL.md itself).
 * Returns Map<relative/path.md, fileContent> using forward slashes (cross-platform).
 */
function scanDocs(dir: string, basePath = ''): Map<string, string> {
  const docs = new Map<string, string>();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return docs;
  }
  for (const entry of entries) {
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
      docs.set(relPath, fs.readFileSync(path.join(dir, entry.name), 'utf-8'));
    } else if (entry.isDirectory()) {
      const sub = scanDocs(path.join(dir, entry.name), relPath);
      for (const [k, v] of sub) docs.set(k, v);
    }
  }
  return docs;
}

/**
 * Register a single parsed SKILL.md into the registry.
 * Exported so the upload route can reuse it.
 *
 * When `docs` is provided (directory mode), an additional `read_{name}_doc` function
 * is registered, allowing the AI to load specific sub-documents on demand.
 */
export function registerSkillMd(
  name: string,
  description: string,
  body: string,
  version?: string,
  emoji?: string,
  locales?: Record<string, { displayName?: string; description?: string }>,
  docs?: Map<string, string>,
): void {
  const safeName = toSafeName(name);
  const hasDocDir = docs != null && docs.size > 0;

  skillMdContent.set(name, body);
  if (hasDocDir) {
    skillMdDocs.set(name, docs);
  }

  const manifest: SkillManifest = {
    name: `md-${name}`,
    version: version || '1.0.0',
    description,
    author: 'SKILL.md',
    agents: '*',
    environments: ['cloud', 'desktop'],
    permissions: [],
    functions: [
      {
        name: `use_${safeName}`,
        description: `Use the "${name}" skill. ${description}`,
        parameters: {
          type: 'object',
          properties: {
            request: {
              type: 'string',
              description: 'What you want to accomplish with this skill',
            },
          },
          required: ['request'],
        },
      },
      // Directory mode: add read_doc function for on-demand sub-document loading
      ...(hasDocDir ? [{
        name: `read_${safeName}_doc`,
        description: `Read a detailed document from the "${name}" skill. Call use_${safeName} first to see the index of available documents.`,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the document, e.g. "rules/animations.md"',
            },
          },
          required: ['path'],
        },
      }] : []),
    ],
    audit: 'ecosystem',
    auditSource: 'SKILL.md',
    category: 'knowledge',
    emoji: emoji || '📝',
    isDefault: false,
    locales: locales || undefined,
  };

  const handlers: Record<string, SkillHandler> = {
    [`use_${safeName}`]: async (args) => {
      const request = (args.request as string) || '';
      const doc = skillMdContent.get(name) || '';
      const docMap = skillMdDocs.get(name);
      const lines = [
        `Below are instructions from the "${name}" skill.`,
        `Follow them to fulfill the user's request.`,
        `Use available tools (run_shell, read_file, web_search, etc.) as needed.`,
      ];
      if (docMap && docMap.size > 0) {
        lines.push(`\nThis skill has ${docMap.size} detailed docs. Call read_${safeName}_doc(path) to load specific topics as needed.`);
      }
      lines.push('', '---', doc, '---', '', `User request: ${request}`);
      return JSON.stringify({ instruction: lines.join('\n') });
    },
  };

  // Directory mode: add read_doc handler
  if (hasDocDir) {
    handlers[`read_${safeName}_doc`] = async (args) => {
      const rawPath = (args.path as string) || '';
      // Normalize to forward slashes for cross-platform compatibility (Windows → Mac)
      const docPath = rawPath.replace(/\\/g, '/');
      const docMap = skillMdDocs.get(name);
      if (!docMap) {
        return JSON.stringify({ error: 'No docs available for this skill' });
      }
      const content = docMap.get(docPath);
      if (!content) {
        return JSON.stringify({
          error: `Document not found: ${docPath}`,
          available: Array.from(docMap.keys()),
        });
      }
      return JSON.stringify({ path: docPath, content });
    };
  }

  skillRegistry.register(manifest, handlers);
  if (hasDocDir) {
    console.log(`[SkillMd] Directory mode: "${name}" with ${docs.size} sub-docs`);
  }
}

/**
 * Unregister a SKILL.md skill from the registry and clear its cached content.
 */
export function unregisterSkillMd(name: string): boolean {
  skillMdContent.delete(name);
  skillMdDocs.delete(name);
  return skillRegistry.unregister(`md-${name}`);
}

/**
 * List all currently loaded SKILL.md skill names.
 */
export function listLoadedSkillMdNames(): string[] {
  return Array.from(skillMdContent.keys());
}

/**
 * Scan data/skills-md/ directory and register all found SKILL.md files.
 * Returns the number of skills successfully loaded.
 */
export function loadSkillMdFiles(): number {
  if (!fs.existsSync(SKILLMD_DIR)) {
    return 0;
  }

  const entries = fs.readdirSync(SKILLMD_DIR, { withFileTypes: true });
  let loaded = 0;

  for (const entry of entries) {
    try {
      let content: string | null = null;
      let docs: Map<string, string> | undefined;

      if (entry.isFile() && entry.name.endsWith('.md')) {
        // Single file: data/skills-md/github-cli.md
        content = fs.readFileSync(path.join(SKILLMD_DIR, entry.name), 'utf-8');
      } else if (entry.isDirectory()) {
        // Sub-directory: data/skills-md/github-cli/SKILL.md
        const skillPath = path.join(SKILLMD_DIR, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          content = fs.readFileSync(skillPath, 'utf-8');
          // Scan for additional docs (directory mode)
          const scanned = scanDocs(path.join(SKILLMD_DIR, entry.name));
          if (scanned.size > 0) {
            docs = scanned;
          }
        }
      }

      if (!content) continue;

      const parsed = parseSkillMd(content);
      registerSkillMd(parsed.name, parsed.description, parsed.body, parsed.version, parsed.emoji, parsed.locales, docs);
      loaded++;
    } catch (err) {
      console.error(`[SkillMd] Failed to load "${entry.name}":`, err instanceof Error ? err.message : err);
    }
  }

  return loaded;
}
