import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ActivityItem, TripListItem, TripView } from '@fsl/core';
import { call, json, byKey, seedTrip, seedUser, seedExpenses, seedMinhBank, memberSid, linkMember, guestHeaders, T, U, PID } from './helpers';

const view = (headers: Record<string, string>, tripId: string = T.tripId) => json<TripView>(call(`/api/trips/${tripId}`, { headers }));
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

describe('POST /api/trips', () => {
  it('creates a trip with the organiser and everyone else', async () => {
    const headers = { ...(await minh()), 'Content-Type': 'application/json' };
    const res = await call('/api/trips', {
      method: 'POST', headers,
      body: JSON.stringify({ name: 'Đà Lạt · Oct 2026', myName: 'Minh', people: ['An', 'Bình', 'Chi'], myBank: { bin: '970407', accountNumber: '19031234565678', holderName: 'NGUYEN VAN MINH' } }),
    });
    expect(res.status).toBe(201);
    const { tripId } = await json<{ tripId: string }>(res);
    const v = await view(headers, tripId);
    expect(v.people.map((p) => p.name)).toEqual(['Minh', 'An', 'Bình', 'Chi']);
    expect(v.people[0]).toMatchObject({ isMember: true, bank: 'approved' });
    expect(v.me).toMatchObject({ kind: 'member', isOrganiser: true });
    expect(v.links?.group).toBeTruthy();
    expect(v.links?.view).toBeTruthy();
    expect(v.trip.total).toBe(0);
    const acts = await json<ActivityItem[]>(call(`/api/trips/${tripId}/activity`, { headers }));
    expect(acts[0]?.action).toBe('trip_created');
  });

  it('needs privacy consent first', async () => {
    const sid = await memberSid('u-new', 'New');
    await env.DB.prepare("UPDATE users SET consent_at = NULL WHERE id = 'u-new'").run();
    const res = await call('/api/trips', { method: 'POST', headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', myName: 'N', people: ['A'] }) });
    expect(res.status).toBe(403);
  });

  it('needs a session', async () => {
    const res = await call('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', myName: 'N', people: ['A'] }) });
    expect(res.status).toBe(401);
  });

  describe('with accounts from recent trips', () => {
    // An shares the mockup trip with Minh, so An is one of Minh's recent people.
    const post = async (people: unknown[]) => {
      const headers = { ...(await minh()), 'Content-Type': 'application/json' };
      const res = await call('/api/trips', { method: 'POST', headers, body: JSON.stringify({ name: 'Huế', myName: 'Minh', people }) });
      return { res, headers };
    };
    const tripCount = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM trips WHERE name = ?').bind('Huế').first<{ n: number }>())!.n;

    beforeEach(async () => { await seedTrip(); await linkMember(PID.A, U.an, 'An'); });

    it('creates a trip with an account: they are a member straight away and see it in their trips', async () => {
      const { res, headers } = await post([{ name: 'An', userId: U.an }, 'Bình']);
      expect(res.status).toBe(201);
      const { tripId } = await json<{ tripId: string }>(res);

      const v = await view(headers, tripId);
      expect(v.people.map((p) => p.name)).toEqual(['Minh', 'An', 'Bình']);
      expect(v.people.map((p) => [p.status, p.isMember])).toEqual([['active', true], ['active', true], ['active', false]]);

      const anHeaders = { Cookie: `sid=${await memberSid(U.an, 'An')}` };
      const anTrips = await json<TripListItem[]>(call('/api/trips', { headers: anHeaders }));
      expect(anTrips.map((t) => t.id)).toContain(tripId);
      expect((await view(anHeaders, tripId)).me).toMatchObject({ kind: 'member', isOrganiser: false });

      const acts = await json<ActivityItem[]>(call(`/api/trips/${tripId}/activity`, { headers }));
      expect(acts.filter((a) => a.action === 'trip_created')).toHaveLength(1);
      expect(acts[0]).toMatchObject({ action: 'trip_created', details: { name: 'Huế', addedAccounts: ['An'] } });
    });

    it('refuses an account that never shared a trip with me', async () => {
      await seedUser('u-stranger', 'Stranger');
      const { res } = await post([{ name: 'Stranger', userId: 'u-stranger' }]);
      expect(res.status).toBe(422);
      expect((await json<{ error: { code: string } }>(res)).error.code).toBe('VALIDATION');
      expect(await tripCount()).toBe(0);
    });

    it('refuses the same account twice', async () => {
      const { res } = await post([{ name: 'An', userId: U.an }, { name: 'An again', userId: U.an }]);
      expect(res.status).toBe(422);
      expect((await json<{ error: { code: string } }>(res)).error.code).toBe('VALIDATION');
      expect(await tripCount()).toBe(0);
    });

    it('accepts plain names from older clients', async () => {
      const { res, headers } = await post(['An', 'Bình']);
      expect(res.status).toBe(201);
      const { tripId } = await json<{ tripId: string }>(res);
      const v = await view(headers, tripId);
      expect(v.people.map((p) => [p.name, p.isMember])).toEqual([['Minh', true], ['An', false], ['Bình', false]]);
      const acts = await json<ActivityItem[]>(call(`/api/trips/${tripId}/activity`, { headers }));
      expect(acts[0]?.details).toMatchObject({ name: 'Huế', addedAccounts: [] });
    });
  });
});

describe('trip view', () => {
  beforeEach(async () => { await seedTrip(); await seedExpenses(); });

  it('mockup balances and fewest transfers', async () => {
    const v = await view(await minh());
    expect(v.trip.total).toBe(4900000);
    expect(v.balances).toEqual({ [PID.M]: 2195000, [PID.A]: -385000, [PID.B]: -565000, [PID.C]: -1245000 });
    expect(byKey(v.suggestions)).toEqual(byKey([
      { fromId: PID.C, toId: PID.M, amount: 1245000 }, { fromId: PID.B, toId: PID.M, amount: 565000 }, { fromId: PID.A, toId: PID.M, amount: 385000 },
    ]));
    expect(v.myBalance).toEqual({ now: 2195000, beforePayments: 2195000, ifPendingApproved: null, waitingConfirm: 0 });
  });

  it('turning fewest transfers off shows debts per pair and bumps the version', async () => {
    const headers = await minh();
    const before = await view(headers);
    const res = await call(`/api/trips/${T.tripId}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ fewestTransfers: false }) });
    expect(res.status).toBe(204);
    const v = await view(headers);
    expect(v.trip.fewestTransfers).toBe(false);
    expect(v.trip.version).toBe(before.trip.version + 1);
    expect(byKey(v.suggestions)).toEqual(byKey([
      { fromId: PID.A, toId: PID.M, amount: 665000 }, { fromId: PID.B, toId: PID.M, amount: 650000 }, { fromId: PID.C, toId: PID.M, amount: 880000 },
      { fromId: PID.B, toId: PID.A, amount: 65000 }, { fromId: PID.C, toId: PID.A, amount: 215000 }, { fromId: PID.C, toId: PID.B, amount: 150000 },
    ]));
  });

  it('version endpoint matches the view', async () => {
    const headers = await minh();
    const v = await view(headers);
    expect(await json<{ version: number }>(call(`/api/trips/${T.tripId}/version`, { headers }))).toEqual({ version: v.trip.version });
  });

  it('a guest sees no links and no approvals', async () => {
    const v = await view(await guestHeaders(PID.C));
    expect(v.me).toMatchObject({ kind: 'guest', participantId: PID.C });
    expect(v.links).toBeNull();
    expect(v.approvals).toEqual([]);
    expect(v.myBalance?.now).toBe(-1245000);
  });

  it('a viewer never sees a bank account number', async () => {
    await seedMinhBank();
    const res = await call(`/api/trips/${T.tripId}`, { headers: await guestHeaders(undefined, T.viewToken) });
    const text = await res.text();
    expect(text).not.toContain('19031234565678');
    const v = JSON.parse(text) as TripView;
    expect(v.me.kind).toBe('viewer');
    expect(v.myBalance).toBeNull();
    expect(v.links).toBeNull();
  });

  it('reuses the cached view when nothing changed', async () => {
    const headers = await minh();
    await view(headers);
    const first = await env.DB.prepare('SELECT updated_at FROM trip_views WHERE trip_id = ?').bind(T.tripId).first<{ updated_at: string }>();
    await view(headers);
    const second = await env.DB.prepare('SELECT updated_at FROM trip_views WHERE trip_id = ?').bind(T.tripId).first<{ updated_at: string }>();
    expect(first?.updated_at).toBeTruthy();
    expect(second?.updated_at).toBe(first?.updated_at);
  });

  it('lists my trips with my balance', async () => {
    const list = await json<TripListItem[]>(call('/api/trips', { headers: await minh() }));
    expect(list).toContainEqual({ id: T.tripId, name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 2195000 });
  });

  it('regenerating the group link kills the old one', async () => {
    const headers = await minh();
    const res = await call(`/api/trips/${T.tripId}/links/regenerate`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ which: 'group' }) });
    const links = await json<{ group: string; view: string }>(res);
    expect(links.group).not.toBe(T.groupToken);
    expect(links.view).toBe(T.viewToken);
    expect((await call(`/api/trips/${T.tripId}`, { headers: await guestHeaders(PID.C) })).status).toBe(410);
  });

  it('activity: newest first, guests may read it, viewers may not', async () => {
    const headers = await minh();
    await call(`/api/trips/${T.tripId}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ fewestTransfers: false }) });
    const acts = await json<ActivityItem[]>(call(`/api/trips/${T.tripId}/activity`, { headers: await guestHeaders(PID.C) }));
    expect(acts[0]).toMatchObject({ action: 'fewest_changed', actorName: 'Minh' });
    expect((await call(`/api/trips/${T.tripId}/activity`, { headers: await guestHeaders(undefined, T.viewToken) })).status).toBe(403);
  });

  it('Review Focus 5: archived trips refuse writes but stay readable', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    const notOrganiser = await call(`/api/trips/${T.tripId}/archive`, { method: 'POST', headers: { Cookie: `sid=${anSid}` } });
    expect(notOrganiser.status).toBe(403);
    const headers = await minh();
    expect((await call(`/api/trips/${T.tripId}/archive`, { method: 'POST', headers })).status).toBe(204);
    const patch = await call(`/api/trips/${T.tripId}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ fewestTransfers: false }) });
    expect(patch.status).toBe(409);
    expect((await json<{ error: { code: string } }>(patch)).error.code).toBe('TRIP_ARCHIVED');
    expect((await call(`/api/trips/${T.tripId}`, { headers: await guestHeaders(PID.C) })).status).toBe(200);
    expect((await call(`/api/trips/${T.tripId}`, { headers: await guestHeaders(undefined, T.viewToken) })).status).toBe(200);
    expect((await view(headers)).trip.archived).toBe(true);
  });
});
