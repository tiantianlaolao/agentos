import type { LLMProvider } from '../providers/base.js';
import type { ChatHistoryItem } from '../types/protocol.js';
import { getMemory, updateMemory } from './store.js';

const EXTRACT_PROMPT = `根据以下对话，提取并更新用户记忆。

要求：
- 记录用户的偏好、个人事实、重要上下文
- 记录对话的关键话题和结论（例如："用户询问了XX，得知YY"）
- 与已有记忆合并，去除重复，保留所有有价值的信息
- 限 500 字以内
- 如果对话中没有值得记忆的新信息，原样返回已有记忆
- 直接输出记忆内容，不要加任何前缀或解释`;

/**
 * Extract memory from a conversation and update the user's stored memory.
 * Runs asynchronously -- does not block the main chat flow.
 */
export async function extractAndUpdateMemory(
  userId: string,
  messages: ChatHistoryItem[],
  provider: LLMProvider
): Promise<void> {
  try {
    const currentMemory = getMemory(userId);

    // Build the extraction prompt
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n');

    let extractionInput = '';
    if (currentMemory) {
      extractionInput = `已有记忆：\n${currentMemory}\n\n本次对话：\n${conversationText}`;
    } else {
      extractionInput = `本次对话：\n${conversationText}`;
    }

    // Use the same LLM provider to extract memory
    const extractMessages: ChatHistoryItem[] = [
      { role: 'user', content: `${EXTRACT_PROMPT}\n\n${extractionInput}` },
    ];

    let result = '';
    for await (const chunk of provider.chat(extractMessages)) {
      result += chunk;
    }

    result = result.trim();
    if (result) {
      updateMemory(userId, result);
      console.log(`[Memory] Updated memory for user ${userId} (${result.length} chars)`);
    }
  } catch (error) {
    console.error('[Memory] Failed to extract memory:', error instanceof Error ? error.message : error);
  }
}
