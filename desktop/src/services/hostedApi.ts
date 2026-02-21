import { invoke } from '@tauri-apps/api/core';

function deriveHttpBaseUrl(serverUrl: string): string {
  return serverUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws$/, '');
}

interface ActivateResponse {
  success?: boolean;
  account?: { quotaUsed: number; quotaTotal: number; instanceStatus: string };
  error?: string;
}

interface StatusResponse {
  activated: boolean;
  account?: { quotaUsed: number; quotaTotal: number; instanceStatus: string } | null;
}

export async function activateHostedAccess(
  code: string,
  authToken: string,
  serverUrl: string
): Promise<ActivateResponse> {
  const baseUrl = deriveHttpBaseUrl(serverUrl);
  const raw = await invoke<string>('http_fetch', {
    url: `${baseUrl}/hosted/activate`,
    method: 'POST',
    body: JSON.stringify({ code }),
    authToken,
  });
  return JSON.parse(raw);
}

export async function getHostedStatus(
  authToken: string,
  serverUrl: string
): Promise<StatusResponse> {
  const baseUrl = deriveHttpBaseUrl(serverUrl);
  const raw = await invoke<string>('http_fetch', {
    url: `${baseUrl}/hosted/status`,
    method: 'GET',
    authToken,
  });
  return JSON.parse(raw);
}
