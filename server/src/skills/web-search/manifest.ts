/**
 * Web Search Skill Manifest
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'web-search',
  version: '1.0.0',
  description: 'Search the web for real-time information, news, and answers. Returns relevant search results with titles, snippets, and URLs.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: ['network'],
  functions: [
    {
      name: 'search_web',
      description: 'Search the web using DuckDuckGo. Returns top results with titles, snippets, and URLs. Use this when the user asks about current events, needs up-to-date information, or wants to find something online.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query text',
          },
        },
        required: ['query'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'knowledge',
  emoji: '🔍',
};
