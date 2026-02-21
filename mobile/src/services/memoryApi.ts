/**
 * Memory REST API client.
 * Reuses the same pattern as hostedApi.ts.
 */

function deriveHttpBaseUrl(serverUrl: string): string {
  return serverUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://').replace(/\/ws$/, '');
}

interface MemoryData {
  content: string;
  updatedAt: string;
}

interface GetMemoryResponse {
  ok: boolean;
  data: MemoryData | null;
  error?: string;
}

interface PutMemoryResponse {
  ok: boolean;
  data?: { updatedAt: string };
  error?: string;
}

export async function getMemory(
  authToken: string,
  serverUrl: string
): Promise<GetMemoryResponse> {
  const baseUrl = deriveHttpBaseUrl(serverUrl);
  const res = await fetch(`${baseUrl}/memory`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  return res.json();
}

export async function putMemory(
  content: string,
  authToken: string,
  serverUrl: string
): Promise<PutMemoryResponse> {
  const baseUrl = deriveHttpBaseUrl(serverUrl);
  const res = await fetch(`${baseUrl}/memory`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ content }),
  });
  return res.json();
}
