/**
 * SkillRegistry — Dynamic skill loading and management.
 *
 * Skills are registered as (SkillManifest + handler function) pairs.
 * The registry provides:
 *   - register / get / list / enable / disable
 *   - Conversion to OpenAI Function Calling tool format
 *   - Execution by function name
 *
 * Uses SkillManifest from the shared contract (adapters/base.ts).
 */

import type { SkillManifest, SkillFunction } from '../adapters/base.js';

/** Handler function type: receives parsed arguments, returns a string result */
export type SkillHandler = (args: Record<string, unknown>) => Promise<string>;

export interface RegisteredSkill {
  manifest: SkillManifest;
  handlers: Map<string, SkillHandler>;
  enabled: boolean;
}

/**
 * OpenAI Function Calling tool definition.
 * Used to tell the LLM what tools are available.
 */
export interface FunctionCallingTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** User context for skill visibility filtering */
export interface SkillUserContext {
  userId?: string | null;
  userPhone?: string | null;
}

class SkillRegistry {
  private skills = new Map<string, RegisteredSkill>();

  /**
   * Check if a skill is visible to the given user.
   * Public skills (or no visibility set) are visible to everyone.
   * Private skills are only visible to the owner (matched by phone).
   */
  private isVisibleTo(skill: RegisteredSkill, ctx?: SkillUserContext): boolean {
    const m = skill.manifest;
    if (!m.visibility || m.visibility === 'public') return true;
    if (!ctx) return false;
    if (!m.owner) return false;
    // Match by phone (primary) or userId
    return (!!ctx.userPhone && m.owner === ctx.userPhone) ||
           (!!ctx.userId && m.owner === ctx.userId);
  }

  /**
   * Register a skill with its manifest and handler map.
   * Each function in the manifest should have a corresponding handler.
   */
  register(
    manifest: SkillManifest,
    handlers: Record<string, SkillHandler>,
  ): void {
    const handlerMap = new Map<string, SkillHandler>();
    for (const fn of manifest.functions) {
      const handler = handlers[fn.name];
      if (!handler) {
        console.warn(
          `[SkillRegistry] Skill "${manifest.name}" missing handler for function "${fn.name}", skipping function`,
        );
        continue;
      }
      handlerMap.set(fn.name, handler);
    }

    this.skills.set(manifest.name, {
      manifest,
      handlers: handlerMap,
      enabled: true,
    });

    console.log(
      `[SkillRegistry] Registered skill "${manifest.name}" v${manifest.version} (${handlerMap.size} functions)`,
    );
  }

  /** Get a registered skill by name */
  get(name: string): RegisteredSkill | undefined {
    return this.skills.get(name);
  }

  /** List all registered skills */
  list(): RegisteredSkill[] {
    return Array.from(this.skills.values());
  }

  /** List only enabled skills */
  listEnabled(): RegisteredSkill[] {
    return this.list().filter((s) => s.enabled);
  }

  /** List manifests only (for sending to mobile client) */
  listManifests(): SkillManifest[] {
    return this.list().map((s) => s.manifest);
  }

  /** Enable or disable a skill */
  setEnabled(name: string, enabled: boolean): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.enabled = enabled;
    console.log(`[SkillRegistry] Skill "${name}" ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Convert all enabled skills to OpenAI Function Calling tools array.
   * This is passed to the LLM so it can decide which skill to call.
   */
  toFunctionCallingTools(): FunctionCallingTool[] {
    const tools: FunctionCallingTool[] = [];
    for (const skill of this.listEnabled()) {
      for (const fn of skill.manifest.functions) {
        tools.push({
          type: 'function',
          function: {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters,
          },
        });
      }
    }
    return tools;
  }

  /**
   * Find the skill that owns a given function name.
   * Returns the skill and its handler, or null if not found.
   */
  findFunction(functionName: string): {
    skill: RegisteredSkill;
    handler: SkillHandler;
    functionDef: SkillFunction;
  } | null {
    for (const skill of this.listEnabled()) {
      const handler = skill.handlers.get(functionName);
      if (handler) {
        const functionDef = skill.manifest.functions.find(
          (f) => f.name === functionName,
        )!;
        return { skill, handler, functionDef };
      }
    }
    return null;
  }

  /**
   * Execute a function by name with the given arguments.
   * Returns { skillName, result } or throws if not found.
   */
  async execute(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<{ skillName: string; result: string }> {
    const found = this.findFunction(functionName);
    if (!found) {
      throw new Error(`No handler found for function "${functionName}"`);
    }
    const result = await found.handler(args);
    return { skillName: found.skill.manifest.name, result };
  }

  // ── User-filtered variants (visibility-aware) ──

  /** List all skills visible to the given user */
  listForUser(ctx?: SkillUserContext): RegisteredSkill[] {
    return this.list().filter((s) => this.isVisibleTo(s, ctx));
  }

  /** List only enabled skills visible to the given user */
  listEnabledForUser(ctx?: SkillUserContext): RegisteredSkill[] {
    return this.listForUser(ctx).filter((s) => s.enabled);
  }

  /** Convert enabled + visible skills to FC tools for a specific user */
  toFunctionCallingToolsForUser(ctx?: SkillUserContext): FunctionCallingTool[] {
    const tools: FunctionCallingTool[] = [];
    for (const skill of this.listEnabledForUser(ctx)) {
      for (const fn of skill.manifest.functions) {
        tools.push({
          type: 'function',
          function: {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters,
          },
        });
      }
    }
    return tools;
  }

  /** Find a function, checking visibility for the user */
  findFunctionForUser(functionName: string, ctx?: SkillUserContext): {
    skill: RegisteredSkill;
    handler: SkillHandler;
    functionDef: SkillFunction;
  } | null {
    for (const skill of this.listEnabledForUser(ctx)) {
      const handler = skill.handlers.get(functionName);
      if (handler) {
        const functionDef = skill.manifest.functions.find(
          (f) => f.name === functionName,
        )!;
        return { skill, handler, functionDef };
      }
    }
    return null;
  }

  /** Execute a function with visibility check for user */
  async executeForUser(
    functionName: string,
    args: Record<string, unknown>,
    ctx?: SkillUserContext,
  ): Promise<{ skillName: string; result: string }> {
    const found = this.findFunctionForUser(functionName, ctx);
    if (!found) {
      throw new Error(`No handler found for function "${functionName}"`);
    }
    const result = await found.handler(args);
    return { skillName: found.skill.manifest.name, result };
  }

  // ── Installed-user variants (filter by user's installed skill names) ──

  /** List skills that are both enabled+visible AND in the user's installed list */
  private listInstalledForUser(ctx: SkillUserContext | undefined, installedNames: string[]): RegisteredSkill[] {
    return this.listEnabledForUser(ctx).filter((s) => installedNames.includes(s.manifest.name));
  }

  /** Convert installed + enabled + visible skills to FC tools */
  toToolsForInstalledUser(ctx: SkillUserContext | undefined, installedNames: string[]): FunctionCallingTool[] {
    const tools: FunctionCallingTool[] = [];
    for (const skill of this.listInstalledForUser(ctx, installedNames)) {
      for (const fn of skill.manifest.functions) {
        tools.push({
          type: 'function',
          function: {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters,
          },
        });
      }
    }
    return tools;
  }

  /** Find a function only among installed skills */
  findFunctionForInstalledUser(functionName: string, ctx: SkillUserContext | undefined, installedNames: string[]): {
    skill: RegisteredSkill;
    handler: SkillHandler;
    functionDef: SkillFunction;
  } | null {
    for (const skill of this.listInstalledForUser(ctx, installedNames)) {
      const handler = skill.handlers.get(functionName);
      if (handler) {
        const functionDef = skill.manifest.functions.find(
          (f) => f.name === functionName,
        )!;
        return { skill, handler, functionDef };
      }
    }
    return null;
  }

  /** Execute a function with installed + visibility check */
  async executeForInstalledUser(
    functionName: string,
    args: Record<string, unknown>,
    ctx: SkillUserContext | undefined,
    installedNames: string[],
  ): Promise<{ skillName: string; result: string }> {
    const found = this.findFunctionForInstalledUser(functionName, ctx, installedNames);
    if (!found) {
      throw new Error(`No handler found for function "${functionName}"`);
    }
    const result = await found.handler(args);
    return { skillName: found.skill.manifest.name, result };
  }
}

/** Singleton registry instance */
export const skillRegistry = new SkillRegistry();
