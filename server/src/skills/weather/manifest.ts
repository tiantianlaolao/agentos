/**
 * Weather Skill Manifest — follows SkillManifest from adapters/base.ts
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'weather',
  version: '1.0.0',
  description: 'Query current weather information for any city worldwide. Supports both English and Chinese city names.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: ['network'],
  functions: [
    {
      name: 'get_weather',
      description: 'Get current weather conditions for a specified city. Returns temperature, humidity, wind speed, and conditions.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: 'City name, e.g. "Beijing", "Tokyo", "New York"',
          },
        },
        required: ['city'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
};
