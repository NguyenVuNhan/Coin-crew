import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { RecentPerson } from '@fsl/core';
import { call, json, memberSid, seedUser, U } from './helpers';

async function addTrip(
  id: string,
  name: string,
  createdAt: string,
  members: { userId: string | null; name: string; status?: 'active' | 'pending' }[],
) {
  await seedUser(U.minh, 'Minh');
  for (const m of members) {
    if (m.userId) {
      await seedUser(m.userId, m.name);
    }
  }

  const tripStmt = env.DB.prepare(
    "INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, 'VND', 1, 'u-minh', ?, ?, 0, ?)",
  ).bind(id, name, `g-${id}`, `v-${id}`, createdAt);

  const participantPrep = env.DB.prepare(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );

  const participantStmts = members.map((m, index) =>
    participantPrep.bind(
      `${id}-p${index}`,
      id,
      m.name,
      m.name.toLowerCase(),
      m.userId,
      m.status ?? 'active',
      index,
      createdAt,
    ),
  );

  await env.DB.batch([tripStmt, ...participantStmts]);
}

describe('GET /api/me/people', () => {
  it('lists people with an account from my trips, newest first, at most 50, without me', async () => {
    const oldMembers: { userId: string | null; name: string; status?: 'active' | 'pending' }[] = [
      { userId: U.minh, name: 'Minh' },
    ];
    for (let i = 0; i < 55; i++) {
      const pad = String(i).padStart(2, '0');
      oldMembers.push({ userId: `u-o-${pad}`, name: `Old ${pad}` });
    }
    oldMembers.push({ userId: null, name: 'Guest Old' });

    await addTrip('t-old', 'Old', '2026-10-01T00:00:00.000Z', oldMembers);

    await addTrip('t-new', 'New', '2026-10-10T00:00:00.000Z', [
      { userId: U.minh, name: 'Minh' },
      { userId: 'u-new', name: 'Newest' },
      { userId: null, name: 'Guest New' },
      { userId: 'u-pending', name: 'Pending Pal', status: 'pending' },
    ]);

    await addTrip('t-else', 'Elsewhere', '2026-10-11T00:00:00.000Z', [
      { userId: 'u-stranger', name: 'Stranger' },
      { userId: 'u-x', name: 'X' },
    ]);

    const res = await call('/api/me/people', {
      headers: { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` },
    });
    expect(res.status).toBe(200);

    const body = await json<RecentPerson[]>(res);
    expect(body).toHaveLength(50);
    expect(body[0]).toEqual({ userId: 'u-new', name: 'Newest', trips: ['New'] });

    const userIds = body.map((p) => p.userId);
    expect(userIds).not.toContain(U.minh);
    expect(userIds).not.toContain('u-stranger');
    expect(userIds).not.toContain('u-x');
    expect(userIds).not.toContain('u-pending');

    for (const person of body.slice(1)) {
      expect(person.trips).toEqual(['Old']);
    }
  });

  it('gives at most two shared trip names per person', async () => {
    await addTrip('t-a', 'Trip A', '2026-10-01T00:00:00.000Z', [
      { userId: U.minh, name: 'Minh' },
      { userId: 'u-an', name: 'An' },
    ]);
    await addTrip('t-b', 'Trip B', '2026-10-05T00:00:00.000Z', [
      { userId: U.minh, name: 'Minh' },
      { userId: 'u-an', name: 'An B' },
    ]);
    await addTrip('t-c', 'Trip C', '2026-10-09T00:00:00.000Z', [
      { userId: U.minh, name: 'Minh' },
      { userId: 'u-an', name: 'An C' },
    ]);

    const res = await call('/api/me/people', {
      headers: { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` },
    });
    expect(res.status).toBe(200);

    const body = await json<RecentPerson[]>(res);
    expect(body).toEqual([
      { userId: 'u-an', name: 'An C', trips: ['Trip C', 'Trip B'] },
    ]);
  });

  it('needs a session', async () => {
    const res = await call('/api/me/people');
    expect(res.status).toBe(401);
  });
});
