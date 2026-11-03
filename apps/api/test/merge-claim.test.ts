import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { MeResponse } from '@cc/core';
import { call, json, memberSid, PID, seedTrip, T, U } from './helpers';
import { getDb } from '@cc/api-db/client';
import { requestClaim, upsertIdentity } from '../src/auth/identity';
import { sha256Hex } from '@cc/api-util/ids';

const CREATED = '2026-10-12T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(query).bind(...binds).run();
}

async function row<T>(query: string, ...binds: unknown[]): Promise<T | null> {
  return env.DB.prepare(query).bind(...binds).first<T>();
}

async function addSession(sid: string, userId: string): Promise<void> {
  await run(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
    await sha256Hex(sid),
    userId,
    '2099-01-01T00:00:00.000Z',
  );
}

function post(path: string, sid?: string): Promise<Response> {
  return call(path, { method: 'POST', headers: sid ? { Cookie: `sid=${sid}` } : {} });
}

const accept = (id: string, sid?: string) => post(`/api/me/merge-requests/${id}/accept`, sid);
const decline = (id: string, sid?: string) => post(`/api/me/merge-requests/${id}/decline`, sid);
const cancel = (id: string, sid?: string) => post(`/api/me/merge-requests/${id}/cancel`, sid);

async function createZaloUser(sub: string, name: string, sid: string): Promise<string> {
  const userId = await upsertIdentity(getDb(env), 'zalo', {
    sub,
    name,
    avatarUrl: null,
  });
  await addSession(sid, userId);
  return userId;
}

describe('merge claim (initiatedBy=merged)', () => {
  it("survivor accepts a claim: Zalo user's participants and sessions move to survivor, and survivor gets zaloSub", async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');
    const zaloUserId = await createZaloUser('z-claim-1', 'Minh Zalo', 'sid-zalo-1');

    await run(
      'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      't-2',
      'Trip 2',
      zaloUserId,
      'gt-2',
      'vt-2',
      CREATED,
    );
    await run(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES ('p-z2', 't-2', 'Minh Zalo', 'minh zalo', ?, 0, 'active', 0, ?)",
      zaloUserId,
      CREATED,
    );

    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    expect(outcome.result).toBe('requested');
    if (outcome.result !== 'requested') throw new Error('expected requested');

    const res = await accept(outcome.requestId, minhSid);
    expect(res.status).toBe(200);
    const body = await json<{ user: { id: string; providers: string[] } }>(res);
    expect(body.user.id).toBe(U.minh);
    expect(body.user.providers).toEqual(['google', 'zalo']);

    expect(await row('SELECT id FROM users WHERE id = ?', zaloUserId)).toBeNull();

    const survivor = (await row<{ zalo_sub: string | null; google_sub: string | null }>(
      'SELECT zalo_sub, google_sub FROM users WHERE id = ?',
      U.minh,
    ))!;
    expect(survivor.zalo_sub).toBe('z-claim-1');
    expect(survivor.google_sub).toBe(`g-${U.minh}`);

    const pz2 = (await row<{ user_id: string | null }>(
      "SELECT user_id FROM participants WHERE id = 'p-z2'",
    ))!;
    expect(pz2.user_id).toBe(U.minh);

    const meZalo = await json<MeResponse>(
      call('/api/me', { headers: { Cookie: 'sid=sid-zalo-1' } }),
    );
    expect(meZalo.user?.id).toBe(U.minh);

    const leftSessions = (await row<{ n: number }>(
      'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?',
      zaloUserId,
    ))!;
    expect(leftSessions.n).toBe(0);

    const reqRow = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      outcome.requestId,
    ))!;
    expect(reqRow.status).toBe('accepted');
    expect(reqRow.decided_at).not.toBeNull();
  });

  it("Zalo user cannot accept their own claim (404); survivor can decline it, and Zalo user can cancel it", async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');
    const zaloUserId = await createZaloUser('z-claim-2', 'Minh Zalo', 'sid-zalo-2');

    const first = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (first.result !== 'requested') throw new Error('expected requested');

    // Zalo user cannot accept or decline their own claim; survivor cannot cancel it.
    expect((await accept(first.requestId, 'sid-zalo-2')).status).toBe(404);
    expect((await decline(first.requestId, 'sid-zalo-2')).status).toBe(404);
    expect((await cancel(first.requestId, minhSid)).status).toBe(404);

    // Survivor can decline it.
    const decRes = await decline(first.requestId, minhSid);
    expect(decRes.status).toBe(204);
    const firstRow = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      first.requestId,
    ))!;
    expect(firstRow.status).toBe('declined');
    expect(firstRow.decided_at).not.toBeNull();

    // New claim: Zalo user can cancel it.
    const second = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (second.result !== 'requested') throw new Error('expected requested');

    const cancelRes = await cancel(second.requestId, 'sid-zalo-2');
    expect(cancelRes.status).toBe(204);
    const secondRow = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      second.requestId,
    ))!;
    expect(secondRow.status).toBe('cancelled');
    expect(secondRow.decided_at).not.toBeNull();
  });

  it('an expired claim gets 404 on accept', async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');
    const zaloUserId = await createZaloUser('z-claim-exp', 'Minh Zalo', 'sid-zalo-exp');

    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (outcome.result !== 'requested') throw new Error('expected requested');

    await run(
      "UPDATE account_merge_requests SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?",
      outcome.requestId,
    );

    const res = await accept(outcome.requestId, minhSid);
    expect(res.status).toBe(404);

    const reqRow = (await row<{ status: string }>(
      'SELECT status FROM account_merge_requests WHERE id = ?',
      outcome.requestId,
    ))!;
    expect(reqRow.status).toBe('pending');
    expect(await row('SELECT id FROM users WHERE id = ?', zaloUserId)).not.toBeNull();
  });

  it('a claim where the Zalo user is already in the claimed trip as another participant merges and leaves one active participant there', async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');
    const zaloUserId = await createZaloUser('z-claim-shared', 'Minh Zalo', 'sid-zalo-shared');

    // Zalo user is already in T.tripId as PID.A
    await run('UPDATE participants SET user_id = ? WHERE id = ?', zaloUserId, PID.A);

    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (outcome.result !== 'requested') throw new Error('expected requested');

    const res = await accept(outcome.requestId, minhSid);
    expect(res.status).toBe(200);

    const pAn = (await row<{ status: string; merged_into: string | null }>(
      'SELECT status, merged_into FROM participants WHERE id = ?',
      PID.A,
    ))!;
    expect(pAn).toEqual({ status: 'merged', merged_into: PID.M });

    const pMinh = (await row<{ status: string; user_id: string | null }>(
      'SELECT status, user_id FROM participants WHERE id = ?',
      PID.M,
    ))!;
    expect(pMinh).toEqual({ status: 'active', user_id: U.minh });

    const activeForSurvivor = (await row<{ n: number }>(
      "SELECT COUNT(*) AS n FROM participants WHERE trip_id = ? AND user_id = ? AND status = 'active'",
      T.tripId,
      U.minh,
    ))!;
    expect(activeForSurvivor.n).toBe(1);
  });

  it("accepting one claim cancels a second Zalo user's claim on the same survivor", async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');
    const zaloUser1 = await createZaloUser('z-claim-u1', 'Zalo One', 'sid-zalo-u1');
    const zaloUser2 = await createZaloUser('z-claim-u2', 'Zalo Two', 'sid-zalo-u2');

    const claim1 = await requestClaim(getDb(env), zaloUser1, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    const claim2 = await requestClaim(getDb(env), zaloUser2, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (claim1.result !== 'requested' || claim2.result !== 'requested') {
      throw new Error('expected both claims requested');
    }

    const res = await accept(claim1.requestId, minhSid);
    expect(res.status).toBe(200);

    const row1 = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      claim1.requestId,
    ))!;
    expect(row1.status).toBe('accepted');
    expect(row1.decided_at).not.toBeNull();

    const row2 = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      claim2.requestId,
    ))!;
    expect(row2.status).toBe('cancelled');
    expect(row2.decided_at).not.toBeNull();

    expect(await row('SELECT id FROM users WHERE id = ?', zaloUser2)).not.toBeNull();
  });

  it('a claim payment with claim_request_id has a null claim_request_id after accept', async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');
    const zaloUserId = await createZaloUser('z-claim-pay', 'Minh Zalo', 'sid-zalo-pay');

    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (outcome.result !== 'requested') throw new Error('expected requested');

    await run(
      `INSERT INTO transactions
        (id, root_id, trip_id, type, description, amount, spent_on, payer_id, to_id, status, created_by_participant_id, claim_request_id, created_at, updated_at)
       VALUES ('tx-claim-1', 'tx-claim-1', ?, 'payment', '', 100000, '2026-10-12', ?, ?, 'says_paid', ?, ?, ?, ?)`,
      T.tripId,
      PID.A,
      PID.M,
      PID.A,
      outcome.requestId,
      CREATED,
      CREATED,
    );

    const res = await accept(outcome.requestId, minhSid);
    expect(res.status).toBe(200);

    const tx = (await row<{ claim_request_id: string | null }>(
      "SELECT claim_request_id FROM transactions WHERE id = 'tx-claim-1'",
    ))!;
    expect(tx.claim_request_id).toBeNull();
  });
});
