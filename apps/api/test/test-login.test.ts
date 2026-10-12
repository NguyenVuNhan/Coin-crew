import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createApp } from '../src/app';
import { cookiesFrom } from './helpers';

const app = createApp();
const login = (e2e: string | undefined) =>
  app.request('/api/test/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub: 'e2e-minh', name: 'Minh', email: 'minh@example.com' }),
  }, { ...env, E2E_LOGIN: e2e });

describe('test-only login', () => {
  it('does not exist unless E2E_LOGIN is 1', async () => {
    expect((await login(undefined)).status).toBe(404);
    expect((await login('0')).status).toBe(404);
  });

  it('signs in when E2E_LOGIN is 1', async () => {
    const res = await login('1');
    expect(res.status).toBe(200);
    const sid = cookiesFrom(res).sid;
    expect(sid).toBeTruthy();
    const me = await app.request('/api/me', { headers: { Cookie: `sid=${sid}` } }, env);
    expect(await me.json()).toMatchObject({ user: { email: 'minh@example.com', name: 'Minh' } });
  });
});
