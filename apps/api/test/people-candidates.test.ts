import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { GroupPerson } from '@fsl/core';
import { call, json, memberSid, seedUser, U } from './helpers';

const NOW = '2026-10-20T00:00:00.000Z';
const LATER = '2026-10-21T00:00:00.000Z';

function trip(id: string, preset: string, createdAt: string, archivedAt: string | null = null) {
  return env.DB.prepare(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES (?, ?, ?, 'VND', 1, ?, ?, ?, 0, ?, ?)",
  ).bind(id, `Trip ${id}`, preset, U.an, `g-${id}`, `v-${id}`, createdAt, archivedAt);
}

function person(id: string, tripId: string, name: string, userId: string | null, sort: number, status = 'active') {
  return env.DB.prepare(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, tripId, name, name.toLowerCase(), userId, status, sort, NOW);
}

describe('GET /api/me/people/candidates', () => {
  it('lists guests and signed-in people from my open groups, newest group first, each account once', async () => {
    const sid = await memberSid(U.an, 'An');
    await seedUser(U.minh, 'Minh');
    await env.DB.batch([
      trip('old', 'trip', NOW),
      trip('new', 'sport', LATER),
      trip('arch', 'trip', NOW, LATER),
      trip('led', 'direct', NOW),
      trip('other', 'trip', NOW),
      person('o-an', 'old', 'An', U.an, 0),
      person('o-minh', 'old', 'Minh', U.minh, 1),
      person('o-linh', 'old', 'Linh', null, 2),
      person('o-gone', 'old', 'Gone', null, 3, 'merged'),
      person('n-an', 'new', 'An', U.an, 0),
      person('n-minh', 'new', 'Minh B', U.minh, 1),
      person('a-an', 'arch', 'An', U.an, 0),
      person('a-tuan', 'arch', 'Tuấn', null, 1),
      person('l-an', 'led', 'An', U.an, 0),
      person('l-hoa', 'led', 'Hoa', null, 1),
      person('x-mai', 'other', 'Mai', null, 0),
    ]);

    const people = await json<GroupPerson[]>(call('/api/me/people/candidates', { headers: { Cookie: `sid=${sid}` } }));
    expect(people).toEqual([
      { participantId: 'n-minh', name: 'Minh B', userId: U.minh, tripName: 'Trip new' },
      { participantId: 'o-linh', name: 'Linh', userId: null, tripName: 'Trip old' },
    ]);
  });

  it('needs a signed-in user', async () => {
    const res = await call('/api/me/people/candidates');
    expect(res.status).toBe(401);
  });
});
