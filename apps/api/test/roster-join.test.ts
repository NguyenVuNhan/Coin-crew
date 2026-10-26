import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { JoinResponse, PickerView, TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, linkMember, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = async (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
/** A phone holding the group link, signed in as `userId`, with no name picked. */
const signedInGuest = async (userId: string, name: string) => {
  const g = await guestHeaders();
  return { ...g, Cookie: `${g.Cookie}; sid=${await memberSid(userId, name)}` };
};

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
});

describe('joining', () => {
  it('a signed-in user joins with their account name and is a member straight away', async () => {
    const h = await signedInGuest('u-dung', 'Dũng');
    const res = await post('/join', h, {});
    expect(res.status).toBe(201);
    const { participantId, rejoined } = await json<JoinResponse>(res);
    expect(rejoined).toBe(false);
    const v = await view(h);
    expect(v.me).toMatchObject({ kind: 'member', participantId });
    expect(v.people.find((p) => p.id === participantId)).toMatchObject({ name: 'Dũng', status: 'active', isMember: true });
  });

  it('a look-alike name needs confirmNew', async () => {
    const h = await signedInGuest('u-binh2', 'Binh');
    expect((await post('/join', h, {})).status).toBe(422);
    expect((await post('/join', h, { confirmNew: true })).status).toBe(201);
  });

  it('a sport group needs a gender unless the account has one', async () => {
    await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
    const h = await signedInGuest('u-dung', 'Dũng');
    expect((await post('/join', h, {})).status).toBe(422);
    const { participantId } = await json<JoinResponse>(post('/join', h, { gender: 'F' }));
    expect((await view(h)).people.find((p) => p.id === participantId)?.gender).toBe('F');
    const em = await signedInGuest('u-em', 'Em');
    await env.DB.prepare("UPDATE users SET gender = 'M' WHERE id = 'u-em'").run();
    expect((await post('/join', em, {})).status).toBe(201);
  });

  it('signed out is 401, the view link is 403, a member is 409', async () => {
    expect((await post('/join', await guestHeaders(), {})).status).toBe(401);
    const viewOnly = await guestHeaders(undefined, T.viewToken);
    expect((await post('/join', { ...viewOnly, Cookie: `${viewOnly.Cookie}; sid=${await memberSid('u-dung', 'Dũng')}` }, {})).status).toBe(403);
    const g = await guestHeaders();
    expect((await post('/join', { ...g, Cookie: `${g.Cookie}; sid=${await memberSid(U.minh, 'Minh')}` }, {})).status).toBe(409);
  });
});

describe('rejoining', () => {
  it('rejoin returns the same name even after the account is renamed', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await post('/leave', { Cookie: `sid=${anSid}` });
    await env.DB.prepare("UPDATE users SET name = 'An Trần' WHERE id = ?").bind(U.an).run();
    const g = await guestHeaders();
    const res = await post('/join', { ...g, Cookie: `${g.Cookie}; sid=${anSid}` }, {});
    expect(await json(res)).toEqual({ participantId: PID.A, rejoined: true });
    const rows = await env.DB.prepare('SELECT name, status FROM participants WHERE user_id = ?').bind(U.an).all<{ name: string; status: string }>();
    expect(rows.results).toEqual([{ name: 'An', status: 'active' }]);
  });
});

describe('one name per user', () => {
  it('joining rejects the waiting claim, and an old claim cannot be approved later', async () => {
    const g = await guestHeaders(PID.C);
    const h = { ...g, Cookie: `${g.Cookie}; sid=${await memberSid('u-xuan', 'Xuân')}` };
    const { requestId } = await json<{ requestId: string }>(post('/membership', h, { participantId: PID.C }));
    expect((await post('/join', h, {})).status).toBe(201);
    expect((await env.DB.prepare('SELECT status FROM membership_requests WHERE id = ?').bind(requestId).first<{ status: string }>())?.status).toBe('rejected');
    await env.DB.prepare("INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES ('mr-late', ?, ?, 'u-xuan', 'pending', '2026-10-21T00:00:00.000Z')").bind(T.tripId, PID.B).run();
    const late = await post('/membership/mr-late/approve', await minh());
    expect(late.status).toBe(409);
  });
});

describe('the picker', () => {
  it('hides left names and offers the owner theirs', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await post('/leave', { Cookie: `sid=${anSid}` });
    const g = await guestHeaders();
    const p = await json<PickerView>(call(`${base}/people/picker`, { headers: { ...g, Cookie: `${g.Cookie}; sid=${anSid}` } }));
    expect(p.people.some((x) => x.id === PID.A)).toBe(false);
    expect(p.myLeftName).toEqual({ id: PID.A, name: 'An' });
    expect(p.account).toEqual({ name: 'An', needsGender: false });
  });

  it('says nothing about an account when signed out', async () => {
    const p = await json<PickerView>(call(`${base}/people/picker`, { headers: await guestHeaders() }));
    expect(p.account).toBeNull();
    expect(p.myLeftName).toBeNull();
  });
});
