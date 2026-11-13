import type { Env } from '@cc/api-db/env';
import { safeError } from '@cc/api-util/logSafe';

/**
 * Web Push sender for the Worker: message encryption per RFC 8291 (`aes128gcm`, RFC 8188) and
 * VAPID auth per RFC 8292, built on WebCrypto only.
 */

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export type PushResult = 'ok' | 'gone' | 'error';

/** All base64url: `publicKey` is the raw uncompressed P-256 point, `privateKey` the scalar `d`. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const RECORD_SIZE = 4096;
const PADDING_DELIMITER = 0x02; // last (and only) record
const JWT_LIFETIME_SEC = 12 * 60 * 60;

const encoder = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** P-256 JWK from a raw uncompressed public point; with `d` it is a private key (WebCrypto has no raw private import). */
function ecJwk(publicKey: Uint8Array, d?: string): JsonWebKey {
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(publicKey.slice(1, 33)),
    y: bytesToB64url(publicKey.slice(33, 65)),
  };
  if (d) jwk.d = d;
  return jwk;
}

export function vapidFromEnv(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || env.APP_ORIGIN,
  };
}

/** RFC 8291 `aes128gcm` body, header included. `opts` exists so tests can pin the RFC vector. */
export async function encryptPayload(
  plaintext: Uint8Array,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  opts: { salt?: Uint8Array; senderKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(target.p256dh);
  const authSecret = b64urlToBytes(target.auth);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const sender =
    opts.senderKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', sender.publicKey)) as ArrayBuffer);

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // workers-types spells the standard `public` member `$public`; the runtime wants `public`.
  const ecdhParams = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, sender.privateKey, 256));

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, Uint8Array.of(PADDING_DELIMITER))),
  );

  // Header: salt (16) | record size (uint32 BE) | keyid length (1) | keyid (sender public key).
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/** `vapid t=<jwt>, k=<publicKey>` (RFC 8292); the JWT's audience is the endpoint's origin. */
export async function vapidAuthHeader(
  endpoint: string,
  keys: VapidKeys,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = bytesToB64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = { aud: new URL(endpoint).origin, exp: nowSec + JWT_LIFETIME_SEC, sub: keys.subject };
  const payload = bytesToB64url(encoder.encode(JSON.stringify(claims)));
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    ecJwk(b64urlToBytes(keys.publicKey), keys.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto's ECDSA signature is already raw r||s, which is what JWS ES256 wants.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(`${header}.${payload}`)),
  );
  return `vapid t=${header}.${payload}.${bytesToB64url(signature)}, k=${keys.publicKey}`;
}

/** Never throws: 2xx is `ok`, 404/410 (subscription expired) is `gone`, anything else is `error`. */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
  keys: VapidKeys,
  opts: { ttlSeconds: number; urgency: 'normal' | 'high' },
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  try {
    const body = await encryptPayload(encoder.encode(JSON.stringify(payload)), target);
    const response = await fetchImpl(target.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(opts.ttlSeconds),
        Urgency: opts.urgency,
        Authorization: await vapidAuthHeader(target.endpoint, keys),
      },
      body,
    });
    if (response.ok) return 'ok';
    if (response.status === 404 || response.status === 410) return 'gone';
    console.error('[sendPush] push service rejected', { status: response.status });
    return 'error';
  } catch (err) {
    console.error('[sendPush] failed:', safeError(err));
    return 'error';
  }
}
