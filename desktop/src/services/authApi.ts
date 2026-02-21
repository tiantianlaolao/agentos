import { invoke } from '@tauri-apps/api/core';

function deriveHttpBaseUrl(wsUrl: string): string {
  return wsUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws$/, '');
}

interface AuthResult {
  ok: boolean;
  data?: { token: string; userId: string; phone: string };
  error?: string;
}

export async function login(
  phone: string,
  password: string,
  serverUrl: string
): Promise<AuthResult> {
  try {
    const baseUrl = deriveHttpBaseUrl(serverUrl);
    const raw = await invoke<string>('http_fetch', {
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    const json = JSON.parse(raw);
    if (json.ok && json.data?.token) {
      return { ok: true, data: json.data };
    }
    return { ok: false, error: json.error || 'Login failed' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function register(
  phone: string,
  password: string,
  serverUrl: string
): Promise<AuthResult> {
  try {
    const baseUrl = deriveHttpBaseUrl(serverUrl);
    const raw = await invoke<string>('http_fetch', {
      url: `${baseUrl}/auth/register`,
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    const json = JSON.parse(raw);
    if (json.ok && json.data?.token) {
      return { ok: true, data: json.data };
    }
    return { ok: false, error: json.error || 'Registration failed' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
