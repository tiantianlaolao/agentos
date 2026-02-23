/**
 * Calculator Skill Manifest
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'calculator',
  version: '1.0.0',
  description: 'Precise mathematical calculations. Supports arithmetic, algebra, trigonometry, unit conversions, and complex expressions.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: [],
  functions: [
    {
      name: 'calculate',
      description: 'Evaluate a mathematical expression with high precision. Supports: basic arithmetic (+-*/), powers (^), parentheses, functions (sqrt, sin, cos, log, abs, round, etc.), unit conversions (e.g. "5 cm to inch"), and constants (pi, e).',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Mathematical expression to evaluate, e.g. "sqrt(144) + 2^10", "5 cm to inch", "sin(pi/4)"',
          },
        },
        required: ['expression'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'tools',
  emoji: '🧮',
  locales: {
    zh: {
      displayName: '计算器',
      description: '精确的数学计算，支持算术、代数、三角函数、单位转换和复杂表达式。',
      functions: {
        calculate: '高精度计算数学表达式。支持：四则运算(+-*/)、幂运算(^)、括号、函数(sqrt, sin, cos, log, abs, round 等)、单位转换(如 "5 cm to inch")和常数(pi, e)。',
      },
    },
  },
};
