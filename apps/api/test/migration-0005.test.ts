import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createApp } from '../src/app';

const CREATED_AT = '2026-10-12T00:00:00.000Z';

describe('migration 0005', () => {
  it('keeps google_sub unique', async () => {
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind('u-1', 'g-1', null, 'u1@example.com', 'User 1', CREATED_AT).run();

    await expect(
      env.DB.prepare(
        'INSERT INTO users (id, google_sub, zalo_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind('u-2', 'g-1', null, 'u2@example.com', 'User 2', CREATED_AT).run(),
    ).rejects.toThrow();
  });

  it('keeps zalo_sub unique', async () => {
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind('u-1', null, 'z-1', null, 'User 1', CREATED_AT).run();

    await expect(
      env.DB.prepare(
        'INSERT INTO users (id, google_sub, zalo_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind('u-2', null, 'z-1', null, 'User 2', CREATED_AT).run(),
    ).rejects.toThrow();
  });

  it('lets many users have no google_sub', async () => {
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind('u-a', null, 'z-a', null, 'User A', CREATED_AT).run();

    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind('u-b', null, 'z-b', null, 'User B', CREATED_AT).run();

    const row = await env.DB.prepare('SELECT count(*) AS count FROM users WHERE google_sub IS NULL').first<{
      count: number;
    }>();
    expect(row?.count).toBe(2);
  });

  it('refuses a user with no identity', async () => {
    await expect(
      env.DB.prepare(
        'INSERT INTO users (id, google_sub, zalo_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind('u-none', null, null, null, 'No Identity', CREATED_AT).run(),
    ).rejects.toThrow();
  });

  it('has the merge request table', async () => {
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind('m-1', 'u-a', 'u-b', 'zalo', 'z-9', 'pending', '2026-10-12T00:00:00.000Z', '2026-10-19T00:00:00.000Z').run();

    const row = await env.DB.prepare('SELECT * FROM account_merge_requests WHERE id = ?').bind('m-1').first<{
      id: string;
      survivor_user_id: string;
      merged_user_id: string;
      provider: string;
      provider_sub: string;
      status: string;
      created_at: string;
      expires_at: string;
      decided_at: string | null;
    }>();

    expect(row).toEqual({
      id: 'm-1',
      survivor_user_id: 'u-a',
      merged_user_id: 'u-b',
      provider: 'zalo',
      provider_sub: 'z-9',
      status: 'pending',
      created_at: '2026-10-12T00:00:00.000Z',
      expires_at: '2026-10-19T00:00:00.000Z',
      decided_at: null,
    });
  });

  it('test login can create a Zalo-only user', async () => {
    const app = createApp();
    const res = await app.request(
      '/api/test/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub: 'z-1', name: 'Chi', provider: 'zalo' }),
      },
      { ...env, E2E_LOGIN: '1' },
    );
    expect(res.status).toBe(200);

    const user = await env.DB.prepare("SELECT * FROM users WHERE zalo_sub = 'z-1'").first<{
      id: string;
      google_sub: string | null;
      zalo_sub: string | null;
      email: string | null;
      name: string;
    }>();

    expect(user).toBeTruthy();
    expect(user?.google_sub).toBeNull();
    expect(user?.email).toBeNull();
    expect(user?.name).toBe('Chi');
  });
});
