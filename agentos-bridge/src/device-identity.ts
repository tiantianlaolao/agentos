/**
 * Device identity for OpenClaw Gateway authentication (Node.js).
 * Uses Node.js crypto for ed25519 key generation/signing.
 * Keys are persisted in ~/.agentos/bridge-identity.json.
 */

import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyRawBase64Url: string;
  createdAt: number;
}

const IDENTITY_DIR = join(homedir(), '.agentos');
const IDENTITY_FILE = join(IDENTITY_DIR, 'bridge-identity.json');

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function deriveDeviceId(publicKeyPem: string): string {
  // Extract raw public key from PEM (DER-encoded SubjectPublicKeyInfo)
  const rawKey = extractRawPublicKey(publicKeyPem);
  return createHash('sha256').update(rawKey).digest('hex');
}

function extractRawPublicKey(publicKeyPem: string): Buffer {
  // Parse PEM to DER, then extract the 32-byte raw key
  const lines = publicKeyPem.split('\n').filter(l => !l.startsWith('-----'));
  const der = Buffer.from(lines.join(''), 'base64');
  // Ed25519 SPKI DER structure: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes>
  // The raw key is the last 32 bytes
  return der.subarray(der.length - 32);
}

export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  // Try to load existing identity
  if (existsSync(IDENTITY_FILE)) {
    try {
      const data = JSON.parse(readFileSync(IDENTITY_FILE, 'utf-8'));
      if (data.publicKeyPem && data.privateKeyPem) {
        const rawKey = extractRawPublicKey(data.publicKeyPem);
        return {
          deviceId: deriveDeviceId(data.publicKeyPem),
          publicKeyPem: data.publicKeyPem,
          privateKeyPem: data.privateKeyPem,
          publicKeyRawBase64Url: base64UrlEncode(rawKey),
          createdAt: data.createdAt || Date.now(),
        };
      }
    } catch {
      // Corrupted, regenerate
    }
  }

  // Generate new ed25519 key pair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const rawKey = extractRawPublicKey(publicKeyPem);
  const deviceId = deriveDeviceId(publicKeyPem);
  const createdAt = Date.now();

  // Persist
  if (!existsSync(IDENTITY_DIR)) {
    mkdirSync(IDENTITY_DIR, { recursive: true });
  }
  writeFileSync(IDENTITY_FILE, JSON.stringify({
    publicKeyPem,
    privateKeyPem,
    createdAt,
  }, null, 2));

  console.log(`[Bridge] Generated new device identity: ${deviceId}`);

  return {
    deviceId,
    publicKeyPem,
    privateKeyPem,
    publicKeyRawBase64Url: base64UrlEncode(rawKey),
    createdAt,
  };
}

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

export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const signature = sign(null, Buffer.from(payload), privateKeyPem);
  return base64UrlEncode(signature);
}
