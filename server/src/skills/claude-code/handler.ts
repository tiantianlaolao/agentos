/**
 * Claude Code Skill Handler
 * Routes execution to the user's connected desktop via executeOnDesktop.
 */

import type { SkillHandler } from '../registry.js';
import { executeOnDesktop } from '../../websocket/handler.js';

const runClaudeCode: SkillHandler = async (args, context) => {
  const userId = context?.userId;
  if (!userId) {
    throw new Error('请先登录后再使用 Claude Code 远程功能');
  }

  const prompt = args.prompt as string;
  if (!prompt) {
    throw new Error('Missing prompt parameter');
  }

  // 5 minute timeout for Claude Code execution
  return executeOnDesktop(userId, 'run_claude_code', args, 300000);
};

/** All handlers exported for registry registration */
export const handlers: Record<string, SkillHandler> = {
  run_claude_code: runClaudeCode,
};
