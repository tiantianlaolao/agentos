import { Router, type Request, type Response } from 'express';
import { verifyToken } from '../auth/jwt.js';
import { getMemoryWithMeta, updateMemory } from './store.js';
import { extractAndUpdateMemory } from './extractor.js';
import { DeepSeekProvider } from '../providers/deepseek.js';

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

// POST /memory/extract — batch extract memory from messages (used by client auto-cleanup)
router.post('/extract', async (req: Request, res: Response) => {
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

  const { messages } = req.body as { messages?: { role: string; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ ok: false, error: 'messages array is required' });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: 'DEEPSEEK_API_KEY not configured' });
    return;
  }

  const provider = new DeepSeekProvider(apiKey, process.env.DEEPSEEK_BASE_URL);
  const chatMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  try {
    await extractAndUpdateMemory(decoded.userId, chatMessages, provider);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Memory] Batch extract failed:', error);
    res.status(500).json({ ok: false, error: 'Extraction failed' });
  }
});

export default router;
