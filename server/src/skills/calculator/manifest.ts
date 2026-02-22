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
};
