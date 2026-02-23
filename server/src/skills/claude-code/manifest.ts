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
  locales: {
    zh: {
      displayName: 'Claude 编程',
      description: '在桌面端远程调用 Claude Code 进行项目分析、代码编写、Bug 修复等开发任务。',
      functions: {
        run_claude_code: '在桌面端运行 Claude Code (claude -p)。适用于分析项目、编写代码、修复 Bug、添加功能等编程任务。Claude Code 可以读取文件、编写代码、运行测试和执行命令。',
      },
    },
  },
};
