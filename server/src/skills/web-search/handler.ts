/**
 * Web Search Skill Handler
 * Uses DuckDuckGo Instant Answer API (free, no key required).
 */
import type { SkillHandler } from '../registry.js';

interface DDGResult {
  title: string;
  snippet: string;
  url: string;
}

async function searchDuckDuckGo(query: string): Promise<DDGResult[]> {
  // Use DuckDuckGo HTML search and parse results
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AgentOS/1.0)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Search failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: DDGResult[] = [];

  // Parse results from DuckDuckGo HTML response
  const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const links: Array<{ url: string; title: string }> = [];
  let match;
  while ((match = resultRegex.exec(html)) !== null) {
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    // DuckDuckGo redirects through their servers, extract actual URL
    const urlMatch = rawUrl.match(/uddg=([^&]+)/);
    const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
    links.push({ url: actualUrl, title });
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
  }

  for (let i = 0; i < Math.min(links.length, 8); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
    });
  }

  return results;
}

const searchWeb: SkillHandler = async (args) => {
  const query = args.query as string;

  try {
    const results = await searchDuckDuckGo(query);

    if (results.length === 0) {
      return JSON.stringify({
        query,
        results: [],
        message: 'No results found',
      });
    }

    return JSON.stringify({
      query,
      resultCount: results.length,
      results,
    });
  } catch (err) {
    return JSON.stringify({
      query,
      error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};

export const handlers: Record<string, SkillHandler> = {
  search_web: searchWeb,
};
