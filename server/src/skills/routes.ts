/**
 * External Skills REST API Routes.
 *
 * POST   /skills/register  — Register a new external HTTP skill
 * DELETE /skills/:name      — Unregister an external skill
 * GET    /skills/my         — List user's external skills
 *
 * All routes require JWT authentication.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { verifyToken } from '../auth/jwt.js';
import { skillRegistry } from './registry.js';
import { syncCatalogFromRegistry } from './userSkills.js';
import { createExternalHandler } from './externalHandler.js';
import {
  registerExternalSkill,
  unregisterExternalSkill,
  listUserExternalSkills,
  externalToManifest,
} from './externalSkills.js';
import type { SkillFunction } from '../adapters/base.js';

const router = Router();

/** Extract userId from JWT bearer token */
function getUserFromAuth(req: Request): { userId: string; phone: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) return null;
  return { userId: decoded.userId, phone: decoded.phone };
}

/**
 * POST /skills/register
 * Body: { name, displayName?, description, endpointUrl, functions }
 */
router.post('/register', (req: Request, res: Response) => {
  const user = getUserFromAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { name, displayName, description, endpointUrl, functions } = req.body as {
    name?: string;
    displayName?: string;
    description?: string;
    endpointUrl?: string;
    functions?: SkillFunction[];
  };

  if (!name || !endpointUrl || !functions || !Array.isArray(functions)) {
    res.status(400).json({
      error: 'Required fields: name, endpointUrl, functions (array)',
    });
    return;
  }

  // Validate name format
  if (!/^[a-z0-9-]+$/.test(name)) {
    res.status(400).json({
      error: 'Skill name must contain only lowercase letters, digits, and hyphens',
    });
    return;
  }

  if (name.length > 32) {
    res.status(400).json({ error: 'Skill name too long (max 32 characters)' });
    return;
  }

  try {
    const def = registerExternalSkill(
      user.userId,
      name,
      displayName || name,
      description || '',
      endpointUrl,
      functions,
    );

    // Register in the live registry
    const manifest = externalToManifest(def);
    const handlers = createExternalHandler(def);
    skillRegistry.register(manifest, handlers);
    syncCatalogFromRegistry();

    res.json({
      success: true,
      skill: {
        name: def.name,
        displayName: def.displayName,
        description: def.description,
        endpointUrl: def.endpointUrl,
        functions: def.functions.length,
      },
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Registration failed',
    });
  }
});

/**
 * DELETE /skills/:name
 * Unregisters the external skill (owner only).
 */
router.delete('/:name', (req: Request, res: Response) => {
  const user = getUserFromAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const name = req.params.name as string;
  const removed = unregisterExternalSkill(user.userId, name);

  if (removed) {
    skillRegistry.unregister(name);
    syncCatalogFromRegistry();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Skill not found or not owned by you' });
  }
});

/**
 * GET /skills/my
 * List user's registered external skills.
 */
router.get('/my', (req: Request, res: Response) => {
  const user = getUserFromAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const skills = listUserExternalSkills(user.userId);
  res.json({
    skills: skills.map((s) => ({
      name: s.name,
      displayName: s.displayName,
      description: s.description,
      endpointUrl: s.endpointUrl,
      functions: s.functions.length,
      createdAt: s.createdAt,
    })),
  });
});

export default router;
