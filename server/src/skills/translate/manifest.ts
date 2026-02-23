/**
 * Translate Skill Manifest — follows SkillManifest from adapters/base.ts
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'translate',
  version: '1.0.0',
  description: 'Translate text between languages using LLM. Supports all major languages.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: ['network'],
  functions: [
    {
      name: 'translate_text',
      description: 'Translate text from one language to another. If source language is not specified, it will be auto-detected.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to translate',
          },
          target_language: {
            type: 'string',
            description: 'Target language, e.g. "English", "Chinese", "Japanese", "Spanish"',
          },
          source_language: {
            type: 'string',
            description: 'Source language (optional, auto-detected if not provided)',
          },
        },
        required: ['text', 'target_language'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'productivity',
  emoji: '🌐',
  locales: {
    zh: {
      displayName: '翻译',
      description: '使用 AI 进行多语言文本翻译，支持所有主流语言。',
      functions: {
        translate_text: '将文本从一种语言翻译为另一种语言。未指定源语言时将自动检测。',
      },
    },
  },
};
