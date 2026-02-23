/**
 * Claude Code Skill Manifest
 * Remotely invoke Claude Code on the user's desktop.
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'claude-code',
  version: '1.0.0',
  description: 'Remotely invoke Claude Code on your desktop to analyze projects, write code, fix bugs, and perform development tasks.',
  author: 'AgentOS',
  agents: '*',
  environments: ['desktop'],
  permissions: ['exec'],
  functions: [
    {
      name: 'run_claude_code',
      description: 'Run Claude Code (claude -p) on the desktop. Use this when the user wants to analyze a project, write code, fix bugs, add features, or perform any programming task on their computer. Claude Code can read files, write code, run tests, and execute commands.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The development instruction to send to Claude Code',
          },
          project_path: {
            type: 'string',
            description: 'Path to the project directory (e.g., ~/agentos, ~/my-app). Defaults to home directory.',
          },
          max_turns: {
            type: 'integer',
            description: 'Maximum tool-use turns for Claude Code (default: 25)',
          },
        },
        required: ['prompt'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'tools',
  emoji: '💻',
};
