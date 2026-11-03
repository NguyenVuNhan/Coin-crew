import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { MeResponse } from '@cc/core';
import { call, json, memberSid, seedTrip, T, U, PID } from './helpers';
import { getDb } from '@cc/api-db/client';
import { requestClaim, upsertIdentity } from '../src/auth/identity';
import { sha256Hex } from '@cc/api-util/ids';

const CREATED = '2026-10-12T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addSession(sid: string, userId: string): Promise<void> {
  await run(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
    await sha256Hex(sid),
    userId,
    '2099-01-01T00:00:00.000Z',
  );
}

describe('GET /api/me claims & joining (initiatedBy=merged)', () => {
  it('signed out response omits joining and claim', async () => {
    const res = await call('/api/me');
    expect(res.status).toBe(200);
    const body = await json<MeResponse>(res);
    expect(body.user).toBeNull();
    expect(body.mergeRequests.joining!).toBeUndefined();
    expect(body.mergeRequests.claim).toBeUndefined();
  });

  it('survivor sees one joining entry with groups: [] for a brand new Zalo user', async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');

    const zaloUserId = await upsertIdentity(getDb(env), 'zalo', {
      sub: 'z-new-brand',
      name: 'Zalo Brand New',
      avatarUrl: 'https://example.com/avatar-brand-new.png',
    });
    const zaloSid = 'sid-zalo-brand-new';
    await addSession(zaloSid, zaloUserId);

    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    expect(outcome.result).toBe('requested');
    if (outcome.result !== 'requested') throw new Error('expected requested');

    const res = await call('/api/me', { headers: { Cookie: `sid=${minhSid}` } });
    expect(res.status).toBe(200);
    const body = await json<MeResponse>(res);

    expect(body.mergeRequests.joining!).toHaveLength(1);
    expect(body.mergeRequests.joining![0]).toEqual({
      id: outcome.requestId,
      expiresAt: expect.any(String),
      zalo: {
        name: 'Zalo Brand New',
        avatarUrl: 'https://example.com/avatar-brand-new.png',
      },
      groups: [],
      collapsing: [],
      autoConfirm: [],
    });

    // Initiated by merged: must not appear in incoming or outgoing
    expect(body.mergeRequests.incoming).toEqual([]);
    expect(body.mergeRequests.outgoing).toEqual([]);
    expect(body.mergeRequests.claim).toBeNull();
  });

  it('collapsing names both when Zalo user is "Nhân Z" and survivor is "Nhân" in trip T', async () => {
    const survivorSid = await memberSid('u-nhan', 'Nhân');
    const zaloUserId = await upsertIdentity(getDb(env), 'zalo', {
      sub: 'z-nhan-sub',
      name: 'Nhân Z',
      avatarUrl: null,
    });
    const zaloSid = 'sid-nhan-z';
    await addSession(zaloSid, zaloUserId);

    // Trip T where both have active participants
    await run(
      'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      'tr-shared-t',
      'Trip T',
      'u-nhan',
      'gtok-shared-t',
      'vtok-shared-t',
      CREATED,
    );
    await run(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-survivor-nhan', 'tr-shared-t', 'Nhân', 'nhan', 'u-nhan', 'active', 0, ?)",
      CREATED,
    );
    await run(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-zalo-nhan-z', 'tr-shared-t', 'Nhân Z', 'nhan z', ?, 'active', 1, ?)",
      zaloUserId,
      CREATED,
    );

    // Additional trip where only Zalo user is an active participant
    await run(
      'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      'tr-zalo-only',
      'Zalo Trip Only',
      zaloUserId,
      'gtok-zalo-only',
      'vtok-zalo-only',
      CREATED,
    );
    await run(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-zalo-solo', 'tr-zalo-only', 'Nhân Z', 'nhan z', ?, 'active', 0, ?)",
      zaloUserId,
      CREATED,
    );

    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: 'tr-shared-t',
      participantId: 'p-survivor-nhan',
    });
    expect(outcome.result).toBe('requested');
    if (outcome.result !== 'requested') throw new Error('expected requested');

    // As survivor ('u-nhan'):
    const survivorRes = await call('/api/me', { headers: { Cookie: `sid=${survivorSid}` } });
    expect(survivorRes.status).toBe(200);
    const survivorBody = await json<MeResponse>(survivorRes);

    expect(survivorBody.mergeRequests.joining).toHaveLength(1);
    const joining = survivorBody.mergeRequests.joining![0]!;
    expect(joining.id).toBe(outcome.requestId);
    expect(joining.zalo).toEqual({ name: 'Nhân Z', avatarUrl: null });

    // groups contains all active trips of the Zalo user
    expect(joining.groups).toEqual(
      expect.arrayContaining([
        { tripId: 'tr-shared-t', name: 'Trip T' },
        { tripId: 'tr-zalo-only', name: 'Zalo Trip Only' },
      ]),
    );
    expect(joining.groups).toHaveLength(2);

    // collapsing contains the trip where both accounts have active participants
    expect(joining.collapsing).toEqual([
      {
        tripId: 'tr-shared-t',
        name: 'Trip T',
        zaloPersonName: 'Nhân Z',
        yourPersonName: 'Nhân',
      },
    ]);
  });

  it('Zalo user sees claim with the participant name', async () => {
    const survivorSid = await memberSid('u-survivor-claim', 'Alice');
    const zaloUserId = await upsertIdentity(getDb(env), 'zalo', {
      sub: 'z-claim-sub',
      name: 'Bob Zalo',
      avatarUrl: null,
    });
    const zaloSid = 'sid-bob-zalo';
    await addSession(zaloSid, zaloUserId);

    await run(
      'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      'tr-alice-trip',
      'Alice Trip',
      'u-survivor-claim',
      'gtok-alice',
      'vtok-alice',
      CREATED,
    );
    await run(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-alice-part', 'tr-alice-trip', 'Alice', 'alice', 'u-survivor-claim', 'active', 0, ?)",
      CREATED,
    );

    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: 'tr-alice-trip',
      participantId: 'p-alice-part',
    });
    expect(outcome.result).toBe('requested');
    if (outcome.result !== 'requested') throw new Error('expected requested');

    // As Zalo user:
    const zaloRes = await call('/api/me', { headers: { Cookie: `sid=${zaloSid}` } });
    expect(zaloRes.status).toBe(200);
    const zaloBody = await json<MeResponse>(zaloRes);

    expect(zaloBody.mergeRequests.claim).toEqual({
      id: outcome.requestId,
      tripId: 'tr-alice-trip',
      participantId: 'p-alice-part',
      name: 'Alice',
      expiresAt: expect.any(String),
    });
    expect(zaloBody.mergeRequests.joining).toEqual([]);
    expect(zaloBody.mergeRequests.incoming).toEqual([]);
    expect(zaloBody.mergeRequests.outgoing).toEqual([]);
  });

  it('expired and declined claims appear on neither side', async () => {
    const now = Date.now();
    const pastDate = new Date(now - 86_400_000).toISOString();
    const futureDate = new Date(now + 7 * 86_400_000).toISOString();

    const survivorSid = await memberSid('u-surv-exp', 'Survivor Exp');
    const zaloUserId = await upsertIdentity(getDb(env), 'zalo', {
      sub: 'z-exp-sub',
      name: 'Zalo Exp',
      avatarUrl: null,
    });
    const zaloSid = 'sid-zalo-exp';
    await addSession(zaloSid, zaloUserId);

    await run(
      'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      'tr-exp',
      'Trip Exp',
      'u-surv-exp',
      'gtok-exp',
      'vtok-exp',
      CREATED,
    );
    await run(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-exp', 'tr-exp', 'Survivor Exp', 'survivor exp', 'u-surv-exp', 'active', 0, ?)",
      CREATED,
    );

    // Expired pending claim
    await run(
      "INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, initiated_by, claim_trip_id, claim_participant_id) VALUES ('mr-expired-claim', 'u-surv-exp', ?, 'zalo', 'z-exp-sub', 'pending', ?, ?, 'merged', 'tr-exp', 'p-exp')",
      zaloUserId,
      CREATED,
      pastDate,
    );

    // Declined unexpired claim
    await run(
      "INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, initiated_by, claim_trip_id, claim_participant_id, decided_at) VALUES ('mr-declined-claim', 'u-surv-exp', ?, 'zalo', 'z-exp-sub', 'declined', ?, ?, 'merged', 'tr-exp', 'p-exp', ?)",
      zaloUserId,
      CREATED,
      futureDate,
      CREATED,
    );

    // Survivor check
    const survRes = await call('/api/me', { headers: { Cookie: `sid=${survivorSid}` } });
    expect(survRes.status).toBe(200);
    const survBody = await json<MeResponse>(survRes);
    expect(survBody.mergeRequests.joining).toEqual([]);
    expect(survBody.mergeRequests.claim).toBeNull();
    expect(survBody.mergeRequests.incoming).toEqual([]);
    expect(survBody.mergeRequests.outgoing).toEqual([]);

    // Zalo user check
    const zaloRes = await call('/api/me', { headers: { Cookie: `sid=${zaloSid}` } });
    expect(zaloRes.status).toBe(200);
    const zaloBody = await json<MeResponse>(zaloRes);
    expect(zaloBody.mergeRequests.joining).toEqual([]);
    expect(zaloBody.mergeRequests.claim).toBeNull();
    expect(zaloBody.mergeRequests.incoming).toEqual([]);
    expect(zaloBody.mergeRequests.outgoing).toEqual([]);
  });
});
