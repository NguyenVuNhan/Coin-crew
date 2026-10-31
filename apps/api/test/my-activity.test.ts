import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { MyActivityPage } from '@fsl/core';
import { call, json, memberSid, seedUser, U } from './helpers';

const NOW = '2026-10-20T00:00:00.000Z';

function trip(id: string, preset: string, organiser: string = U.an, archivedAt: string | null = null) {
  return env.DB.prepare(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES (?, ?, ?, 'VND', 1, ?, ?, ?, 0, ?, ?)",
  ).bind(id, `Trip ${id}`, preset, organiser, `g-${id}`, `v-${id}`, NOW, archivedAt);
}

function person(id: string, tripId: string, name: string, userId: string | null, sort: number, status = 'active') {
  return env.DB.prepare(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, tripId, name, name.toLowerCase(), userId, status, sort, NOW);
}

function act(id: string, tripId: string, createdAt: string, actorParticipantId: string | null, action = 'expense_added', details: Record<string, unknown> = {}) {
  return env.DB.prepare(
    'INSERT INTO activity (id, trip_id, actor_participant_id, actor_user_id, actor_device, action, details_json, created_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)',
  ).bind(id, tripId, actorParticipantId, action, JSON.stringify(details), createdAt);
}

const at = (minute: number) => `2026-10-20T10:${String(minute).padStart(2, '0')}:00.000Z`;

async function page(sid: string, before?: string): Promise<MyActivityPage> {
  const q = before ? `?before=${encodeURIComponent(before)}` : '';
  return json<MyActivityPage>(call(`/api/me/activity${q}`, { headers: { Cookie: `sid=${sid}` } }));
}

describe('GET /api/me/activity', () => {
  it('lists activity from all my groups and my quick expenses, newest first, with trip names', async () => {
    const sid = await memberSid(U.an, 'An');
    await env.DB.batch([
      trip('g1', 'trip'),
      trip('g2', 'sport', U.an, NOW),
      trip('led', 'direct'),
      person('g1-an', 'g1', 'An', U.an, 0),
      person('g2-an', 'g2', 'An', U.an, 0),
      person('l-an', 'led', 'An', U.an, 0),
      act('a1', 'g1', at(1), 'g1-an'),
      act('a2', 'led', at(3), 'l-an'),
      act('a3', 'g2', at(2), 'g2-an'),
    ]);

    const res = await page(sid);
    expect(res.next).toBeNull();
    expect(res.items.map((i) => [i.id, i.tripId, i.tripName, i.kind, i.actorName])).toEqual([
      ['a2', 'led', 'Trip led', 'direct', 'An'],
      ['a3', 'g2', 'Trip g2', 'group', 'An'],
      ['a1', 'g1', 'Trip g1', 'group', 'An'],
    ]);
    expect(res.items[0]).toMatchObject({ action: 'expense_added', createdAt: at(3), details: {}, deviceShort: null });
  });

  it("includes other members' actions in my groups", async () => {
    const sid = await memberSid(U.an, 'An');
    await seedUser(U.minh, 'Minh');
    await env.DB.batch([
      trip('g1', 'trip', U.minh),
      person('g1-an', 'g1', 'An', U.an, 0),
      person('g1-minh', 'g1', 'Minh', U.minh, 1),
      act('a1', 'g1', at(1), 'g1-minh'),
    ]);

    const res = await page(sid);
    expect(res.items.map((i) => [i.id, i.actorName])).toEqual([['a1', 'Minh']]);
  });

  it("leaves out groups I'm not in and other people's ledgers", async () => {
    const sid = await memberSid(U.an, 'An');
    await seedUser(U.minh, 'Minh');
    await env.DB.batch([
      trip('mine', 'trip'),
      trip('other', 'trip', U.minh),
      trip('left', 'trip', U.minh),
      trip('minh-led', 'direct', U.minh),
      person('m-an', 'mine', 'An', U.an, 0),
      person('o-minh', 'other', 'Minh', U.minh, 0),
      person('x-an', 'left', 'An', U.an, 0, 'left'),
      // Minh's ledger has An as a contact, linked to An's account: still Minh's ledger, not An's.
      person('ml-minh', 'minh-led', 'Minh', U.minh, 0),
      person('ml-an', 'minh-led', 'An', U.an, 1),
      act('a-mine', 'mine', at(1), 'm-an'),
      act('a-other', 'other', at(2), 'o-minh'),
      act('a-left', 'left', at(3), 'x-an'),
      act('a-minh-led', 'minh-led', at(4), 'ml-minh'),
    ]);

    const res = await page(sid);
    expect(res.items.map((i) => i.id)).toEqual(['a-mine']);
  });

  it('pages by (createdAt, id) without gaps', async () => {
    const sid = await memberSid(U.an, 'An');
    const rows = [trip('g1', 'trip'), person('g1-an', 'g1', 'An', U.an, 0)];
    for (let i = 0; i < 60; i++) {
      // 30 rows share one createdAt; the other 30 each have their own.
      const createdAt = i < 30 ? at(30) : at(i - 30);
      rows.push(act(`a-${String(i).padStart(2, '0')}`, 'g1', createdAt, 'g1-an'));
    }
    await env.DB.batch(rows);

    const p1 = await page(sid);
    expect(p1.items).toHaveLength(50);
    expect(p1.next).not.toBeNull();
    const p2 = await page(sid, p1.next!);
    expect(p2.items).toHaveLength(10);
    expect(p2.next).toBeNull();

    const ids = [...p1.items, ...p2.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(60);
    const keys = [...p1.items, ...p2.items].map((i) => `${i.createdAt}~${i.id}`);
    expect(keys).toEqual([...keys].sort().reverse());
  });

  it('fills names for payment and bank lines', async () => {
    const sid = await memberSid(U.an, 'An');
    await seedUser(U.minh, 'Minh');
    await env.DB.batch([
      trip('g1', 'trip'),
      person('g1-an', 'g1', 'An', U.an, 0),
      person('g1-minh', 'g1', 'Minh', U.minh, 1),
      person('g1-linh', 'g1', 'Linh', null, 2),
      act('pay', 'g1', at(2), 'g1-an', 'payment_recorded', { fromId: 'g1-minh', toId: 'g1-an', amount: 1000 }),
      act('bank', 'g1', at(1), 'g1-an', 'bank_set', { participantId: 'g1-linh' }),
    ]);

    const res = await page(sid);
    const [pay, bank] = res.items;
    expect(pay!.names['g1-minh']).toBe('Minh');
    expect(pay!.names).toEqual({ 'g1-minh': 'Minh', 'g1-an': 'An' });
    expect(bank!.names).toEqual({ 'g1-linh': 'Linh' });
  });

  it('needs a signed-in user', async () => {
    const res = await call('/api/me/activity');
    expect(res.status).toBe(401);
  });
});
