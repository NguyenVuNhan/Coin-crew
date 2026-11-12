import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripView } from '@cc/core';
import { call, json, seedTrip, memberSid, guestHeaders, T, PID, U } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function signedInGuest(pid: string, userId: string) {
  const sid = await memberSid(userId, userId);
  const g = await guestHeaders(pid);
  return { ...g, Cookie: `${g.Cookie}; sid=${sid}` };
}

beforeEach(seedTrip);

describe('membership request deduplication & idempotency (#72)', () => {
  it('returns existing requestId idempotently (200) on duplicate claim by same user', async () => {
    const user = await signedInGuest(PID.A, 'u-idempotent');

    // First claim
    const res1 = await post('/membership', user, { participantId: PID.A });
    expect(res1.status).toBe(201);
    const { requestId: id1 } = await json<{ requestId: string }>(res1);
    expect(id1).toBeTruthy();

    // Second claim on same participant by same user
    const res2 = await post('/membership', user, { participantId: PID.A });
    expect(res2.status).toBe(200);
    const { requestId: id2 } = await json<{ requestId: string }>(res2);
    expect(id2).toBe(id1);

    // Verify activity logs only logged membership_requested once
    const row = await env.DB.prepare(
      "SELECT count(*) as count FROM activity WHERE trip_id = ? AND action = 'membership_requested'",
    )
      .bind(T.tripId)
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it('supersedes previous pending claim when user claims a different participant', async () => {
    const sid = await memberSid('u-multi-claim', 'Multi Claimer');
    const guestA = await guestHeaders(PID.A);
    const userA = { ...guestA, Cookie: `${guestA.Cookie}; sid=${sid}` };

    // First claim on PID.A
    const res1 = await post('/membership', userA, { participantId: PID.A });
    expect(res1.status).toBe(201);
    const { requestId: id1 } = await json<{ requestId: string }>(res1);

    // Later user picks PID.B and claims PID.B
    const guestB = await guestHeaders(PID.B);
    const userB = { ...guestB, Cookie: `${guestB.Cookie}; sid=${sid}` };
    const res2 = await post('/membership', userB, { participantId: PID.B });
    expect(res2.status).toBe(201);
    const { requestId: id2 } = await json<{ requestId: string }>(res2);
    expect(id2).not.toBe(id1);

    // Check statuses in DB
    const req1 = await env.DB.prepare('SELECT status FROM membership_requests WHERE id = ?')
      .bind(id1)
      .first<{ status: string }>();
    expect(req1?.status).toBe('rejected');

    const req2 = await env.DB.prepare('SELECT status FROM membership_requests WHERE id = ?')
      .bind(id2)
      .first<{ status: string }>();
    expect(req2?.status).toBe('pending');
  });

  it('rejects claim with 409 ALREADY_CLAIMED when a different user claimed the person', async () => {
    const user1 = await signedInGuest(PID.A, 'u-first');
    const user2 = await signedInGuest(PID.A, 'u-second');

    const res1 = await post('/membership', user1, { participantId: PID.A });
    expect(res1.status).toBe(201);

    const res2 = await post('/membership', user2, { participantId: PID.A });
    expect(res2.status).toBe(409);
    expect(await json(res2)).toEqual({
      error: { code: 'ALREADY_CLAIMED', message: 'Someone already claimed this person, ask the owner' },
    });
  });

  it('does not reject prior pending claim if new target participant is blocked by pending proposal', async () => {
    const sid = await memberSid('u-safe-claim', 'Safe Claimer');
    const guestA = await guestHeaders(PID.A);
    const userA = { ...guestA, Cookie: `${guestA.Cookie}; sid=${sid}` };

    // First claim on PID.A succeeds
    const res1 = await post('/membership', userA, { participantId: PID.A });
    expect(res1.status).toBe(201);
    const { requestId: id1 } = await json<{ requestId: string }>(res1);

    // Create a pending merge proposal on PID.B
    await env.DB.prepare(
      "INSERT INTO merge_proposals (id, trip_id, guest_pid, target_user_id, requested_by_user_id, status, created_at) VALUES ('mp-1', ?, ?, 'u-other', 'u-minh', 'pending', '2026-10-12T00:00:00.000Z')",
    )
      .bind(T.tripId, PID.B)
      .run();

    // Now attempt to claim PID.B
    const guestB = await guestHeaders(PID.B);
    const userB = { ...guestB, Cookie: `${guestB.Cookie}; sid=${sid}` };
    const res2 = await post('/membership', userB, { participantId: PID.B });
    expect(res2.status).toBe(409);

    // Claim on PID.A must STILL be pending!
    const req1 = await env.DB.prepare('SELECT status FROM membership_requests WHERE id = ?')
      .bind(id1)
      .first<{ status: string }>();
    expect(req1?.status).toBe('pending');
  });
});

describe('a failed claim keeps the earlier pending claim (#80)', () => {
  const statusOf = async (id: string) =>
    (await env.DB.prepare('SELECT status FROM membership_requests WHERE id = ?').bind(id).first<{ status: string }>())?.status;

  async function claimA(userId: string) {
    const sid = await memberSid(userId, userId);
    const gA = await guestHeaders(PID.A);
    const res = await post('/membership', { ...gA, Cookie: `${gA.Cookie}; sid=${sid}` }, { participantId: PID.A });
    expect(res.status).toBe(201);
    const { requestId } = await json<{ requestId: string }>(res);
    const gB = await guestHeaders(PID.B);
    return { requestId, asB: { ...gB, Cookie: `${gB.Cookie}; sid=${sid}` } };
  }

  it('a claim on a name that is no longer claimable (409) leaves the earlier claim pending', async () => {
    const { requestId, asB } = await claimA('u-left-target');
    // B left the group after the device picked it: the route's pre-checks pass, the conditional writes add nothing.
    await env.DB.prepare("UPDATE participants SET status = 'left' WHERE id = ?").bind(PID.B).run();

    const res = await post('/membership', asB, { participantId: PID.B });
    expect(res.status).toBe(409);
    expect(await statusOf(requestId)).toBe('pending');
    const onB = await env.DB.prepare("SELECT count(*) AS n FROM membership_requests WHERE participant_id = ? AND status = 'pending'")
      .bind(PID.B)
      .first<{ n: number }>();
    expect(onB?.n).toBe(0);
  });

  it('a unique-index clash inside the batch (409 ALREADY_CLAIMED) leaves the earlier claim pending', async () => {
    const { requestId, asB } = await claimA('u-race');
    // A competing pending claim on B the route's pre-check can't see (stored under another trip id), so the
    // clash surfaces from the batch's INSERT on membership_requests_one_pending.
    await env.DB.prepare(
      "INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES ('mr-race', 't-elsewhere', ?, 'u-rival', 'pending', '2026-10-12T00:00:00.000Z')",
    )
      .bind(PID.B)
      .run();

    const res = await post('/membership', asB, { participantId: PID.B });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      error: { code: 'ALREADY_CLAIMED', message: 'Someone already claimed this person, ask the owner' },
    });
    expect(await statusOf(requestId)).toBe('pending');
    expect(await statusOf('mr-race')).toBe('pending');
  });
});

describe('trip view reports a pending claim (#80)', () => {
  const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));

  it('is true for a signed-in guest with a pending claim and falsy once approved', async () => {
    const user = await signedInGuest(PID.A, 'u-viewer');
    const res = await post('/membership', user, { participantId: PID.A });
    expect(res.status).toBe(201);
    const { requestId } = await json<{ requestId: string }>(res);

    expect((await view(user)).me.hasPendingMembershipRequest).toBe(true);

    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    expect((await post(`/membership/${requestId}/approve`, minh)).status).toBe(204);
    const after = await view(user);
    expect(after.me.kind).toBe('member');
    expect(after.me.hasPendingMembershipRequest).toBeFalsy();
  });

  it('is falsy for an anonymous guest', async () => {
    const g = await guestHeaders(PID.A);
    expect((await view(g)).me.hasPendingMembershipRequest).toBeFalsy();
  });
});
