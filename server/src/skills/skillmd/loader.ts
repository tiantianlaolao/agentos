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

/** Convert a skill name to a safe function-name suffix (lowercase, underscores) */
function toSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

/**
 * Register a single parsed SKILL.md into the registry.
 * Exported so the upload route can reuse it.
 */
export function registerSkillMd(name: string, description: string, body: string, version?: string, emoji?: string): void {
  const safeName = toSafeName(name);

  skillMdContent.set(name, body);

  const manifest: SkillManifest = {
    name: `md-${name}`,
    version: version || '1.0.0',
    description,
    author: 'SKILL.md',
    agents: '*',
    environments: ['cloud', 'desktop'],
    permissions: ['exec'],
    functions: [{
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
    }],
    audit: 'ecosystem',
    auditSource: 'SKILL.md',
    category: 'knowledge',
    emoji: emoji || '📝',
    isDefault: false,
  };

  const handlers: Record<string, SkillHandler> = {
    [`use_${safeName}`]: async (args) => {
      const request = (args.request as string) || '';
      const doc = skillMdContent.get(name) || '';
      return JSON.stringify({
        instruction: [
          `Below are instructions from the "${name}" skill.`,
          `Follow them to fulfill the user's request.`,
          `Use available tools (run_shell, read_file, web_search, etc.) as needed.`,
          '',
          '---',
          doc,
          '---',
          '',
          `User request: ${request}`,
        ].join('\n'),
      });
    },
  };

  skillRegistry.register(manifest, handlers);
}

/**
 * Unregister a SKILL.md skill from the registry and clear its cached content.
 */
export function unregisterSkillMd(name: string): boolean {
  skillMdContent.delete(name);
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

      if (entry.isFile() && entry.name.endsWith('.md')) {
        // Single file: data/skills-md/github-cli.md
        content = fs.readFileSync(path.join(SKILLMD_DIR, entry.name), 'utf-8');
      } else if (entry.isDirectory()) {
        // Sub-directory: data/skills-md/github-cli/SKILL.md
        const skillPath = path.join(SKILLMD_DIR, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          content = fs.readFileSync(skillPath, 'utf-8');
        }
      }

      if (!content) continue;

      const parsed = parseSkillMd(content);
      registerSkillMd(parsed.name, parsed.description, parsed.body, parsed.version, parsed.emoji);
      loaded++;
    } catch (err) {
      console.error(`[SkillMd] Failed to load "${entry.name}":`, err instanceof Error ? err.message : err);
    }
  }

  return loaded;
}
