/**
 * Device identity management for OpenClaw Gateway authentication.
 *
 * Generates and persists an ed25519 key pair, derives a device ID
 * from the public key fingerprint, and signs connect payloads.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function publicKeyRawBase64Url(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function generateIdentity(): DeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

/**
 * Load or create a device identity from a JSON file.
 * File permissions are set to 0600 (owner read/write only).
 */
export function loadOrCreateDeviceIdentity(filePath?: string): DeviceIdentity {
  const resolved = filePath ?? path.join(process.cwd(), 'data', 'device-identity.json');

  try {
    if (fs.existsSync(resolved)) {
      const raw = fs.readFileSync(resolved, 'utf8');
      const parsed = JSON.parse(raw);
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKeyPem === 'string' &&
        typeof parsed.privateKeyPem === 'string'
      ) {
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
        return {
          deviceId: derivedId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        };
      }
    }
  } catch {
    // Corrupted file or read error — regenerate
  }

  const identity = generateIdentity();
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const stored = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  };
  fs.writeFileSync(resolved, JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(resolved, 0o600); } catch { /* ignore */ }

  console.log(`[DeviceIdentity] Generated new device identity: ${identity.deviceId}`);
  return identity;
}

/**
 * Build the device auth payload string for signing.
 * v1: no nonce field; v2: includes nonce.
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
 * Sign a payload string with the device private key (ed25519).
 * Returns a base64url-encoded signature.
 */
export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key));
}
