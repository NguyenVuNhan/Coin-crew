import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { MeResponse, TripView } from '@fsl/core';
import { app, call, json, memberSid, seedTrip, T, U, PID } from './helpers';

describe('GET /api/me', () => {
  it('signed out', async () => {
    const res = await call('/api/me');
    expect(res.status).toBe(200);
    const body = await json<MeResponse>(res);
    expect(body).toEqual({
      user: null,
      signIn: { zalo: true },
      mergeRequests: { incoming: [], outgoing: [] },
    });
  });

  it('Zalo hidden when not configured', async () => {
    const res = await app.request('/api/me', {}, { ...env, ZALO_APP_SECRET: undefined });
    expect(res.status).toBe(200);
    const body = await json<MeResponse>(res);
    expect(body.signIn.zalo).toBe(false);
  });

  it('lists providers', async () => {
    // Google user -> ['google']
    const sidGoogle = await memberSid('u-provider-google', 'Google User');
    const resGoogle = await call('/api/me', { headers: { Cookie: `sid=${sidGoogle}` } });
    expect(resGoogle.status).toBe(200);
    const bodyGoogle = await json<MeResponse>(resGoogle);
    expect(bodyGoogle.user?.providers).toEqual(['google']);

    // User with both subs -> ['google', 'zalo'] (google first)
    const sidBoth = await memberSid('u-provider-both', 'Both User');
    await env.DB.prepare("UPDATE users SET zalo_sub = 'z-provider-both' WHERE id = 'u-provider-both'").run();
    const resBoth = await call('/api/me', { headers: { Cookie: `sid=${sidBoth}` } });
    expect(resBoth.status).toBe(200);
    const bodyBoth = await json<MeResponse>(resBoth);
    expect(bodyBoth.user?.providers).toEqual(['google', 'zalo']);

    // Zalo-only user -> ['zalo'] and email null
    const sidZalo = await memberSid('u-provider-zalo', 'Zalo User');
    await env.DB.prepare(
      "UPDATE users SET google_sub = NULL, zalo_sub = 'z-provider-zalo', email = NULL WHERE id = 'u-provider-zalo'",
    ).run();
    const resZalo = await call('/api/me', { headers: { Cookie: `sid=${sidZalo}` } });
    expect(resZalo.status).toBe(200);
    const bodyZalo = await json<MeResponse>(resZalo);
    expect(bodyZalo.user?.providers).toEqual(['zalo']);
    expect(bodyZalo.user?.email).toBeNull();
  });

  it('incoming lists pending unexpired requests for me', async () => {
    const now = Date.now();
    const in7Days = new Date(now + 7 * 86_400_000).toISOString();
    const pastDate = new Date(now - 86_400_000).toISOString();
    const createdDate = new Date(now).toISOString();

    // User A (Google, email a@x.com, name 'A', 2 active participants in 2 trips)
    const sidA = await memberSid('u-a', 'A');
    await env.DB.prepare("UPDATE users SET email = 'a@x.com' WHERE id = 'u-a'").run();

    // User B (Zalo-only, 1 active participant)
    const sidB = await memberSid('u-b', 'B');
    await env.DB.prepare(
      "UPDATE users SET google_sub = NULL, zalo_sub = 'z-b', email = NULL WHERE id = 'u-b'",
    ).run();

    // Trips and active participants: A has 2 active participants in 2 trips, B has 1 active participant
    await env.DB.prepare(
      "INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, 'Trip A1', 'VND', 1, 'u-a', 'gtok-a1', 'vtok-a1', 0, ?)",
    ).bind('tr-a1', createdDate).run();
    await env.DB.prepare(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-a1', 'tr-a1', 'A', 'a', 'u-a', 'active', 0, ?)",
    ).bind(createdDate).run();

    await env.DB.prepare(
      "INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, 'Trip A2', 'VND', 1, 'u-a', 'gtok-a2', 'vtok-a2', 0, ?)",
    ).bind('tr-a2', createdDate).run();
    await env.DB.prepare(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-a2', 'tr-a2', 'A', 'a', 'u-a', 'active', 0, ?)",
    ).bind(createdDate).run();

    await env.DB.prepare(
      "INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, 'Trip B1', 'VND', 1, 'u-b', 'gtok-b1', 'vtok-b1', 0, ?)",
    ).bind('tr-b1', createdDate).run();
    await env.DB.prepare(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-b1', 'tr-b1', 'B', 'b', 'u-b', 'active', 0, ?)",
    ).bind(createdDate).run();

    // Pending request A->B (survivor=A, merged=B, provider 'zalo', expires in 7 days)
    await env.DB.prepare(
      "INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at) VALUES ('mr-pending', 'u-a', 'u-b', 'zalo', 'z-b', 'pending', ?, ?)",
    ).bind(createdDate, in7Days).run();

    // Expired pending request (past expires_at)
    await env.DB.prepare(
      "INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at) VALUES ('mr-expired', 'u-a', 'u-b', 'zalo', 'z-b', 'pending', ?, ?)",
    ).bind(createdDate, pastDate).run();

    // Declined request
    await env.DB.prepare(
      "INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at) VALUES ('mr-declined', 'u-a', 'u-b', 'zalo', 'z-b', 'declined', ?, ?, ?)",
    ).bind(createdDate, in7Days, createdDate).run();

    // As B: incoming has exactly 1 item, survivor {name:'A', avatarUrl:null, email:'a@x.com', providers:['google']}, groups {survivor:2, merged:1}, released [], provider 'zalo'
    const bRes = await call('/api/me', { headers: { Cookie: `sid=${sidB}` } });
    expect(bRes.status).toBe(200);
    const bBody = await json<MeResponse>(bRes);
    expect(bBody.mergeRequests.incoming).toHaveLength(1);
    expect(bBody.mergeRequests.incoming[0]).toEqual({
      id: 'mr-pending',
      provider: 'zalo',
      expiresAt: in7Days,
      survivor: {
        name: 'A',
        avatarUrl: null,
        email: 'a@x.com',
        providers: ['google'],
      },
      groups: {
        survivor: 2,
        merged: 1,
      },
      released: [],
    });
    expect(bBody.mergeRequests.outgoing).toEqual([]);

    // As A: outgoing lists the pending and the declined one (2 items, statuses pending/declined) and the expired one is absent; incoming is []
    const aRes = await call('/api/me', { headers: { Cookie: `sid=${sidA}` } });
    expect(aRes.status).toBe(200);
    const aBody = await json<MeResponse>(aRes);
    expect(aBody.mergeRequests.incoming).toEqual([]);
    expect(aBody.mergeRequests.outgoing).toHaveLength(2);
    expect(aBody.mergeRequests.outgoing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mr-pending', status: 'pending', provider: 'zalo', expiresAt: in7Days }),
        expect.objectContaining({ id: 'mr-declined', status: 'declined', provider: 'zalo', expiresAt: in7Days }),
      ]),
    );
    expect(aBody.mergeRequests.outgoing.find((r) => r.id === 'mr-expired')).toBeUndefined();
  });

  it('released lists the identity B would lose', async () => {
    const now = Date.now();
    const in7Days = new Date(now + 7 * 86_400_000).toISOString();
    const createdDate = new Date(now).toISOString();

    // A has google g1 only (email a@x.com)
    await env.DB.prepare(
      "INSERT INTO users (id, google_sub, zalo_sub, email, name, consent_at, created_at) VALUES ('u-a-rel', 'g1', NULL, 'a@x.com', 'A Rel', '2026-10-12T00:00:00.000Z', ?)",
    ).bind(createdDate).run();

    // B has zalo z1 and google g2 (email b@x.com)
    const sidB = await memberSid('u-b-rel', 'B Rel');
    await env.DB.prepare(
      "UPDATE users SET google_sub = 'g2', zalo_sub = 'z1', email = 'b@x.com' WHERE id = 'u-b-rel'",
    ).run();

    // Request provider 'zalo' A->B, pending
    await env.DB.prepare(
      "INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at) VALUES ('mr-rel-1', 'u-a-rel', 'u-b-rel', 'zalo', 'z1', 'pending', ?, ?)",
    ).bind(createdDate, in7Days).run();

    const res = await call('/api/me', { headers: { Cookie: `sid=${sidB}` } });
    expect(res.status).toBe(200);
    const body = await json<MeResponse>(res);
    expect(body.mergeRequests.incoming[0]?.released).toEqual([{ provider: 'google', email: 'b@x.com' }]);
  });

  it('membership approvals carry a null email for Zalo users', async () => {
    await seedTrip();
    const sidMinh = await memberSid(U.minh, 'Minh');

    // Create a Zalo-only user Z
    const userZId = 'u-zalo-user';
    await env.DB.prepare(
      "INSERT INTO users (id, google_sub, zalo_sub, email, name, consent_at, created_at) VALUES (?, NULL, 'z-user-z', NULL, 'Zalo User', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
    ).bind(userZId).run();

    // Insert a membership_requests row for guest PID.A (PID.A exists unlinked from seedTrip)
    await env.DB.prepare(
      "INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES ('mrq-zalo-1', ?, ?, ?, 'pending', '2026-10-12T00:00:00.000Z')",
    ).bind(T.tripId, PID.A, userZId).run();

    // Admin trip view with approvals fetched as Minh
    const res = await call(`/api/trips/${T.tripId}`, { headers: { Cookie: `sid=${sidMinh}` } });
    expect(res.status).toBe(200);
    const view = await json<TripView>(res);

    const approval = view.approvals.find((a) => a.kind === 'membership');
    expect(approval).toBeDefined();
    expect(approval).toMatchObject({
      kind: 'membership',
      requestId: 'mrq-zalo-1',
      participantId: PID.A,
      userName: 'Zalo User',
      userEmail: null,
    });
  });
});
