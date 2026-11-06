import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ProposalsResponse, TripView } from '@cc/core';
import { getDb } from '@cc/api-db/client';
import { insertProposal } from '../src/proposals/store';
import { call, json, memberSid, pickAs, newDevice, seedUser } from './helpers';

const OWNER = 'u-owner';
const CHI = 'u-chi';
const DAO = 'u-dao';
const EVE = 'u-eve';
const NOW = '2026-10-20T00:00:00.000Z';
const sids = new Map<string, string>();

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function all<R>(query: string, ...binds: unknown[]): Promise<R[]> {
  return (await env.DB.prepare(query).bind(...binds).all<R>()).results;
}

async function addTrip(id: string, name: string, preset: 'trip' | 'direct' = 'trip') {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, \'VND\', 1, ?, ?, ?, 0, ?)',
    id, name, preset, OWNER, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null) {
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 0, \'active\', 0, ?)',
    id, tripId, name, name.toLowerCase(), userId, NOW,
  );
}

/**
 * T1 "Đà Lạt" (owner organises): owner, guests An and Bình, members Chi and Đào (not admins).
 * Eve has an account but is not in T1.
 */
beforeEach(async () => {
  sids.clear();
  await seedUser(OWNER, 'Owen');
  await seedUser(CHI, 'Chi');
  await seedUser(DAO, 'Đào');
  await seedUser(EVE, 'Eve');
  await addTrip('t1', 'Đà Lạt');
  await addPerson('t1', 't1-o', 'Owen', OWNER);
  await addPerson('t1', 'p-an', 'An', null);
  await addPerson('t1', 'p-binh', 'Bình', null);
  await addPerson('t1', 't1-chi', 'Chi', CHI);
  await addPerson('t1', 't1-dao', 'Đào', DAO);
});

async function auth(userId: string): Promise<Record<string, string>> {
  if (!sids.has(userId)) sids.set(userId, await memberSid(userId));
  return { Cookie: `sid=${sids.get(userId)}` };
}

const post = async (path: string, userId: string) => call(path, { method: 'POST', headers: await auth(userId) });
const accept = (id: string, userId = EVE) => post(`/api/me/proposals/${id}/accept`, userId);
const decline = (id: string, userId = EVE) => post(`/api/me/proposals/${id}/decline`, userId);
const cancel = (id: string, userId: string) => post(`/api/me/proposals/${id}/cancel`, userId);
const approve = (id: string, userId = OWNER, tripId = 't1') => post(`/api/trips/${tripId}/proposals/${id}/approve`, userId);
const reject = (id: string, userId = OWNER, tripId = 't1') => post(`/api/trips/${tripId}/proposals/${id}/reject`, userId);

async function errorOf(res: Response): Promise<Record<string, unknown>> {
  return (await json<{ error: Record<string, unknown> }>(res)).error;
}

/** Chi (not an admin) says guest An is Eve: Eve and an admin must both accept. */
const askEve = (over: Partial<Parameters<typeof insertProposal>[1]> = {}) =>
  insertProposal(getDb(env), {
    tripId: 't1', guestPid: 'p-an', intoPid: null, targetUserId: EVE, requestedBy: CHI,
    needsUser: true, needsAdmin: true, ...over,
  });

const statusOf = async (id: string) =>
  (await all<{ status: string; decided_at: string | null }>('SELECT status, decided_at FROM merge_proposals WHERE id = ?', id))[0]!;
const participant = async (id: string) =>
  (await all<{ status: string; user_id: string | null; name: string; merged_into: string | null }>(
    'SELECT status, user_id, name, merged_into FROM participants WHERE id = ?', id,
  ))[0]!;
const logged = (tripId: string, action: string) =>
  all<{ actor_user_id: string | null; actor_participant_id: string | null; details_json: string }>(
    'SELECT actor_user_id, actor_participant_id, details_json FROM activity WHERE trip_id = ? AND action = ?', tripId, action,
  );

async function okStatus(res: Response): Promise<string> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await json<{ status: string }>(res)).status;
}

describe('merge proposal flow', () => {
  it('user accept then admin approve links the guest to the user', async () => {
    const id = await askEve();
    expect(await okStatus(await accept(id))).toBe('waiting');
    expect((await participant('p-an')).user_id).toBeNull();
    expect((await statusOf(id)).status).toBe('pending');

    expect(await okStatus(await approve(id))).toBe('approved');
    expect(await participant('p-an')).toMatchObject({ status: 'active', user_id: EVE, name: 'Eve' });
    expect((await statusOf(id)).status).toBe('approved');
    expect((await statusOf(id)).decided_at).not.toBeNull();
    const log = await logged('t1', 'merge_proposal_accepted');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_user_id: OWNER, actor_participant_id: 't1-o' });
    expect(JSON.parse(log[0]!.details_json)).toMatchObject({ proposalId: id, participantId: 'p-an' });
  });

  it('admin first then user also completes', async () => {
    const id = await askEve();
    expect(await okStatus(await approve(id))).toBe('waiting');
    expect((await participant('p-an')).user_id).toBeNull();

    expect(await okStatus(await accept(id))).toBe('approved');
    expect((await participant('p-an')).user_id).toBe(EVE);
    // Eve is not in the group yet: she is logged by user only.
    expect(await logged('t1', 'merge_proposal_accepted')).toEqual([
      expect.objectContaining({ actor_user_id: EVE, actor_participant_id: null }),
    ]);
  });

  it('either decline marks declined and changes nothing', async () => {
    const id = await askEve();
    expect((await decline(id)).status).toBe(204);
    expect((await statusOf(id)).status).toBe('declined');
    expect(await participant('p-an')).toMatchObject({ status: 'active', user_id: null, name: 'An' });
    expect(await logged('t1', 'merge_proposal_declined')).toHaveLength(1);
    // Nothing left to accept.
    const late = await approve(id);
    expect(late.status).toBe(409);
    expect((await errorOf(late)).code).toBe('ALREADY_HANDLED');

    const id2 = await askEve();
    expect(await okStatus(await accept(id2))).toBe('waiting');
    expect((await reject(id2)).status).toBe(204);
    expect((await statusOf(id2)).status).toBe('declined');
    expect((await participant('p-an')).user_id).toBeNull();
    expect((await reject(id2)).status).toBe(409);
  });

  it('ledger proposal completes on the user alone', async () => {
    await addTrip('t-led', 'Owen', 'direct');
    await addPerson('t-led', 'led-o', 'Owen', OWNER);
    await addPerson('t-led', 'led-x', 'Xuân', null);
    const id = await insertProposal(getDb(env), {
      tripId: 't-led', guestPid: 'led-x', intoPid: null, targetUserId: EVE, requestedBy: OWNER, needsUser: true, needsAdmin: false,
    });
    expect(await okStatus(await accept(id))).toBe('approved');
    expect(await participant('led-x')).toMatchObject({ user_id: EVE, name: 'Eve' });
    expect((await statusOf(id)).status).toBe('approved');
  });

  it('user already a member when the last side accepts → guest merged into their participant', async () => {
    const id = await askEve();
    expect(await okStatus(await approve(id))).toBe('waiting');
    // Eve joined Đà Lạt another way while the proposal waited.
    await addPerson('t1', 't1-eve', 'Eve', EVE);

    expect(await okStatus(await accept(id))).toBe('approved');
    expect(await participant('p-an')).toMatchObject({ status: 'merged', merged_into: 't1-eve', user_id: null });
    expect(await participant('t1-eve')).toMatchObject({ status: 'active', user_id: EVE });
    expect(await logged('t1', 'name_merged')).toHaveLength(1);
    expect(await logged('t1', 'merge_proposal_accepted')).toEqual([
      expect.objectContaining({ actor_user_id: EVE, actor_participant_id: 't1-eve' }),
    ]);
  });

  it('an admin-only proposal merges the guest into the picked person', async () => {
    const id = await insertProposal(getDb(env), {
      tripId: 't1', guestPid: 'p-binh', intoPid: 'p-an', targetUserId: null, requestedBy: CHI, needsUser: false, needsAdmin: true,
    });
    // Chi is no admin.
    expect((await approve(id, CHI)).status).toBe(403);
    expect(await okStatus(await approve(id))).toBe('approved');
    expect(await participant('p-binh')).toMatchObject({ status: 'merged', merged_into: 'p-an' });
  });

  it('guest gone before the last accept → cancelled, 409 ALREADY_HANDLED', async () => {
    const id = await askEve();
    expect(await okStatus(await approve(id))).toBe('waiting');
    await run('UPDATE participants SET status = \'merged\', merged_into = ? WHERE id = ?', 'p-binh', 'p-an');

    const res = await accept(id);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('ALREADY_HANDLED');
    expect((await statusOf(id)).status).toBe('cancelled');
    expect(await participant('p-an')).toMatchObject({ status: 'merged', user_id: null });
    expect(await logged('t1', 'merge_proposal_accepted')).toEqual([]);
  });

  it('claim by the target user while pending → 409 PROPOSAL_PENDING with proposalId', async () => {
    const id = await askEve();
    const claimAs = async (userId: string) => {
      const sid = await memberSid(userId);
      const { deviceId, cookie } = await newDevice();
      await pickAs(deviceId, 'p-an', 't1');
      return call('/api/trips/t1/membership', {
        method: 'POST',
        headers: { Cookie: `${cookie}; sid=${sid}`, 'X-Link-Token': 'g-t1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: 'p-an' }),
      });
    };

    const mine = await claimAs(EVE);
    expect(mine.status).toBe(409);
    expect(await errorOf(mine)).toMatchObject({ code: 'PROPOSAL_PENDING', proposalId: id, requestedByName: 'Chi' });

    const other = await claimAs('u-zed');
    expect(other.status).toBe(409);
    expect((await errorOf(other)).code).toBe('ALREADY_CLAIMED');
    expect(await all('SELECT id FROM membership_requests')).toEqual([]);
  });

  it('friend claims Q, the proposal on P completes first, then the admin approves Q → Q merges into the friend', async () => {
    const sid = await memberSid(EVE);
    const { deviceId, cookie } = await newDevice();
    await pickAs(deviceId, 'p-binh', 't1');
    const claim = await call('/api/trips/t1/membership', {
      method: 'POST',
      headers: { Cookie: `${cookie}; sid=${sid}`, 'X-Link-Token': 'g-t1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: 'p-binh' }),
    });
    expect(claim.status).toBe(201);
    const { requestId } = await json<{ requestId: string }>(claim);

    // The owner (an admin) says An is Eve: only Eve's side is needed, and she accepts.
    const id = await askEve({ requestedBy: OWNER, needsAdmin: false });
    expect(await okStatus(await accept(id))).toBe('approved');
    expect((await participant('p-an')).user_id).toBe(EVE);

    const res = await post(`/api/trips/t1/membership/${requestId}/approve`, OWNER);
    expect(res.status, await res.clone().text()).toBe(204);
    expect(await participant('p-binh')).toMatchObject({ status: 'merged', merged_into: 'p-an' });
    expect(await all<{ status: string }>('SELECT status FROM membership_requests WHERE id = ?', requestId)).toEqual([{ status: 'approved' }]);
    expect(await logged('t1', 'membership_approved')).toHaveLength(1);
  });

  it('trip view lists the proposal for admins only', async () => {
    const id = await askEve();
    // Eve's own side is not shown to admins as something to approve.
    await insertProposal(getDb(env), {
      tripId: 't1', guestPid: 'p-binh', intoPid: null, targetUserId: DAO, requestedBy: OWNER, needsUser: true, needsAdmin: false,
    });
    const view = async (userId: string) => {
      const res = await call('/api/trips/t1', { headers: await auth(userId) });
      expect(res.status).toBe(200);
      return json<TripView>(res);
    };

    const admin = (await view(OWNER)).approvals.filter((a) => a.kind === 'proposal');
    expect(admin).toEqual([{
      kind: 'proposal', proposalId: id, guestPid: 'p-an', intoPid: null, targetUserName: 'Eve', requestedByName: 'Chi',
    }]);
    expect((await view(CHI)).approvals.filter((a) => a.kind === 'proposal')).toEqual([]);

    // Once the admin side is in, it leaves the admin's list.
    expect(await okStatus(await approve(id))).toBe('waiting');
    expect((await view(OWNER)).approvals.filter((a) => a.kind === 'proposal')).toEqual([]);
  });

  it('requester can cancel; others get 403', async () => {
    const id = await askEve();
    expect((await cancel(id, EVE)).status).toBe(403);
    expect((await cancel(id, OWNER)).status).toBe(403);
    expect((await cancel(id, CHI)).status).toBe(204);
    expect((await statusOf(id)).status).toBe('cancelled');
    expect((await cancel(id, CHI)).status).toBe(409);
    expect((await accept(id)).status).toBe(409);
  });

  it('only the target user can accept or decline', async () => {
    const id = await askEve();
    expect((await accept(id, DAO)).status).toBe(403);
    expect((await decline(id, CHI)).status).toBe(403);
    expect((await accept('nope')).status).toBe(404);
    expect((await statusOf(id)).status).toBe('pending');
  });

  it('archived group refuses every write', async () => {
    const id = await askEve();
    await run('UPDATE trips SET archived_at = ? WHERE id = ?', NOW, 't1');
    for (const res of [await accept(id), await decline(id), await cancel(id, CHI), await approve(id), await reject(id)]) {
      expect(res.status).toBe(409);
      expect((await errorOf(res)).code).toBe('TRIP_ARCHIVED');
    }
    expect((await statusOf(id)).status).toBe('pending');
  });

  it('GET /me/proposals: incoming for the friend, outgoing for the requester', async () => {
    const id = await askEve();
    const list = async (userId: string) => {
      const res = await call('/api/me/proposals', { headers: await auth(userId) });
      expect(res.status).toBe(200);
      return json<ProposalsResponse>(res);
    };

    const eve = await list(EVE);
    expect(eve.outgoing).toEqual([]);
    expect(eve.incoming).toEqual([{
      id, tripId: 't1', tripName: 'Đà Lạt', tripKind: 'group', guestName: 'An', guestKey: 'p:p-an',
      requestedByName: 'Chi', targetUserName: 'Eve', waitingFor: ['user', 'admin'], status: 'pending',
    }]);

    const chi = await list(CHI);
    expect(chi.incoming).toEqual([]);
    expect(chi.outgoing).toEqual([expect.objectContaining({ id, status: 'pending', waitingFor: ['user', 'admin'] })]);

    await accept(id);
    expect((await list(CHI)).outgoing[0]!.waitingFor).toEqual(['admin']);

    // Decided ones stay in outgoing for a week, so the person page can say "declined".
    await reject(id);
    expect((await list(EVE)).incoming).toEqual([]);
    expect((await list(CHI)).outgoing).toEqual([expect.objectContaining({ id, status: 'declined', waitingFor: [] })]);
    await run('UPDATE merge_proposals SET decided_at = ? WHERE id = ?', '2020-01-01T00:00:00.000Z', id);
    expect((await list(CHI)).outgoing).toEqual([]);

    expect((await call('/api/me/proposals')).status).toBe(401);
  });
});
