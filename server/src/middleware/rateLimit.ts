import type { ConnectionMode } from '../types/protocol.js';

interface RateLimitEntry {
  count: number;
  resetDate: string; // YYYY-MM-DD
}

const store = new Map<string, RateLimitEntry>();

const dailyLimit = parseInt(process.env.FREE_TIER_DAILY_LIMIT || '20', 10);

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check if a device has exceeded the daily message limit.
 * Only applies to 'builtin' mode. Returns { allowed, remaining }.
 */
export function checkRateLimit(
  deviceId: string,
  mode: ConnectionMode
): { allowed: boolean; remaining: number } {
  // byok and openclaw are unlimited
  if (mode !== 'builtin') {
    return { allowed: true, remaining: Infinity };
  }

  const today = todayString();
  let entry = store.get(deviceId);

  // Reset if it's a new day
  if (!entry || entry.resetDate !== today) {
    entry = { count: 0, resetDate: today };
    store.set(deviceId, entry);
  }

  const remaining = Math.max(0, dailyLimit - entry.count);
  return { allowed: entry.count < dailyLimit, remaining };
}

/**
 * Increment the message count for a device. Call after a successful message.
 */
export function incrementCount(deviceId: string): void {
  const today = todayString();
  let entry = store.get(deviceId);

  if (!entry || entry.resetDate !== today) {
    entry = { count: 0, resetDate: today };
    store.set(deviceId, entry);
  }

  entry.count++;
}
