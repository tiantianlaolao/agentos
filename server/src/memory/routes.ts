import { Router, type Request, type Response } from 'express';
import { verifyToken } from '../auth/jwt.js';
import { getMemoryWithMeta, updateMemory } from './store.js';

const router = Router();

// GET /memory — returns user's memory content + metadata
router.get('/', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: 'Token expired' });
    return;
  }

  const data = getMemoryWithMeta(decoded.userId);
  res.json({ ok: true, data: data ?? null });
});

// PUT /memory — update user's memory content
router.put('/', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ ok: false, error: 'Token expired' });
    return;
  }

  const { content } = req.body as { content?: string };
  if (typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'content is required' });
    return;
  }

  updateMemory(decoded.userId, content);
  const data = getMemoryWithMeta(decoded.userId);
  res.json({ ok: true, data: { updatedAt: data?.updatedAt ?? new Date().toISOString() } });
});

export default router;
