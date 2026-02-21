/**
 * Translate Skill Handler
 * Uses the session's LLM provider to perform translation.
 * The handler returns a prompt-style result that the LLM can incorporate.
 */

import type { SkillHandler } from '../registry.js';

const translateText: SkillHandler = async (args) => {
  const text = args.text as string;
  const targetLang = args.target_language as string;
  const sourceLang = args.source_language as string | undefined;

  if (!text || !targetLang) {
    throw new Error('text and target_language are required');
  }

  // Return a structured result that the LLM will use to formulate its response.
  // The actual translation is done by the LLM itself via the tool_call -> result flow.
  const result = {
    original: text,
    target_language: targetLang,
    source_language: sourceLang || 'auto-detect',
    instruction: `Please translate the following text to ${targetLang}: "${text}"`,
  };

  return JSON.stringify(result);
};

export const handlers: Record<string, SkillHandler> = {
  translate_text: translateText,
};
