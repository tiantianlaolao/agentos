/**
 * DateTime Skill Manifest
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'datetime',
  version: '1.0.0',
  description: 'Get current date/time in any timezone, calculate date differences, and set reminders.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: [],
  functions: [
    {
      name: 'get_current_time',
      description: 'Get the current date and time, optionally in a specific timezone.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA timezone name, e.g. "Asia/Shanghai", "America/New_York", "Europe/London". Defaults to UTC.',
          },
        },
        required: [],
      },
    },
    {
      name: 'date_diff',
      description: 'Calculate the difference between two dates in days, hours, minutes.',
      parameters: {
        type: 'object',
        properties: {
          date1: {
            type: 'string',
            description: 'First date (ISO 8601 or natural format like "2025-03-15")',
          },
          date2: {
            type: 'string',
            description: 'Second date (ISO 8601 or natural format). Defaults to current time if not specified.',
          },
        },
        required: ['date1'],
      },
    },
    {
      name: 'set_reminder',
      description: 'Set a reminder that will trigger after specified minutes. Note: reminders are session-scoped and only work while the connection is active.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The reminder message',
          },
          minutes: {
            type: 'number',
            description: 'Number of minutes from now',
          },
        },
        required: ['message', 'minutes'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'tools',
  emoji: '📅',
};
