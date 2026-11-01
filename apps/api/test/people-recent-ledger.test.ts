import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { RecentPerson } from '@fsl/core';
import { call, json, memberSid, seedUser, U } from './helpers';

describe('GET /api/me/people and the personal ledger', () => {
  it('leaves out people who are only in a quick-expense ledger', async () => {
    await seedUser(U.an, 'An');
    const sid = await memberSid(U.minh, 'Minh');
    const NOW = '2026-10-20T00:00:00.000Z';
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES ('t-led', 'Minh', 'direct', 'VND', 1, ?, 'g-led', 'v-led', 0, ?)",
      ).bind(U.minh, NOW),
      env.DB.prepare(
        "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('led-o', 't-led', 'Minh', 'minh', ?, 'active', 0, ?)",
      ).bind(U.minh, NOW),
      env.DB.prepare(
        "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('led-a', 't-led', 'An', 'an', ?, 'active', 1, ?)",
      ).bind(U.an, NOW),
    ]);

    const people = await json<RecentPerson[]>(call('/api/me/people', { headers: { Cookie: `sid=${sid}` } }));
    expect(people).toEqual([]);
  });
});
