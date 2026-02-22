/**
 * External Skill HTTP Proxy Handler.
 *
 * Forwards skill function calls to the user's registered HTTP endpoint.
 * Includes SSRF protection, timeout, and response size limits.
 */

import type { SkillHandler } from './registry.js';
import type { ExternalSkillDef } from './externalSkills.js';

const MAX_RESPONSE_SIZE = 10 * 1024; // 10KB
const TIMEOUT_MS = 30000;

// SSRF protection: block localhost and private IPs
const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  '169.254.169.254', // AWS metadata
  'metadata.google.internal',
];

function isPrivateIP(hostname: string): boolean {
  // Block private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function validateEndpointUrl(endpointUrl: string): void {
  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    throw new Error('Invalid endpoint URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only HTTP/HTTPS endpoints are allowed');
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(hostname)) {
    throw new Error('Endpoint URL points to a blocked host');
  }

  if (isPrivateIP(hostname)) {
    throw new Error('Endpoint URL points to a private network');
  }
}

/**
 * Create a SkillHandler that proxies function calls to an external HTTP endpoint.
 */
export function createExternalHandler(def: ExternalSkillDef): Record<string, SkillHandler> {
  const handlers: Record<string, SkillHandler> = {};

  for (const fn of def.functions) {
    handlers[fn.name] = async (args: Record<string, unknown>): Promise<string> => {
      validateEndpointUrl(def.endpointUrl);

      const response = await fetch(def.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AgentOS-Skill': def.name,
          'X-AgentOS-Function': fn.name,
        },
        body: JSON.stringify({
          function: fn.name,
          args,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        return JSON.stringify({
          error: `External skill error: HTTP ${response.status} - ${errorText.slice(0, 200)}`,
        });
      }

      const text = await response.text();
      if (text.length > MAX_RESPONSE_SIZE) {
        return JSON.stringify({
          error: `Response too large (${text.length} bytes, max ${MAX_RESPONSE_SIZE})`,
          truncated: text.slice(0, MAX_RESPONSE_SIZE),
        });
      }

      return text;
    };
  }

  return handlers;
}
