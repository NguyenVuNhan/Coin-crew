import { describe, it, expect } from 'vitest';
import {
  encryptPayload,
  sendPush,
  vapidAuthHeader,
  vapidFromEnv,
  type PushTarget,
  type VapidKeys,
} from '../src/notifications/push/webPush';
import type { Env } from '@cc/api-db/env';

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

// RFC 8291 Section 5 / Appendix A (https://www.rfc-editor.org/rfc/rfc8291#appendix-A).
const RFC = {
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  plaintext: 'When I grow up, I want to be a watermelon',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function rfcSenderKeys(): Promise<CryptoKeyPair> {
  const pub = b64urlToBytes(RFC.asPublic);
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const jwk = { kty: 'EC', crv: 'P-256', x, y };
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, d: RFC.asPrivate },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return { privateKey, publicKey };
}

async function makeVapidKeys(subject = 'mailto:ops@example.com'): Promise<{ keys: VapidKeys; verifyKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const rawPub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return {
    keys: { publicKey: bytesToB64url(rawPub), privateKey: jwk.d!, subject },
    verifyKey: pair.publicKey,
  };
}

describe('encryptPayload', () => {
  it('matches RFC 8291 Appendix A', async () => {
    const out = await encryptPayload(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: RFC.uaPublic, auth: RFC.authSecret },
      { salt: b64urlToBytes(RFC.salt), senderKeys: await rfcSenderKeys() },
    );
    expect(bytesToB64url(out)).toBe(RFC.message);
  });
});

describe('vapidAuthHeader', () => {
  it('produces a JWT the public key verifies', async () => {
    const { keys, verifyKey } = await makeVapidKeys();
    const now = 1_800_000_000;
    const header = await vapidAuthHeader('https://push.example.com/send/abc?x=1', keys, now);

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, jwt, k] = match as RegExpExecArray & [string, string, string];
    expect(k).toBe(keys.publicKey);

    const [h, p, s] = jwt.split('.') as [string, string, string];
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valid).toBe(true);

    expect(JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
    expect(payload.aud).toBe('https://push.example.com');
    expect(payload.sub).toBe(keys.subject);
    expect(payload.exp - now).toBe(43200);
  });
});

describe('vapidFromEnv', () => {
  it('returns null when either key is missing and defaults subject to APP_ORIGIN', () => {
    const base = { APP_ORIGIN: 'https://app.example.com' } as Env;
    expect(vapidFromEnv(base)).toBeNull();
    expect(vapidFromEnv({ ...base, VAPID_PUBLIC_KEY: 'pub' })).toBeNull();
    expect(vapidFromEnv({ ...base, VAPID_PRIVATE_KEY: 'priv' })).toBeNull();
    expect(vapidFromEnv({ ...base, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' })).toEqual({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'https://app.example.com',
    });
    expect(
      vapidFromEnv({ ...base, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.c' })
        ?.subject,
    ).toBe('mailto:a@b.c');
  });
});

describe('sendPush', () => {
  it('maps statuses', async () => {
    const { keys } = await makeVapidKeys();
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const target: PushTarget = {
      endpoint: 'https://push.example.com/send/abc',
      p256dh: bytesToB64url(new Uint8Array((await crypto.subtle.exportKey('raw', ua.publicKey)) as ArrayBuffer)),
      auth: bytesToB64url(crypto.getRandomValues(new Uint8Array(16))),
    };
    const payload = { title: 'T', body: 'B', url: '/trips/1', tag: 'expense-1' };
    const opts = { ttlSeconds: 3600, urgency: 'high' as const };

    const requests: Request[] = [];
    const respondWith = (status: number) =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return new Response(null, { status });
      }) as typeof fetch;

    expect(await sendPush(target, payload, keys, opts, respondWith(201))).toBe('ok');
    expect(await sendPush(target, payload, keys, opts, respondWith(410))).toBe('gone');
    expect(await sendPush(target, payload, keys, opts, respondWith(404))).toBe('gone');
    expect(await sendPush(target, payload, keys, opts, respondWith(500))).toBe('error');
    const throwing = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await sendPush(target, payload, keys, opts, throwing)).toBe('error');

    expect(requests).toHaveLength(4);
    const req = requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe(target.endpoint);
    expect(req.headers.get('TTL')).toBe('3600');
    expect(req.headers.get('Urgency')).toBe('high');
    expect(req.headers.get('Content-Encoding')).toBe('aes128gcm');
    expect(req.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(req.headers.get('Authorization')).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    // 86-octet header + payload + delimiter + 16-octet tag.
    const body = new Uint8Array(await req.arrayBuffer());
    expect(body.length).toBe(86 + new TextEncoder().encode(JSON.stringify(payload)).length + 1 + 16);
  });
});
