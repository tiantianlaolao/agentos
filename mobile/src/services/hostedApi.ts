/**
 * Hosted OpenClaw API service.
 * Handles activation and status checks for hosted mode.
 */

function deriveHttpBaseUrl(serverUrl: string): string {
  return serverUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://').replace(/\/ws$/, '');
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
  const res = await fetch(`${baseUrl}/hosted/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

export async function getHostedStatus(
  authToken: string,
  serverUrl: string
): Promise<StatusResponse> {
  const baseUrl = deriveHttpBaseUrl(serverUrl);
  const res = await fetch(`${baseUrl}/hosted/status`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  return res.json();
}
