/**
 * SKILL.md Management REST API Routes.
 *
 * GET    /skills/md          — List all loaded SKILL.md skills
 * POST   /skills/md/upload   — Upload a new SKILL.md (requires auth)
 * DELETE /skills/md/:name    — Delete a SKILL.md skill (requires auth)
 */

import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { verifyToken } from '../../auth/jwt.js';
import { parseSkillMd } from './parser.js';
import { registerSkillMd, unregisterSkillMd, listLoadedSkillMdNames } from './loader.js';
import { syncCatalogFromRegistry } from '../userSkills.js';

const router = Router();
const SKILLMD_DIR = path.join(process.cwd(), 'data', 'skills-md');

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
 * GET /skills/md
 * List all loaded SKILL.md skill names and their registry names.
 */
router.get('/', (_req: Request, res: Response) => {
  const names = listLoadedSkillMdNames();
  res.json({
    count: names.length,
    skills: names.map((n) => ({ name: n, registryName: `md-${n}` })),
  });
});

/**
 * POST /skills/md/upload
 * Body: { name: string, content: string }
 * Parse, validate, save to disk, register, and sync catalog.
 */
router.post('/upload', (req: Request, res: Response) => {
  const user = getUserFromAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { content } = req.body as { content?: string };
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'Required field: content (SKILL.md raw text)' });
    return;
  }

  try {
    const parsed = parseSkillMd(content);

    // Validate name format
    if (!/^[a-z0-9-]+$/.test(parsed.name)) {
      res.status(400).json({ error: 'Skill name must contain only lowercase letters, digits, and hyphens' });
      return;
    }

    // Ensure data directory exists
    if (!fs.existsSync(SKILLMD_DIR)) {
      fs.mkdirSync(SKILLMD_DIR, { recursive: true });
    }

    // Save to disk as single file
    const filePath = path.join(SKILLMD_DIR, `${parsed.name}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');

    // Register in live registry
    registerSkillMd(parsed.name, parsed.description, parsed.body, parsed.version, parsed.emoji);
    syncCatalogFromRegistry();

    res.json({
      success: true,
      skill: {
        name: parsed.name,
        registryName: `md-${parsed.name}`,
        description: parsed.description,
        emoji: parsed.emoji || '📝',
      },
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Upload failed',
    });
  }
});

/**
 * DELETE /skills/md/:name
 * Remove a SKILL.md skill from disk and registry.
 */
router.delete('/:name', (req: Request, res: Response) => {
  const user = getUserFromAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const name = req.params.name as string;

  // Unregister from runtime
  const removed = unregisterSkillMd(name);
  if (!removed) {
    res.status(404).json({ error: `SKILL.md skill "${name}" not found` });
    return;
  }

  // Remove file from disk (try both layouts)
  const singleFile = path.join(SKILLMD_DIR, `${name}.md`);
  const dirFile = path.join(SKILLMD_DIR, name, 'SKILL.md');
  if (fs.existsSync(singleFile)) {
    fs.unlinkSync(singleFile);
  } else if (fs.existsSync(dirFile)) {
    fs.unlinkSync(dirFile);
    // Remove directory if empty
    try { fs.rmdirSync(path.join(SKILLMD_DIR, name)); } catch { /* not empty, ignore */ }
  }

  syncCatalogFromRegistry();
  res.json({ success: true });
});

export default router;
