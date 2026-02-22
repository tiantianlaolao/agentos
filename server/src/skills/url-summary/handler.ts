/**
 * URL Summary Skill Handler
 * Fetches web page, extracts readable content with Readability, then summarizes with DeepSeek.
 */
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import type { SkillHandler } from '../registry.js';

const MAX_CONTENT_LENGTH = 8000; // chars to send to LLM

async function fetchAndExtract(url: string): Promise<{ title: string; content: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AgentOS/1.0; +https://agentos.app)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent) {
    throw new Error('Could not extract readable content from this page');
  }

  let content = article.textContent.trim();
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.slice(0, MAX_CONTENT_LENGTH) + '...';
  }

  return { title: article.title || '', content };
}

async function summarizeWithLLM(
  title: string,
  content: string,
  question?: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    // Fallback: return truncated content directly
    return `**${title}**\n\n${content.slice(0, 2000)}`;
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  const systemPrompt = question
    ? `You are a helpful assistant. Read the following web page content and answer the user's question concisely. Respond in the same language as the question.`
    : `You are a helpful assistant. Summarize the following web page content in a concise, informative way. Use bullet points for key information. Respond in the same language as the page title or content.`;

  const userPrompt = question
    ? `Page title: ${title}\n\nContent:\n${content}\n\nQuestion: ${question}`
    : `Page title: ${title}\n\nContent:\n${content}`;

  const response = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content || 'No summary generated';
}

const summarizeUrl: SkillHandler = async (args) => {
  const url = args.url as string;
  const question = args.question as string | undefined;

  try {
    const { title, content } = await fetchAndExtract(url);
    const summary = await summarizeWithLLM(title, content, question);

    return JSON.stringify({
      url,
      title,
      summary,
    });
  } catch (err) {
    return JSON.stringify({
      url,
      error: `Failed to summarize: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};

export const handlers: Record<string, SkillHandler> = {
  summarize_url: summarizeUrl,
};
