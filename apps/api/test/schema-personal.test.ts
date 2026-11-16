import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { userPersonalSettings } from '@cc/api-db/schema';
import { seedUser } from './helpers';

describe('user_personal_settings', () => {
  it('has the three columns, in order', async () => {
    expect(userPersonalSettings.userId).toBeDefined();
    const cols = await env.DB.prepare('PRAGMA table_info(user_personal_settings)').all<{ name: string }>();
    expect(cols.results.map((r) => r.name)).toEqual(['user_id', 'enabled', 'updated_at']);
  });

  it('defaults to off', async () => {
    await seedUser('u-p1', 'P One');
    await env.DB.prepare("INSERT INTO user_personal_settings (user_id, updated_at) VALUES ('u-p1', '2026-11-15T00:00:00.000Z')").run();
    const row = await env.DB.prepare("SELECT enabled FROM user_personal_settings WHERE user_id = 'u-p1'").first<{ enabled: number }>();
    expect(row?.enabled).toBe(0);
  });

  it('goes away with its user, so tests and merges never trip on it', async () => {
    await seedUser('u-p2', 'P Two');
    await env.DB.prepare("INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES ('u-p2', 1, '2026-11-15T00:00:00.000Z')").run();
    await env.DB.prepare("DELETE FROM users WHERE id = 'u-p2'").run();
    const row = await env.DB.prepare("SELECT 1 AS x FROM user_personal_settings WHERE user_id = 'u-p2'").first();
    expect(row).toBeNull();
  });
});
