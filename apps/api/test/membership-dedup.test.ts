import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, memberSid, guestHeaders, T, PID } from './helpers';

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
});
