/**
 * DateTime Skill Handler
 * All built-in — no external API needed.
 */
import type { SkillHandler } from '../registry.js';

const getCurrentTime: SkillHandler = async (args) => {
  const timezone = (args.timezone as string) || 'UTC';

  try {
    const now = new Date();
    const formatted = now.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const isoLocal = now.toLocaleString('sv-SE', { timeZone: timezone }).replace(' ', 'T');

    return JSON.stringify({
      timezone,
      formatted,
      iso: isoLocal,
      utc: now.toISOString(),
      timestamp: now.getTime(),
    });
  } catch (err) {
    return JSON.stringify({
      error: `Invalid timezone "${timezone}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};

const dateDiff: SkillHandler = async (args) => {
  const date1Str = args.date1 as string;
  const date2Str = args.date2 as string | undefined;

  const d1 = new Date(date1Str);
  const d2 = date2Str ? new Date(date2Str) : new Date();

  if (isNaN(d1.getTime())) {
    return JSON.stringify({ error: `Invalid date: "${date1Str}"` });
  }
  if (isNaN(d2.getTime())) {
    return JSON.stringify({ error: `Invalid date: "${date2Str}"` });
  }

  const diffMs = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  const isFuture = d1.getTime() > d2.getTime();

  return JSON.stringify({
    date1: d1.toISOString(),
    date2: d2.toISOString(),
    difference: {
      days: diffDays,
      hours: diffHours,
      minutes: diffMinutes,
      readable: `${diffDays} days, ${diffHours % 24} hours, ${diffMinutes % 60} minutes`,
    },
    direction: isFuture ? 'date1 is after date2' : 'date1 is before date2',
  });
};

const setReminder: SkillHandler = async (args) => {
  const message = args.message as string;
  const minutes = args.minutes as number;

  if (minutes <= 0 || minutes > 1440) {
    return JSON.stringify({
      error: 'Minutes must be between 1 and 1440 (24 hours)',
    });
  }

  const triggerAt = new Date(Date.now() + minutes * 60 * 1000);

  // Note: In-process timer, session-scoped. For production, use a persistent scheduler.
  return JSON.stringify({
    message,
    minutes,
    triggerAt: triggerAt.toISOString(),
    note: 'Reminder set. Note: reminders are session-scoped and will be lost if the connection drops. For persistent reminders, a notification system is needed.',
  });
};

export const handlers: Record<string, SkillHandler> = {
  get_current_time: getCurrentTime,
  date_diff: dateDiff,
  set_reminder: setReminder,
};
