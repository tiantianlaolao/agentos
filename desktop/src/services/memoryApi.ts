import { invoke } from '@tauri-apps/api/core';

function deriveHttpBaseUrl(wsUrl: string): string {
  return wsUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws$/, '');
}

export async function fetchMemory(
  serverUrl: string,
  token: string
): Promise<{ content: string; updatedAt: string } | null> {
  try {
    const baseUrl = deriveHttpBaseUrl(serverUrl);
    const raw = await invoke<string>('http_fetch', {
      url: `${baseUrl}/memory`,
      method: 'GET',
      authToken: token,
    });
    const json = JSON.parse(raw);
    if (json.ok && json.data) {
      return { content: json.data.content, updatedAt: json.data.updatedAt };
    }
    return null;
  } catch (e) {
    console.error('[memoryApi] fetchMemory error:', e);
    return null;
  }
}

export async function updateMemory(
  serverUrl: string,
  token: string,
  content: string
): Promise<{ updatedAt: string }> {
  const baseUrl = deriveHttpBaseUrl(serverUrl);
  const raw = await invoke<string>('http_fetch', {
    url: `${baseUrl}/memory`,
    method: 'PUT',
    body: JSON.stringify({ content }),
    authToken: token,
  });
  const json = JSON.parse(raw);
  if (json.ok) {
    return { updatedAt: json.data?.updatedAt || new Date().toISOString() };
  }
  throw new Error(json.error || 'Save failed');
}
