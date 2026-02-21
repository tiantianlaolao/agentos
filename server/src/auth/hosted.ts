import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import db from './db.js';

export function createInvitationCode(code: string): void {
  db.prepare(
    'INSERT INTO invitation_codes (code, created_at) VALUES (?, ?)'
  ).run(code, Date.now());
}

export function batchCreateInvitationCodes(count: number, prefix = 'AOS'): string[] {
  const codes: string[] = [];
  const insert = db.prepare(
    'INSERT INTO invitation_codes (code, created_at) VALUES (?, ?)'
  );
  const now = Date.now();
  const batch = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const code = `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`;
      insert.run(code, now);
      codes.push(code);
    }
  });
  batch();
  return codes;
}

export function redeemInvitationCode(code: string, userId: string): { success: boolean; error?: string } {
  const row = db.prepare(
    'SELECT code, redeemed_by FROM invitation_codes WHERE code = ?'
  ).get(code) as { code: string; redeemed_by: string | null } | undefined;

  if (!row) {
    return { success: false, error: '邀请码不存在' };
  }
  if (row.redeemed_by) {
    return { success: false, error: '邀请码已被使用' };
  }

  // Check if user already has a hosted account
  const existing = db.prepare(
    'SELECT user_id FROM hosted_accounts WHERE user_id = ?'
  ).get(userId);
  if (existing) {
    return { success: false, error: '您已激活托管服务' };
  }

  const now = Date.now();
  const txn = db.transaction(() => {
    db.prepare(
      'UPDATE invitation_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ?'
    ).run(userId, now, code);
    db.prepare(
      'INSERT INTO hosted_accounts (user_id, quota_total, quota_used, activated_at) VALUES (?, 50, 0, ?)'
    ).run(userId, now);
  });
  txn();

  return { success: true };
}

export function getHostedAccount(userId: string): {
  userId: string;
  quotaTotal: number;
  quotaUsed: number;
  activatedAt: number;
  port: number | null;
  instanceToken: string | null;
  instanceStatus: string;
} | null {
  const row = db.prepare(
    'SELECT user_id, quota_total, quota_used, activated_at, port, instance_token, instance_status FROM hosted_accounts WHERE user_id = ?'
  ).get(userId) as { user_id: string; quota_total: number; quota_used: number; activated_at: number; port: number | null; instance_token: string | null; instance_status: string | null } | undefined;

  if (!row) return null;
  return {
    userId: row.user_id,
    quotaTotal: row.quota_total,
    quotaUsed: row.quota_used,
    activatedAt: row.activated_at,
    port: row.port,
    instanceToken: row.instance_token,
    instanceStatus: row.instance_status || 'pending',
  };
}

export function checkHostedQuota(userId: string): { allowed: boolean; used: number; total: number } {
  const account = getHostedAccount(userId);
  if (!account) return { allowed: false, used: 0, total: 0 };
  return {
    allowed: account.quotaUsed < account.quotaTotal,
    used: account.quotaUsed,
    total: account.quotaTotal,
  };
}

export function incrementHostedUsage(userId: string): void {
  db.prepare(
    'UPDATE hosted_accounts SET quota_used = quota_used + 1 WHERE user_id = ?'
  ).run(userId);
}

export function listInvitationCodes(filter?: { unused?: boolean }): Array<{
  code: string;
  createdAt: number;
  redeemedBy: string | null;
  redeemedAt: number | null;
}> {
  let sql = 'SELECT code, created_at, redeemed_by, redeemed_at FROM invitation_codes';
  if (filter?.unused) {
    sql += ' WHERE redeemed_by IS NULL';
  }
  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all() as Array<{
    code: string;
    created_at: number;
    redeemed_by: string | null;
    redeemed_at: number | null;
  }>;

  return rows.map((r) => ({
    code: r.code,
    createdAt: r.created_at,
    redeemedBy: r.redeemed_by,
    redeemedAt: r.redeemed_at,
  }));
}

// ── Per-user instance provisioning ──

function getNextAvailablePort(): number {
  const row = db.prepare('SELECT MAX(port) as maxPort FROM hosted_accounts').get() as { maxPort: number | null } | undefined;
  return (row?.maxPort || 18790) + 1; // first user gets 18791
}

/**
 * Provision a dedicated OpenClaw instance for a hosted user.
 * Sync part: allocate port, create dirs/files, update DB (instant).
 * Async part: PM2 start runs in background, updates status to 'ready' or 'error'.
 */
export function provisionHostedInstance(userId: string): { port: number; instanceToken: string } {
  const port = getNextAvailablePort();
  const instanceToken = randomBytes(24).toString('hex');
  const shortId = userId.slice(0, 8);
  const baseDir = process.env.HOSTED_BASE_DIR || '/opt/openclaw-hosted';
  const instanceDir = path.join(baseDir, `user-${shortId}`);
  const configPath = path.join(instanceDir, 'openclaw.json');
  const statePath = path.join(instanceDir, 'state');
  const workspacePath = path.join(instanceDir, 'workspace');
  const startScript = path.join(instanceDir, 'start.sh');

  // Create directories (including agent auth dir)
  fs.mkdirSync(instanceDir, { recursive: true });
  fs.mkdirSync(statePath, { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });
  const agentAuthDir = path.join(statePath, 'agents', 'main', 'agent');
  fs.mkdirSync(agentAuthDir, { recursive: true });

  // Write agent auth-profiles.json so OpenClaw can find the API key
  const deepseekKey = process.env.HOSTED_DEEPSEEK_API_KEY || '';
  const authProfiles = {
    version: 1,
    profiles: {
      'deepseek:default': { type: 'api_key', provider: 'deepseek', key: deepseekKey },
    },
    lastGood: { deepseek: 'deepseek:default' },
  };
  fs.writeFileSync(
    path.join(agentAuthDir, 'auth-profiles.json'),
    JSON.stringify(authProfiles, null, 2),
    { mode: 0o600 },
  );

  // Write OpenClaw config
  const config = {
    meta: { lastTouchedVersion: 'hosted-provision' },
    auth: {
      profiles: {
        'deepseek:default': { provider: 'deepseek', mode: 'api_key' },
      },
    },
    models: {
      mode: 'merge',
      providers: {
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          api: 'openai-completions',
          models: [{
            id: 'deepseek-chat',
            name: 'DeepSeek Chat',
            reasoning: false,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 8192,
          }],
        },
      },
    },
    agents: {
      defaults: {
        model: { primary: 'deepseek/deepseek-chat' },
        workspace: workspacePath,
        maxConcurrent: 2,
        subagents: { maxConcurrent: 4 },
      },
    },
    commands: { native: 'auto', nativeSkills: 'auto' },
    gateway: {
      port,
      mode: 'local',
      bind: 'loopback',
      auth: { mode: 'token', token: instanceToken },
    },
    skills: { install: { nodeManager: 'npm' } },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Write start script — load nvm to ensure correct Node version (>=22.12.0)
  const openclawBin = process.env.OPENCLAW_BIN || 'openclaw';
  const nvmDir = process.env.NVM_DIR || '/root/.nvm';
  fs.writeFileSync(startScript, [
    '#!/bin/bash',
    `export NVM_DIR="${nvmDir}"`,
    '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    `export OPENCLAW_CONFIG_PATH=${configPath}`,
    `export OPENCLAW_STATE_DIR=${statePath}`,
    `export DEEPSEEK_API_KEY=${deepseekKey}`,
    `exec ${openclawBin} gateway`,
  ].join('\n'), { mode: 0o755 });

  // Update DB with port, token and provisioning status (sync, instant)
  db.prepare(
    'UPDATE hosted_accounts SET port = ?, instance_token = ?, instance_status = ? WHERE user_id = ?'
  ).run(port, instanceToken, 'provisioning', userId);

  // Start PM2 process in background (async, doesn't block HTTP response)
  const pmName = `openclaw-user-${shortId}`;
  exec(`pm2 start ${startScript} --name ${pmName} --interpreter bash`, { timeout: 30000 }, (err) => {
    if (err) {
      console.error(`[Hosted] Failed to start instance for ${shortId}:`, err.message);
      db.prepare('UPDATE hosted_accounts SET instance_status = ? WHERE user_id = ?')
        .run('error', userId);
      return;
    }
    console.log(`[Hosted] PM2 started for user ${shortId}, waiting for port ${port}...`);
    // Health check: poll the Gateway port to confirm it's actually running
    let attempts = 0;
    const maxAttempts = 15; // 15 * 2s = 30s max wait
    const healthCheck = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
        if (res && res.ok) {
          clearInterval(healthCheck);
          console.log(`[Hosted] Instance ready for user ${shortId} on port ${port}`);
          db.prepare('UPDATE hosted_accounts SET instance_status = ? WHERE user_id = ?')
            .run('ready', userId);
        } else if (attempts >= maxAttempts) {
          clearInterval(healthCheck);
          console.error(`[Hosted] Instance health check timed out for ${shortId}`);
          db.prepare('UPDATE hosted_accounts SET instance_status = ? WHERE user_id = ?')
            .run('error', userId);
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(healthCheck);
          console.error(`[Hosted] Instance health check failed for ${shortId}`);
          db.prepare('UPDATE hosted_accounts SET instance_status = ? WHERE user_id = ?')
            .run('error', userId);
        }
      }
    }, 2000);
  });

  return { port, instanceToken };
}
