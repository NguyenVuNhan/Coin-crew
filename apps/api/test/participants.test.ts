import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { PickerView, TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, linkMember, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = async (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const errCode = async (res: Response) => (await json<{ error: { code: string } }>(res)).error.code;

beforeEach(seedTrip);

describe('picking a name', () => {
  it('lists everyone and refuses member names to guests', async () => {
    const g = await guestHeaders();
    const picker = await json<PickerView>(call(`${base}/people/picker`, { headers: g }));
    expect(picker.people.map((p) => p.name)).toEqual(['Minh', 'An', 'Bình', 'Chi']);
    expect(picker.people.find((p) => p.id === PID.M)?.isMember).toBe(true);
    expect(picker.myPick).toBeNull();
    expect((await post('/people/pick', g, { participantId: PID.M })).status).toBe(403);
  });

  it('remembers the pick on this phone and hints at other phones', async () => {
    const one = await guestHeaders();
    const two = await guestHeaders();
    expect((await post('/people/pick', one, { participantId: PID.C })).status).toBe(204);
    expect((await post('/people/pick', two, { participantId: PID.C })).status).toBe(204);
    const picker = await json<PickerView>(call(`${base}/people/picker`, { headers: one }));
    expect(picker.myPick).toBe(PID.C);
    const chi = picker.people.find((p) => p.id === PID.C)!;
    expect(chi.lastUsedHere).toBe(true);
    expect(chi.activeElsewhere).toBeTruthy();
    expect(picker.people.find((p) => p.id === PID.A)?.activeElsewhere).toBeNull();
  });
});

describe('new names', () => {
  it('check-name finds Bình for Binh', async () => {
    const res = await post('/people/check-name', await guestHeaders(), { name: 'Binh' });
    expect(await json(res)).toEqual({ matches: [{ id: PID.B, name: 'Bình', reason: 'same' }] });
  });

  it('a similar name needs confirmNew; a guest name starts pending and is picked', async () => {
    const g = await guestHeaders();
    const refused = await post('/people', g, { name: 'Binh', confirmNew: false });
    expect(refused.status).toBe(422);
    const created = await post('/people', g, { name: 'Binh', confirmNew: true });
    expect(created.status).toBe(201);
    const { participantId } = await json<{ participantId: string }>(created);
    const v = await view(g);
    expect(v.me).toMatchObject({ kind: 'guest', participantId, participantPending: true });
    expect(v.people.find((p) => p.id === participantId)?.status).toBe('pending');
    const memberView = await view(await minh());
    expect(memberView.approvals).toContainEqual({ kind: 'name', participantId, matches: [{ id: PID.B, name: 'Bình', reason: 'same' }] });
  });

  it('a member adds an active name', async () => {
    const res = await post('/people', await minh(), { name: 'Giang', confirmNew: false });
    const { participantId } = await json<{ participantId: string }>(res);
    expect((await view(await minh())).people.find((p) => p.id === participantId)?.status).toBe('active');
  });

  it('one phone may hold at most 3 pending names', async () => {
    const g = await guestHeaders();
    for (const name of ['Dũng', 'Em', 'Giang']) expect((await post('/people', g, { name, confirmNew: true })).status).toBe(201);
    const fourth = await post('/people', g, { name: 'Hà', confirmNew: true });
    expect(fourth.status).toBe(429);
    expect(await errCode(fourth)).toBe('RATE_LIMITED');
  });
});

describe('approving names and merging', () => {
  it('approve as new person makes the name active; twice is ALREADY_HANDLED', async () => {
    const g = await guestHeaders();
    const { participantId } = await json<{ participantId: string }>(await post('/people', g, { name: 'Dũng', confirmNew: true }));
    const headers = await minh();
    expect((await post(`/people/${participantId}/approve`, headers, {})).status).toBe(204);
    expect((await view(headers)).people.find((p) => p.id === participantId)?.status).toBe('active');
    const again = await post(`/people/${participantId}/approve`, headers, {});
    expect(again.status).toBe(409);
    expect(await errCode(again)).toBe('ALREADY_HANDLED');
  });

  it('approve as "Same as Chi" merges the pending name and moves its expense', async () => {
    const g = await guestHeaders();
    const { participantId } = await json<{ participantId: string }>(await post('/people', g, { name: 'Chi Nguyễn', confirmNew: true }));
    await env.DB.prepare("INSERT INTO expenses (id, trip_id, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-p', ?, 'Bánh tráng nướng', 180000, 'VND', '2026-10-11', ?, 'equal', 'pending', ?, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z')")
      .bind(T.tripId, participantId, participantId).run();
    await env.DB.prepare("INSERT INTO expense_shares (expense_id, participant_id, input_value, amount) VALUES ('e-p', ?, 1, 90000), ('e-p', ?, 1, 90000)").bind(participantId, PID.M).run();
    const headers = await minh();
    expect((await post(`/people/${participantId}/approve`, headers, { sameAs: PID.C })).status).toBe(204);
    const e = await env.DB.prepare("SELECT payer_id, created_by_participant_id FROM expenses WHERE id = 'e-p'").first<{ payer_id: string; created_by_participant_id: string }>();
    expect(e).toEqual({ payer_id: PID.C, created_by_participant_id: PID.C });
    expect((await view(headers)).people.map((p) => p.id)).not.toContain(participantId);
    expect((await view(g)).me.participantId).toBe(PID.C);
  });

  it('merging two people in the same expense sums their shares and keeps everyone else whole', async () => {
    await seedExpenses();
    const headers = await minh();
    expect((await post('/people/merge', headers, { fromId: PID.B, intoId: PID.A })).status).toBe(204);
    const v = await view(headers);
    const homestay = v.expenses.find((e) => e.id === 'e-1')!;
    expect(homestay.amount).toBe(3200000);
    expect(homestay.mode).toBe('amounts');
    expect(homestay.shares.find((s) => s.participantId === PID.A)?.amount).toBe(1600000);
    expect(homestay.shares.find((s) => s.participantId === PID.B)).toBeUndefined();
    expect(v.balances).toEqual({ [PID.M]: 2195000, [PID.A]: -950000, [PID.C]: -1245000 });
  });

  it('removing a person: only when they have nothing', async () => {
    await seedExpenses();
    const headers = await minh();
    const busy = await call(`${base}/people/${PID.C}`, { method: 'DELETE', headers });
    expect(busy.status).toBe(409);
    const { participantId } = await json<{ participantId: string }>(await post('/people', headers, { name: 'Giang', confirmNew: false }));
    expect((await call(`${base}/people/${participantId}`, { method: 'DELETE', headers })).status).toBe(204);
  });

  it('guests cannot merge or approve', async () => {
    const g = await guestHeaders(PID.C);
    expect((await post('/people/merge', g, { fromId: PID.B, intoId: PID.A })).status).toBe(403);
  });
});

describe('becoming a member', () => {
  it('a signed-in guest asks, a member approves, and they become a member', async () => {
    const anSid = await memberSid('u-an-2', 'An Trần');
    const g = await guestHeaders(PID.A);
    const asker = { ...g, Cookie: `${g.Cookie}; sid=${anSid}` };
    expect((await post('/membership', asker, { participantId: PID.A })).status).toBe(201);
    const headers = await minh();
    const approval = (await view(headers)).approvals.find((a) => a.kind === 'membership');
    expect(approval).toMatchObject({ kind: 'membership', participantId: PID.A, userName: 'An Trần' });
    const requestId = (approval as { requestId: string }).requestId;
    expect((await post(`/membership/${requestId}/approve`, headers)).status).toBe(204);
    expect((await view({ Cookie: `sid=${anSid}` })).me).toMatchObject({ kind: 'member', participantId: PID.A });
  });

  it('a request for a name already linked to someone is refused', async () => {
    await linkMember(PID.A, U.an, 'An');
    const otherSid = await memberSid('u-x', 'X');
    const g = await guestHeaders(PID.C);
    const res = await post('/membership', { ...g, Cookie: `${g.Cookie}; sid=${otherSid}` }, { participantId: PID.A });
    expect(res.status).toBe(403);
  });
});
