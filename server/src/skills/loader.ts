/**
 * Skill Loader — Auto-registers all skills from subdirectories at startup.
 *
 * Each skill is a folder under src/skills/ with:
 *   - manifest.ts (exports `manifest: SkillManifest`)
 *   - handler.ts  (exports `handlers: Record<string, SkillHandler>`)
 *   - index.ts    (barrel export)
 */

import { skillRegistry } from './registry.js';
import type { SkillManifest } from '../adapters/base.js';
import type { SkillHandler } from './registry.js';

interface SkillModule {
  manifest: SkillManifest;
  handlers: Record<string, SkillHandler>;
}

/**
 * Load all built-in skills. Called once at server startup.
 * Skills are imported statically to avoid dynamic import complexity with TypeScript/ESM.
 */
export async function loadBuiltinSkills(): Promise<void> {
  const skills: SkillModule[] = [];

  // Import each skill module
  try {
    const weather = await import('./weather/index.js');
    skills.push(weather);
  } catch (err) {
    console.error('[SkillLoader] Failed to load weather skill:', err);
  }

  try {
    const translate = await import('./translate/index.js');
    skills.push(translate);
  } catch (err) {
    console.error('[SkillLoader] Failed to load translate skill:', err);
  }

  // Register all loaded skills
  for (const skill of skills) {
    try {
      skillRegistry.register(skill.manifest, skill.handlers);
    } catch (err) {
      console.error(`[SkillLoader] Failed to register skill "${skill.manifest.name}":`, err);
    }
  }

  console.log(`[SkillLoader] Loaded ${skillRegistry.list().length} skills`);
}
