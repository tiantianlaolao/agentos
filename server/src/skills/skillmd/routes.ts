/**
 * SKILL.md Management REST API Routes.
 *
 * GET    /skills/md          — List all loaded SKILL.md skills
 * POST   /skills/md/upload   — Upload a new SKILL.md (requires auth)
 * POST   /skills/md/generate — AI-generate a SKILL.md from description (requires auth)
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
    registerSkillMd(parsed.name, parsed.description, parsed.body, parsed.version, parsed.emoji, parsed.locales);
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
 * POST /skills/md/generate
 * Body: { description: string, locale?: string }
 * Use DeepSeek AI to generate a SKILL.md from a plain-text description.
 * Returns { content, parsed: { name, description, emoji } } for preview.
 */
router.post('/generate', async (req: Request, res: Response) => {
  const user = getUserFromAuth(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { description, locale } = req.body as { description?: string; locale?: string };
  if (!description || typeof description !== 'string' || !description.trim()) {
    res.status(400).json({ error: 'Required field: description (plain-text description of the skill)' });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured on server' });
    return;
  }

  const systemPrompt = `You are a SKILL.md generator for AgentOS. Generate a skill definition in markdown format.

The file MUST start with YAML frontmatter (delimited by ---) containing:
- name: lowercase-with-hyphens (e.g. "code-review")
- description: one-line English description
- emoji: a relevant emoji
- name_zh: Chinese name
- description_zh: Chinese description

After the frontmatter, write the skill body in markdown with practical instructions, examples, templates, and best practices. The body should be comprehensive (at least 50 lines).

Only output the SKILL.md content, nothing else.`;

  const userPrompt = locale === 'zh'
    ? `请生成一个技能定义，用户需求描述如下：\n\n${description.trim()}`
    : `Generate a skill definition based on the following user request:\n\n${description.trim()}`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[generate] DeepSeek API error:', response.status, errText);
      res.status(502).json({ error: `AI service error: ${response.status}` });
      return;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let content = data.choices?.[0]?.message?.content?.trim() || '';

    // Strip markdown code fences if the model wrapped the output
    if (content.startsWith('```')) {
      content = content.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    if (!content.startsWith('---')) {
      res.status(502).json({ error: 'AI generated invalid content (missing frontmatter)' });
      return;
    }

    // Validate by parsing
    const parsed = parseSkillMd(content);

    res.json({
      content,
      parsed: {
        name: parsed.name,
        description: parsed.description,
        emoji: parsed.emoji || '',
      },
    });
  } catch (err) {
    console.error('[generate] error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Generation failed',
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
