/**
 * Device identity for OpenClaw Gateway authentication (desktop).
 *
 * Uses tweetnacl for ed25519 key generation/signing (pure JS, no native deps).
 * Keys are persisted in localStorage.
 * Device ID is SHA-256(raw public key) in hex.
 */

import nacl from 'tweetnacl';

export interface DeviceIdentity {
  deviceId: string;
  publicKeyRaw: Uint8Array;  // 32 bytes raw ed25519 public key
  secretKey: Uint8Array;     // 64 bytes ed25519 secret key (tweetnacl format)
  createdAt: number;
}

const STORAGE_KEY = 'device-identity-v1';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveDeviceId(publicKeyRaw: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyRaw.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Load existing device identity from localStorage, or generate a new one.
 */
export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.publicKeyRaw && parsed.secretKey) {
        const publicKeyRaw = base64UrlDecode(parsed.publicKeyRaw);
        const secretKey = base64UrlDecode(parsed.secretKey);
        const deviceId = await deriveDeviceId(publicKeyRaw);
        return {
          deviceId,
          publicKeyRaw,
          secretKey,
          createdAt: parsed.createdAtMs || Date.now(),
        };
      }
    }
  } catch {
    // Corrupted data -- regenerate
  }

  // Generate new ed25519 key pair
  const keyPair = nacl.sign.keyPair();
  const deviceId = await deriveDeviceId(keyPair.publicKey);
  const now = Date.now();

  // Persist
  const toStore = {
    publicKeyRaw: base64UrlEncode(keyPair.publicKey),
    secretKey: base64UrlEncode(keyPair.secretKey),
    createdAtMs: now,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  console.log(`[DeviceIdentity] Generated new desktop device: ${deviceId}`);

  return {
    deviceId,
    publicKeyRaw: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    createdAt: now,
  };
}

/**
 * Get the base64url-encoded raw public key (32 bytes) for the connect params.
 */
export function getPublicKeyBase64Url(identity: DeviceIdentity): string {
  return base64UrlEncode(identity.publicKeyRaw);
}

/**
 * Build the device auth payload string for signing.
 */
export function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce?: string;
}): string {
  const version = params.nonce ? 'v2' : 'v1';
  const parts = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
  ];
  if (version === 'v2') {
    parts.push(params.nonce ?? '');
  }
  return parts.join('|');
}

/**
 * Sign a payload string with the device secret key.
 * Returns a base64url-encoded ed25519 signature (64 bytes).
 */
export function signDevicePayload(secretKey: Uint8Array, payload: string): string {
  const messageBytes = new TextEncoder().encode(payload);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return base64UrlEncode(signature);
}
