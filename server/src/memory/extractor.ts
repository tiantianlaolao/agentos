import type { LLMProvider } from '../providers/base.js';
import type { ChatHistoryItem } from '../types/protocol.js';
import { getMemory, updateMemory } from './store.js';

const EXTRACT_PROMPT = `你是用户画像提取器。根据本次对话，更新用户记忆。

只提取以下类别的信息：
- 个人信息：姓名、年龄、职业、所在地等
- 偏好习惯：喜好、常用工具、沟通风格等
- 技术栈：编程语言、框架、平台等
- 工作习惯：工作流程、常见需求模式等
- 重要决定：用户明确表达的选择或决策

严格规则：
- 只记录用户明确说出的信息，绝对不要推断、猜测或编造任何内容
- 如果用户没有提供姓名、职业等信息，该类别写"无"，不要凭空生成
- 宁可漏记，也不要错记

不要提取：
- 对话摘要（如"用户询问了XX"、"用户想要XX"）
- 一次性问答的内容
- AI 的回答或建议内容
- 寒暄、客套话

格式要求：
- 按类别用 bullet points 组织
- 简洁明了，每条不超过一句话
- 与已有记忆合并，去重
- 限 1500 字以内
- 如果本次对话没有新的用户画像信息，原样返回已有记忆
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
