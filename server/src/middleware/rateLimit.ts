import type { ConnectionMode } from '../types/protocol.js';

interface RateLimitEntry {
  count: number;
  resetDate: string; // YYYY-MM-DD
}

const store = new Map<string, RateLimitEntry>();

const ANONYMOUS_LIMIT = parseInt(process.env.FREE_TIER_DAILY_LIMIT || '20', 10);
const REGISTERED_LIMIT = parseInt(process.env.REGISTERED_DAILY_LIMIT || '50', 10);

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Check if a user/device has exceeded the daily message limit.
 * Only applies to 'builtin' mode. Registered users get higher limits.
 */
export function checkRateLimit(
  identifier: string,
  mode: ConnectionMode,
  isRegistered = false
): { allowed: boolean; remaining: number } {
  // TODO: Rate limiting temporarily disabled for testing. Re-enable with pricing rules later.
  return { allowed: true, remaining: Infinity };
}

/**
 * Increment the message count for a user/device. Call after a successful message.
 */
export function incrementCount(identifier: string): void {
  const today = todayString();
  let entry = store.get(identifier);

  if (!entry || entry.resetDate !== today) {
    entry = { count: 0, resetDate: today };
    store.set(identifier, entry);
  }

  entry.count++;
}
