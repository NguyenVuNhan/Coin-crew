import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpensePayView, PickerView, TripView } from '@fsl/core';
import {
  call,
  json,
  seedTrip,
  seedMinhBank,
  newDevice,
  pickAs,
  linkMember,
  memberSid,
  T,
  U,
  PID,
} from './helpers';
import { getDb } from '../src/db/client';
import { requestClaim, upsertIdentity } from '../src/auth/identity';
import { getClaimGrant } from '../src/expenses/claimGrant';
import { sha256Hex } from '../src/lib/ids';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

async function createZaloUser(sub: string, name: string, sid: string): Promise<string> {
  const userId = await upsertIdentity(getDb(env), 'zalo', {
    sub,
    name,
    avatarUrl: null,
  });
  await addSession(sid, userId);
  return userId;
}

async function seedClaimExpenses(): Promise<void> {
  // e-an-paid: paid by guest An (PID.A), shared equally by Minh (PID.M) and An (PID.A) -> 50,000 each
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-an-paid', 'e-an-paid', NULL, 1, ?, 'expense', 'Cà phê sáng', 100000, 'VND', '2026-10-12', ?, 'equal', 'approved', ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
    T.tripId,
    PID.A,
    PID.M,
  );
  await run(
    "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-an-paid', ?, 1, 50000), ('e-an-paid', ?, 1, 50000)",
    PID.M,
    PID.A,
  );

  // e-minh-paid: paid by Minh (PID.M), shared by Minh and Bình (PID.B) so Minh's pairwise debt to An is untouched
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-minh-paid', 'e-minh-paid', NULL, 1, ?, 'expense', 'Bữa trưa', 100000, 'VND', '2026-10-12', ?, 'equal', 'approved', ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
    T.tripId,
    PID.M,
    PID.M,
  );
  await run(
    "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-minh-paid', ?, 1, 50000), ('e-minh-paid', ?, 1, 50000)",
    PID.M,
    PID.B,
  );

  // e-no-minh: paid by An (PID.A), shared only by An and Bình (PID.B) -> Minh has 0 share
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-no-minh', 'e-no-minh', NULL, 1, ?, 'expense', 'Gửi xe', 60000, 'VND', '2026-10-12', ?, 'equal', 'approved', ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
    T.tripId,
    PID.A,
    PID.M,
  );
  await run(
    "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-no-minh', ?, 1, 30000), ('e-no-minh', ?, 1, 30000)",
    PID.A,
    PID.B,
  );

  await run('UPDATE trips SET version = version + 1 WHERE id = ?', T.tripId);
}

beforeEach(async () => {
  await seedTrip();
  await seedMinhBank();
  await seedClaimExpenses();
});

describe('expense pay view and report with a pending Zalo claim', () => {
  it("Zalo user with a pending claim on Minh gets viewer 'claim' and Minh's row on an expense Minh shares", async () => {
    const zaloUserId = await createZaloUser('z-claim-view-1', 'Minh Zalo', 'sid-zalo-view-1');
    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    expect(outcome.result).toBe('requested');
    if (outcome.result !== 'requested') throw new Error('expected requested');

    const grant = await getClaimGrant(getDb(env), zaloUserId, T.tripId);
    expect(grant).toEqual({
      requestId: outcome.requestId,
      participantId: PID.M,
    });
    expect(await getClaimGrant(getDb(env), null, T.tripId)).toBeNull();
    expect(await getClaimGrant(getDb(env), zaloUserId, 'other-trip')).toBeNull();

    const dev = await newDevice();
    const headers = { Cookie: `${dev.cookie}; sid=sid-zalo-view-1`, 'X-Link-Token': T.groupToken };

    const view = await json<ExpensePayView>(call(`${base}/expenses/e-an-paid/pay`, { headers }));
    expect(view.viewer).toBe('claim');
    expect(view.payer).toEqual({ id: PID.A, name: 'An' });
    expect(view.row).toEqual({
      participantId: PID.M,
      name: 'Minh',
      isMember: true,
      slots: 1,
      share: 50000,
      remaining: 50000,
      tiles: [],
    });
    expect(view.claim?.name).toBe('Minh');
    expect(typeof view.claim?.expiresAt).toBe('string');
  });

  it('self and friend grants take precedence over a pending claim grant', async () => {
    // Make Bình a member with 2 slots on a sport expense paid by An so friend grant can be acquired for Bình
    await linkMember(PID.B, 'u-binh', 'Bình');
    const metaJson = JSON.stringify({
      sport: {
        court: 100000,
        shuttlecocks: [],
        extra: 0,
        rule: { mode: 'equal' },
        entries: [
          { participantId: PID.A, maleSlots: 1, femaleSlots: 0 },
          { participantId: PID.M, maleSlots: 1, femaleSlots: 0 },
          { participantId: PID.B, maleSlots: 2, femaleSlots: 0 },
        ],
        maleSlotRate: 25000,
        femaleSlotRate: 25000,
      },
    });
    await run(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES ('e-all', 'e-all', NULL, 1, ?, 'expense', 'Sân tối', 100000, 'VND', '2026-10-12', ?, 'amounts', 'approved', ?, ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
      T.tripId,
      PID.A,
      PID.M,
      metaJson,
    );
    await run(
      "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-all', ?, 25000, 25000), ('e-all', ?, 25000, 25000), ('e-all', ?, 50000, 50000)",
      PID.A,
      PID.M,
      PID.B,
    );
    await run('UPDATE trips SET version = version + 1 WHERE id = ?', T.tripId);

    const zaloUserId = await createZaloUser('z-claim-prec', 'Minh Zalo', 'sid-zalo-prec');
    await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });

    // Friend grant on PID.B wins over claim grant on PID.M
    const devFriend = await newDevice();
    const friendHeaders = {
      Cookie: `${devFriend.cookie}; sid=sid-zalo-prec`,
      'X-Link-Token': T.groupToken,
    };
    expect(
      (await post('/expenses/e-all/friend', friendHeaders, { participantId: PID.B })).status,
    ).toBe(204);
    const friendView = await json<ExpensePayView>(
      call(`${base}/expenses/e-all/pay`, { headers: friendHeaders }),
    );
    expect(friendView.viewer).toBe('friend');
    expect(friendView.row.participantId).toBe(PID.B);

    // Self pick on guest PID.C (when C shares) wins over claim grant on PID.M
    await run(
      "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-an-paid', ?, 1, 25000)",
      PID.C,
    );
    await run('UPDATE trips SET version = version + 1 WHERE id = ?', T.tripId);

    const devSelf = await newDevice();
    await pickAs(devSelf.deviceId, PID.C);
    const selfHeaders = {
      Cookie: `${devSelf.cookie}; sid=sid-zalo-prec`,
      'X-Link-Token': T.groupToken,
    };
    const selfView = await json<ExpensePayView>(
      call(`${base}/expenses/e-an-paid/pay`, { headers: selfHeaders }),
    );
    expect(selfView.viewer).toBe('self');
    expect(selfView.row.participantId).toBe(PID.C);
  });

  it("returns row: null with the waiting claim on an expense Minh doesn't share or where Minh is the payer", async () => {
    const zaloUserId = await createZaloUser('z-claim-null', 'Minh Zalo', 'sid-zalo-null');
    await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });

    const dev = await newDevice();
    const headers = { Cookie: `${dev.cookie}; sid=sid-zalo-null`, 'X-Link-Token': T.groupToken };

    const unshared = await json<{ row: null }>(
      call(`${base}/expenses/e-no-minh/pay`, { headers }),
    );
    expect(unshared).toEqual({ row: null, claim: { name: 'Minh', expiresAt: expect.any(String) } });

    const asPayer = await json<{ row: null }>(
      call(`${base}/expenses/e-minh-paid/pay`, { headers }),
    );
    expect(asPayer).toEqual({ row: null, claim: { name: 'Minh', expiresAt: expect.any(String) } });
  });

  it('pay-report creates says_paid with claimRequestId set even when the receiver is a guest, and forces paidBy to self', async () => {
    const zaloUserId = await createZaloUser('z-claim-report', 'Minh Zalo', 'sid-zalo-report');
    const outcome = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (outcome.result !== 'requested') throw new Error('expected requested');

    const dev = await newDevice();
    const headers = { Cookie: `${dev.cookie}; sid=sid-zalo-report`, 'X-Link-Token': T.groupToken };

    // Receiver PID.A is a guest (where normal member-to-guest rule would be 'confirmed'), and caller sends paidBy: 'friend'
    const res = await post('/expenses/e-an-paid/pay-report', headers, {
      amount: 50000,
      paidBy: 'friend',
    });
    expect(res.status).toBe(201);
    const body = await json<{ paymentId: string; status: string }>(res);
    expect(body.status).toBe('says_paid');

    const tx = await env.DB.prepare(
      'SELECT payer_id, to_id, amount, amount_confirmed, status, created_by_participant_id, confirmed_by_participant_id, meta_json, claim_request_id FROM transactions WHERE id = ?',
    )
      .bind(body.paymentId)
      .first<{
        payer_id: string;
        to_id: string;
        amount: number;
        amount_confirmed: number | null;
        status: string;
        created_by_participant_id: string;
        confirmed_by_participant_id: string | null;
        meta_json: string;
        claim_request_id: string | null;
      }>();

    expect(tx).toEqual({
      payer_id: PID.M,
      to_id: PID.A,
      amount: 50000,
      amount_confirmed: null,
      status: 'says_paid',
      created_by_participant_id: PID.M,
      confirmed_by_participant_id: null,
      meta_json: JSON.stringify({ expenseId: 'e-an-paid', paidBy: 'self' }),
      claim_request_id: outcome.requestId,
    });

    const act = await env.DB.prepare(
      "SELECT actor_participant_id, actor_user_id FROM activity WHERE trip_id = ? AND action = 'payment_recorded'",
    )
      .bind(T.tripId)
      .first<{ actor_participant_id: string | null; actor_user_id: string | null }>();
    expect(act).toEqual({
      actor_participant_id: null,
      actor_user_id: zaloUserId,
    });

    const view = await json<ExpensePayView>(call(`${base}/expenses/e-an-paid/pay`, { headers }));
    expect(view.row.remaining).toBe(0);
    expect(view.paid).toEqual([
      {
        paymentId: body.paymentId,
        amount: 50000,
        status: 'says_paid',
        paidBy: 'self',
        notArrived: false,
        claimPending: true,
      },
    ]);
  });

  it('after decline or expiry, the pay view returns row: null, and the earlier payment shows claimPending: true in GET /trips/:id', async () => {
    const minhSid = await memberSid(U.minh, 'Minh');
    const zaloUserId = await createZaloUser('z-claim-dec', 'Minh Zalo', 'sid-zalo-dec');
    const first = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (first.result !== 'requested') throw new Error('expected requested');

    const dev = await newDevice();
    const headers = { Cookie: `${dev.cookie}; sid=sid-zalo-dec`, 'X-Link-Token': T.groupToken };

    const payRes1 = await post('/expenses/e-an-paid/pay-report', headers, {
      amount: 20000,
    });
    expect(payRes1.status).toBe(201);
    const { paymentId: pid1 } = await json<{ paymentId: string }>(payRes1);

    // Decline the claim as Minh
    const decRes = await call(`/api/me/merge-requests/${first.requestId}/decline`, {
      method: 'POST',
      headers: { Cookie: `sid=${minhSid}` },
    });
    expect(decRes.status).toBe(204);

    // Pay view returns row: null after decline
    const viewAfterDecline = await json<{ row: null }>(
      call(`${base}/expenses/e-an-paid/pay`, { headers }),
    );
    expect(viewAfterDecline).toEqual({ row: null });
    expect((await post('/expenses/e-an-paid/pay-report', headers, { amount: 10000 })).status).toBe(
      403,
    );

    // Earlier payment shows claimPending: true in GET /trips/:id
    const tripAfterDecline = await json<TripView>(call(base, { headers }));
    const p1 = tripAfterDecline.payments.find((p) => p.id === pid1);
    expect(p1?.claimPending).toBe(true);

    // Start a second claim, pay part, then expire it
    const second = await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    if (second.result !== 'requested') throw new Error('expected requested');

    const payRes2 = await post('/expenses/e-an-paid/pay-report', headers, {
      amount: 15000,
    });
    expect(payRes2.status).toBe(201);
    const { paymentId: pid2 } = await json<{ paymentId: string }>(payRes2);

    await run(
      "UPDATE account_merge_requests SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?",
      second.requestId,
    );

    const viewAfterExpiry = await json<{ row: null }>(
      call(`${base}/expenses/e-an-paid/pay`, { headers }),
    );
    expect(viewAfterExpiry).toEqual({ row: null });

    const tripAfterExpiry = await json<TripView>(call(base, { headers }));
    const p2 = tripAfterExpiry.payments.find((p) => p.id === pid2);
    expect(p2?.claimPending).toBe(true);
  });

  it('other trip routes and people routes see the session as a non-member, not Minh', async () => {
    await run(
      "INSERT INTO bank_details (id, participant_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-an', ?, '970407', '19039999888877', 'NGUYEN VAN AN', 'approved', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
      PID.A,
    );
    await run('UPDATE trips SET version = version + 1 WHERE id = ?', T.tripId);

    const zaloUserId = await createZaloUser('z-claim-nonmem', 'Minh Zalo', 'sid-zalo-nonmem');
    await requestClaim(getDb(env), zaloUserId, {
      tripId: T.tripId,
      participantId: PID.M,
    });

    const dev = await newDevice();
    const sessionOnly = { Cookie: `${dev.cookie}; sid=sid-zalo-nonmem` };
    const withViewToken = { ...sessionOnly, 'X-Link-Token': T.viewToken };
    const withGroupToken = { ...sessionOnly, 'X-Link-Token': T.groupToken };

    // Without a link token, trip routes reject the session with 403 (not recognised as member Minh)
    expect((await call(base, { headers: sessionOnly })).status).toBe(403);
    expect((await call(`${base}/people/picker`, { headers: sessionOnly })).status).toBe(403);

    // With viewToken, GET /trips/:id treats the caller as a viewer, and /people/picker is forbidden
    const viewerTrip = await json<TripView>(call(base, { headers: withViewToken }));
    expect(viewerTrip.me).toEqual({
      kind: 'viewer',
      participantId: null,
      participantPending: false,
      isOrganiser: false,
      isAdmin: false,
    });
    expect(viewerTrip.links).toBeNull();
    expect(viewerTrip.approvals).toEqual([]);
    expect(viewerTrip.people.find((p) => p.id === PID.A)?.bankAccount).toBeUndefined();
    expect((await call(`${base}/people/picker`, { headers: withViewToken })).status).toBe(403);

    // With groupToken, GET /trips/:id and GET /trips/:id/people/picker treat the caller as an unpicked non-member
    const guestTrip = await json<TripView>(call(base, { headers: withGroupToken }));
    expect(guestTrip.me).toEqual({
      kind: 'guest',
      participantId: null,
      participantPending: false,
      isOrganiser: false,
      isAdmin: false,
    });
    expect(guestTrip.links).toBeNull();
    expect(guestTrip.approvals).toEqual([]);
    expect(guestTrip.people.find((p) => p.id === PID.A)?.bankAccount).toBeUndefined();

    const picker = await json<PickerView>(call(`${base}/people/picker`, { headers: withGroupToken }));
    expect(picker.myPick).toBeNull();
    expect(picker.account).toEqual({ name: 'Minh Zalo', needsGender: false });
  });
});
