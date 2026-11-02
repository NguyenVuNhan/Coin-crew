import { describe, it, expect } from 'vitest';
import type { MeResponse } from '@fsl/core';
import { call, json, memberSid, U } from './helpers';

const ZMP = 'https://h5.zdn.vn';

async function meId(headers: Record<string, string>): Promise<string | null> {
  const res = await call('/api/me', { headers });
  expect(res.status).toBe(200);
  return (await json<MeResponse>(res)).user?.id ?? null;
}

describe('bearer sessions', () => {
  it('bearer token signs the request in', async () => {
    const sid = await memberSid(U.minh);
    expect(await meId({ Authorization: `Bearer ${sid}` })).toBe(U.minh);
  });

  it('bearer wins over cookie', async () => {
    const minh = await memberSid(U.minh);
    const an = await memberSid(U.an);
    expect(await meId({ Authorization: `Bearer ${minh}`, Cookie: `sid=${an}` })).toBe(U.minh);
  });

  it('logout with bearer deletes that session', async () => {
    const sid = await memberSid(U.minh);
    const res = await call('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${sid}` } });
    expect(res.status).toBe(204);
    expect(await meId({ Authorization: `Bearer ${sid}` })).toBeNull();
  });
});

describe('CORS for the Zalo Mini App', () => {
  it('allowed origin gets CORS headers', async () => {
    const res = await call('/api/health', { headers: { Origin: ZMP } });
    expect(res.headers.get('access-control-allow-origin')).toBe(ZMP);
    expect(res.headers.get('access-control-expose-headers')).toContain('X-Device-Id');
    expect(res.headers.get('vary')).toContain('Origin');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('preflight answers without D1', async () => {
    const res = await call('/api/trips/x', {
      method: 'OPTIONS',
      headers: { Origin: ZMP, 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type, X-Link-Token, X-Device-Restore');
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-device-id')).toBeNull();
  });

  it('unknown origin gets no CORS headers', async () => {
    const res = await call('/api/health', { headers: { Origin: 'https://evil.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('error responses still carry CORS headers', async () => {
    const res = await call('/api/trips/nope', { headers: { Origin: ZMP } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('access-control-allow-origin')).toBe(ZMP);
  });
});
