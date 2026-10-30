import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

/** A guest on `pid` who is also signed in as `userId`. */
async function signedInGuest(pid: string, userId: string) {
  const sid = await memberSid(userId, userId);
  const g = await guestHeaders(pid);
  return { ...g, Cookie: `${g.Cookie}; sid=${sid}` };
}

async function pendingRequests() {
  const { results } = await env.DB.prepare("SELECT id, participant_id, user_id FROM membership_requests WHERE status = 'pending'")
    .all<{ id: string; participant_id: string; user_id: string }>();
  return results;
}

/** No pending claim may point at a merged (or otherwise inactive) person. */
async function expectConsistent() {
  const bad = await env.DB.prepare(
    "SELECT r.id FROM membership_requests r JOIN participants p ON p.id = r.participant_id WHERE r.status = 'pending' AND p.status <> 'active'",
  ).all();
  expect(bad.results).toEqual([]);
}

beforeEach(seedTrip);

describe('race-safe guest claims', () => {
  it('two people claiming the same name at once: exactly one wins', async () => {
    const one = await signedInGuest(PID.A, 'u-claim-1');
    const two = await signedInGuest(PID.A, 'u-claim-2');
    const results = await Promise.all([
      post('/membership', one, { participantId: PID.A }),
      post('/membership', two, { participantId: PID.A }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(await json(loser)).toEqual({
      error: { code: 'ALREADY_CLAIMED', message: 'Someone already claimed this person, ask the owner' },
    });
    expect(await pendingRequests()).toHaveLength(1);
  });

  it('a claim on a merged name lands on the person it was merged into', async () => {
    const g = await signedInGuest(PID.B, 'u-binh');
    expect((await post('/people/merge', await minh(), { fromId: PID.B, intoId: PID.A })).status).toBe(204);
    expect((await post('/membership', g, { participantId: PID.B })).status).toBe(201);
    const pending = await pendingRequests();
    expect(pending).toEqual([expect.objectContaining({ participant_id: PID.A, user_id: 'u-binh' })]);
  });

  it('a claim racing a merge leaves the database consistent', async () => {
    const g = await signedInGuest(PID.B, 'u-binh');
    const m = await minh();
    const [claim, merge] = await Promise.all([
      post('/membership', g, { participantId: PID.B }),
      post('/people/merge', m, { fromId: PID.B, intoId: PID.A }),
    ]);
    const statuses = [claim.status, merge.status];
    expect(statuses.every((s) => s === 201 || s === 204 || s === 409)).toBe(true);
    expect(statuses.filter((s) => s !== 409).length).toBeGreaterThanOrEqual(1);
    if (merge.status === 409) {
      // The claim got in first: the merge refused and changed nothing.
      expect(await json(merge)).toMatchObject({ error: { code: 'CONFLICT', message: 'CLAIM_PENDING' } });
      const b = await env.DB.prepare('SELECT status FROM participants WHERE id = ?').bind(PID.B).first<{ status: string }>();
      expect(b?.status).toBe('active');
      expect(await pendingRequests()).toEqual([expect.objectContaining({ participant_id: PID.B })]);
    } else if (claim.status === 201) {
      // The merge finished first and the claim followed it to the survivor.
      expect(await pendingRequests()).toEqual([expect.objectContaining({ participant_id: PID.A })]);
    } else {
      expect(await pendingRequests()).toEqual([]);
    }
    await expectConsistent();
  });

  it('approving a claim on a name someone else already holds is refused and the claim is rejected', async () => {
    const g = await signedInGuest(PID.A, 'u-claim-1');
    const res = await post('/membership', g, { participantId: PID.A });
    const { requestId } = await json<{ requestId: string }>(res);
    await env.DB.prepare('UPDATE participants SET user_id = ? WHERE id = ?').bind(U.an, PID.A).run();

    const approve = await post(`/membership/${requestId}/approve`, await minh());
    expect(approve.status).toBe(409);
    const row = await env.DB.prepare('SELECT status FROM membership_requests WHERE id = ?').bind(requestId).first<{ status: string }>();
    expect(row?.status).toBe('rejected');
    const a = await env.DB.prepare('SELECT user_id FROM participants WHERE id = ?').bind(PID.A).first<{ user_id: string }>();
    expect(a?.user_id).toBe(U.an);
  });
});
