import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, memberSid } from './helpers';

describe('migration 0007', () => {
  it('adds zalo_name to users', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(users)').all<{
      name: string;
      notnull: number;
    }>();

    const row = results.find((r) => r.name === 'zalo_name');
    expect(row).toBeDefined();
    expect(row?.notnull).toBe(0);
  });

  it('adds other_name, identity_label and dismissed_at to account_merge_requests', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(account_merge_requests)').all<{
      name: string;
      notnull: number;
    }>();

    for (const name of ['other_name', 'identity_label', 'dismissed_at']) {
      const row = results.find((r) => r.name === name);
      expect(row).toBeDefined();
      expect(row?.notnull).toBe(0);
    }
  });

  it('returns zaloName in /api/me', async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, google_sub, zalo_sub, email, name, zalo_name, created_at) VALUES ('u-zalo', NULL, 'z-1', NULL, 'Noah', 'Noah Zalo', '2026-10-12T00:00:00.000Z')",
    ).run();

    const sid = await memberSid('u-zalo');
    const body = await json<{ user: { zaloName: string | null } }>(
      call('/api/me', { headers: { Cookie: `sid=${sid}` } }),
    );
    expect(body.user.zaloName).toBe('Noah Zalo');

    const sid2 = await memberSid('u-google', 'Gia');
    const body2 = await json<{ user: { zaloName: string | null } }>(
      call('/api/me', { headers: { Cookie: `sid=${sid2}` } }),
    );
    expect(body2.user.zaloName).toBe(null);
  });
});
