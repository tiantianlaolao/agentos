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
  locales: {
    zh: {
      displayName: '网页搜索',
      description: '搜索网络获取实时信息、新闻和答案，返回包含标题、摘要和链接的搜索结果。',
      functions: {
        search_web: '使用 DuckDuckGo 搜索网络，返回包含标题、摘要和链接的热门结果。适用于查询时事、最新信息或在线搜索。',
      },
    },
  },
};
