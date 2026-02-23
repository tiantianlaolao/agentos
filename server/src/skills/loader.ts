/**
 * Skill Loader — Auto-registers all skills from subdirectories at startup.
 *
 * Each skill is a folder under src/skills/ with:
 *   - manifest.ts (exports `manifest: SkillManifest`)
 *   - handler.ts  (exports `handlers: Record<string, SkillHandler>`)
 *   - index.ts    (barrel export)
 */

import { skillRegistry } from './registry.js';
import { syncCatalogFromRegistry, installDefaultSkillsForUser } from './userSkills.js';
import { setInstallDefaultSkillsFn } from '../auth/db.js';
import { listAllExternalSkills, externalToManifest } from './externalSkills.js';
import { createExternalHandler } from './externalHandler.js';
import { loadSkillMdFiles } from './skillmd/loader.js';
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

  try {
    const usstockMonitor = await import('./usstock-monitor/index.js');
    skills.push(usstockMonitor);
  } catch (err) {
    console.error('[SkillLoader] Failed to load usstock-monitor skill:', err);
  }

  try {
    const currencyExchange = await import('./currency-exchange/index.js');
    skills.push(currencyExchange);
  } catch (err) {
    console.error('[SkillLoader] Failed to load currency-exchange skill:', err);
  }

  try {
    const calculator = await import('./calculator/index.js');
    skills.push(calculator);
  } catch (err) {
    console.error('[SkillLoader] Failed to load calculator skill:', err);
  }

  try {
    const urlSummary = await import('./url-summary/index.js');
    skills.push(urlSummary);
  } catch (err) {
    console.error('[SkillLoader] Failed to load url-summary skill:', err);
  }

  try {
    const webSearch = await import('./web-search/index.js');
    skills.push(webSearch);
  } catch (err) {
    console.error('[SkillLoader] Failed to load web-search skill:', err);
  }

  try {
    const imageGeneration = await import('./image-generation/index.js');
    skills.push(imageGeneration);
  } catch (err) {
    console.error('[SkillLoader] Failed to load image-generation skill:', err);
  }

  try {
    const datetime = await import('./datetime/index.js');
    skills.push(datetime);
  } catch (err) {
    console.error('[SkillLoader] Failed to load datetime skill:', err);
  }

  try {
    const claudeCode = await import('./claude-code/index.js');
    skills.push(claudeCode);
  } catch (err) {
    console.error('[SkillLoader] Failed to load claude-code skill:', err);
  }

  // Register all loaded skills
  for (const skill of skills) {
    try {
      skillRegistry.register(skill.manifest, skill.handlers);
    } catch (err) {
      console.error(`[SkillLoader] Failed to register skill "${skill.manifest.name}":`, err);
    }
  }

  console.log(`[SkillLoader] Loaded ${skillRegistry.list().length} built-in skills`);

  // Load external (user-created) skills from DB
  loadExternalSkills();

  // Load SKILL.md files from data/skills-md/
  const mdCount = loadSkillMdFiles();
  if (mdCount > 0) {
    console.log(`[SkillLoader] Loaded ${mdCount} SKILL.md skills`);
  }

  // Sync all registered skills to the skill_catalog DB table
  syncCatalogFromRegistry();

  // Register the auto-install function for new user creation
  setInstallDefaultSkillsFn(installDefaultSkillsForUser);
}

/**
 * Load user-created external skills from DB and register them.
 */
function loadExternalSkills(): void {
  try {
    const externalSkills = listAllExternalSkills();
    let loaded = 0;
    for (const def of externalSkills) {
      try {
        const manifest = externalToManifest(def);
        const handlers = createExternalHandler(def);
        skillRegistry.register(manifest, handlers);
        loaded++;
      } catch (err) {
        console.error(`[SkillLoader] Failed to load external skill "${def.name}":`, err);
      }
    }
    if (loaded > 0) {
      console.log(`[SkillLoader] Loaded ${loaded} external skills`);
    }
  } catch (err) {
    console.error('[SkillLoader] Failed to load external skills:', err);
  }
}
