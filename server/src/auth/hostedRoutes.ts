import { Router, type Request, type Response } from 'express';
import { verifyToken } from './jwt.js';
import {
  batchCreateInvitationCodes,
  redeemInvitationCode,
  getHostedAccount,
  listInvitationCodes,
  provisionHostedInstance,
  updateHostedProvider,
} from './hosted.js';

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// POST /hosted/generate-codes — Admin only
router.post('/generate-codes', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!ADMIN_TOKEN || auth !== `Bearer ${ADMIN_TOKEN}`) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { count, prefix } = req.body as { count?: number; prefix?: string };
  if (!count || typeof count !== 'number' || count < 1 || count > 100) {
    res.status(400).json({ error: 'count must be 1-100' });
    return;
  }

  const codes = batchCreateInvitationCodes(count, prefix || undefined);
  res.json({ codes });
});

// POST /hosted/activate — JWT auth required
router.post('/activate', (req: Request, res: Response) => {
  if (process.env.HOSTED_ENABLED !== 'true') {
    res.json({ error: '云托管功能暂未开放' });
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '请先登录' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: '登录已过期' });
    return;
  }

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: '请输入邀请码' });
    return;
  }

  const result = redeemInvitationCode(code.trim(), decoded.userId);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Provision a dedicated OpenClaw instance (async, doesn't block response)
  provisionHostedInstance(decoded.userId);

  const account = getHostedAccount(decoded.userId);
  res.json({ success: true, account });
});

// GET /hosted/status — JWT auth required
router.get('/status', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '请先登录' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: '登录已过期' });
    return;
  }

  const account = getHostedAccount(decoded.userId);
  res.json({ activated: !!account, account });
});

// POST /hosted/update-model — JWT auth, update hosted instance model/provider
router.post('/update-model', (req: Request, res: Response) => {
  if (process.env.HOSTED_ENABLED !== 'true') {
    res.json({ error: '云托管功能暂未开放' });
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '请先登录' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: '登录已过期' });
    return;
  }

  const { provider, apiKey, model } = req.body as {
    provider?: string;
    apiKey?: string;
    model?: string;
  };

  if (!provider || !apiKey) {
    res.status(400).json({ error: 'provider and apiKey are required' });
    return;
  }

  const result = updateHostedProvider(decoded.userId, provider, apiKey, model);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true });
});

// GET /hosted/codes — Admin only, list codes
router.get('/codes', (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!ADMIN_TOKEN || auth !== `Bearer ${ADMIN_TOKEN}`) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const unused = req.query.unused === 'true';
  const codes = listInvitationCodes(unused ? { unused: true } : undefined);
  res.json({ codes });
});

export default router;
