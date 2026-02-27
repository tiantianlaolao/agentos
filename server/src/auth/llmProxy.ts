import { Router, type Request, type Response } from 'express';
import { verifyToken } from './jwt.js';
import { checkHostedQuota, incrementHostedUsage, getHostedAccount } from './hosted.js';
import db from './db.js';

const router = Router();

const DEEPSEEK_API_KEY = process.env.HOSTED_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * POST /api/llm-proxy/v1/chat/completions
 *
 * OpenAI-compatible proxy endpoint for local OpenClaw instances using "default" mode.
 * - Authorization: Bearer <JWT token>
 * - Body: OpenAI chat completion format
 * - Streams SSE responses back to the client
 */
router.post('/v1/chat/completions', async (req: Request, res: Response) => {
  // 1. Verify JWT
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: { message: 'Missing authorization token', type: 'auth_error' } });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: { message: 'Invalid or expired token', type: 'auth_error' } });
    return;
  }

  // 2. Check quota (auto-create hosted account for proxy users if needed)
  if (!getHostedAccount(decoded.userId)) {
    db.prepare(
      'INSERT INTO hosted_accounts (user_id, quota_total, quota_used, activated_at) VALUES (?, 50, 0, ?)'
    ).run(decoded.userId, Date.now());
  }
  const quota = checkHostedQuota(decoded.userId);
  if (!quota.allowed) {
    res.status(429).json({
      error: {
        message: `Quota exceeded (${quota.used}/${quota.total}). Please upgrade or use your own API key.`,
        type: 'quota_exceeded',
      },
    });
    return;
  }

  // 3. Check API key configured
  if (!DEEPSEEK_API_KEY) {
    res.status(500).json({ error: { message: 'Server DeepSeek API key not configured', type: 'server_error' } });
    return;
  }

  // 4. Forward to DeepSeek
  const isStream = req.body?.stream === true;

  try {
    const upstreamRes = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(req.body),
    });

    if (!upstreamRes.ok) {
      const errorBody = await upstreamRes.text();
      res.status(upstreamRes.status).json({
        error: { message: `DeepSeek API error: ${errorBody}`, type: 'upstream_error' },
      });
      return;
    }

    // Increment usage
    incrementHostedUsage(decoded.userId);

    if (isStream && upstreamRes.body) {
      // Stream SSE response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamErr) {
        console.error('[LLM Proxy] Stream error:', streamErr);
      } finally {
        res.end();
      }
    } else {
      // Non-streaming response
      const data = await upstreamRes.json();
      res.json(data);
    }
  } catch (err) {
    console.error('[LLM Proxy] Request error:', err);
    res.status(502).json({
      error: { message: 'Failed to reach DeepSeek API', type: 'proxy_error' },
    });
  }
});

export default router;
