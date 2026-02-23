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
  locales: {
    zh: {
      displayName: '网页摘要',
      description: '抓取并总结网页内容，使用 AI 分析提取关键信息。',
      functions: {
        summarize_url: '抓取网页并生成 AI 内容摘要，可针对页面内容回答特定问题。',
      },
    },
  },
};
