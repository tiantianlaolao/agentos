/**
 * URL Summary Skill Manifest
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'url-summary',
  version: '1.0.0',
  description: 'Fetch and summarize web page content. Extract key information from any URL using AI-powered analysis.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: ['network'],
  functions: [
    {
      name: 'summarize_url',
      description: 'Fetch a web page and generate an AI summary of its content. Can answer specific questions about the page.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch and summarize',
          },
          question: {
            type: 'string',
            description: 'Optional specific question to answer about the page content',
          },
        },
        required: ['url'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'knowledge',
  emoji: '📄',
  isDefault: false,
};
