import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse, TripListItem, WalletDetailView } from '@cc/core';
import { sha256Hex } from '@cc/api-util/ids';
import { app, call, json, memberSid, seedUser } from './helpers';

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

async function enablePersonalAndWallet(sid: string, userId: string, startAmount = 1_000_000): Promise<void> {
  await run(
    "INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, 1, '2026-11-01T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET enabled = 1",
    userId,
  );
  const res = await call('/api/me/personal/wallets', {
    method: 'POST',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Cash VND',
      currency: 'VND',
      startAmount,
      startDate: '2026-10-01',
    }),
  });
  expect(res.status).toBe(201);
}

async function fetchCachedViews(sid: string): Promise<{
  trips: TripListItem[];
  summary: PeopleSummaryResponse;
  wallets: { wallets: WalletDetailView[] };
}> {
  const [tripsRes, summaryRes, walletsRes] = await Promise.all([
    call('/api/trips', { headers: { Cookie: `sid=${sid}` } }),
    call('/api/me/people/summary', { headers: { Cookie: `sid=${sid}` } }),
    call('/api/me/personal/wallets', { headers: { Cookie: `sid=${sid}` } }),
  ]);
  expect(tripsRes.status).toBe(200);
  expect(summaryRes.status).toBe(200);
  expect(walletsRes.status).toBe(200);

  const [trips, summary, wallets] = await Promise.all([
    json<TripListItem[]>(tripsRes),
    json<PeopleSummaryResponse>(summaryRes),
    json<{ wallets: WalletDetailView[] }>(walletsRes),
  ]);
  expect(summary.incomplete).toBe(false);
  return { trips, summary, wallets };
}

async function clearBalanceCaches(): Promise<void> {
  await run('DELETE FROM trip_balance_cache');
  await run('DELETE FROM personal_trip_cache');
  await run('DELETE FROM personal_wallet_balances');
}

async function expectMatchesUncachedReplay(sid: string): Promise<{
  trips: TripListItem[];
  summary: PeopleSummaryResponse;
  wallets: { wallets: WalletDetailView[] };
}> {
  const cached = await fetchCachedViews(sid);
  await clearBalanceCaches();
  const uncached = await fetchCachedViews(sid);

  expect(cached.trips).toEqual(uncached.trips);
  expect(cached.summary).toEqual(uncached.summary);
  expect(cached.wallets).toEqual(uncached.wallets);
  return cached;
}

async function addTrip(
  id: string,
  name: string,
  organiserUserId: string,
  preset: 'trip' | 'direct' = 'trip',
): Promise<void> {
  await run(
    'INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?, 0, ?)',
    id,
    name,
    preset,
    'VND',
    organiserUserId,
    `gt-${id}`,
    `vt-${id}`,
    CREATED,
  );
}

async function addParticipant(
  id: string,
  tripId: string,
  name: string,
  userId: string | null,
  sortOrder: number,
  isAdmin = 0,
): Promise<void> {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
    id,
    tripId,
    name,
    name.toLowerCase(),
    userId,
    isAdmin,
    sortOrder,
    CREATED,
  );
}

let txCounter = 0;
async function addExpense(
  tripId: string,
  payerId: string,
  shares: [string, number][],
): Promise<string> {
  const id = `tx-exp-${++txCounter}`;
  const amount = shares.reduce((s, [, a]) => s + a, 0);
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'Expense', ?, 'VND', '2026-10-12', ?, 'exact', 'approved', ?, ?, ?)",
    id,
    id,
    tripId,
    amount,
    payerId,
    payerId,
    CREATED,
    CREATED,
  );
  for (const [pid, share] of shares) {
    await run(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
      id,
      pid,
      share,
      share,
    );
  }
  return id;
}

async function addPayment(
  tripId: string,
  fromId: string,
  toId: string,
  amount: number,
  status: 'confirmed' | 'says_paid',
): Promise<string> {
  const id = `tx-pay-${++txCounter}`;
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed, currency, spent_on, payer_id, to_id, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'payment', '', ?, ?, 'VND', '2026-10-12', ?, ?, ?, ?, ?, ?)",
    id,
    id,
    tripId,
    amount,
    status === 'confirmed' ? amount : null,
    fromId,
    toId,
    status,
    fromId,
    CREATED,
    CREATED,
  );
  return id;
}

describe('balance cache invalidation on merges, remove, and leave', () => {
  it('account merge deletes orphaned trip_balance_cache for folded ledger and survivor personal_trip_cache, matching uncached replay', async () => {
    await run(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'u-a',
      'g-a',
      null,
      'a@example.com',
      'Anh',
      CREATED,
      CREATED,
    );
    await run(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      'u-b',
      null,
      'z-b',
      null,
      'Chi',
      CREATED,
      CREATED,
    );
    await seedUser('u-c', 'Cuong');

    const sidA = 'sid-merge-a';
    const sidB = 'sid-merge-b';
    await addSession(sidA, 'u-a');
    await addSession(sidB, 'u-b');
    await enablePersonalAndWallet(sidA, 'u-a', 2_000_000);
    await enablePersonalAndWallet(sidB, 'u-b', 1_500_000);

    // Personal ledgers for A and B (A is also a contact in B's ledger so A caches l-b before fold)
    await addTrip('l-a', 'Personal A', 'u-a', 'direct');
    await addParticipant('la-a', 'l-a', 'Anh', 'u-a', 0, 1);
    await addParticipant('la-guest', 'l-a', 'Khach A', null, 1);
    await addExpense('l-a', 'la-a', [['la-a', 100_000], ['la-guest', 100_000]]);

    await addTrip('l-b', 'Personal B', 'u-b', 'direct');
    await addParticipant('lb-b', 'l-b', 'Chi', 'u-b', 0, 1);
    await addParticipant('lb-a', 'l-b', 'Anh', 'u-a', 1);
    await addParticipant('lb-dao', 'l-b', 'Dao', null, 2);
    await addExpense('l-b', 'lb-b', [['lb-b', 80_000], ['lb-dao', 120_000]]);
    await addExpense('l-b', 'lb-b', [['lb-b', 50_000], ['lb-a', 50_000]]);

    // Shared group with both A and B, plus a group only B was in
    await addTrip('t-shared', 'Shared Trip', 'u-a', 'trip');
    await addParticipant('ps-a', 't-shared', 'Anh', 'u-a', 0, 1);
    await addParticipant('ps-b', 't-shared', 'Chi', 'u-b', 1, 1);
    await addParticipant('ps-c', 't-shared', 'Cuong', 'u-c', 2);
    await addExpense('t-shared', 'ps-a', [['ps-a', 100_000], ['ps-b', 100_000], ['ps-c', 100_000]]);
    await addExpense('t-shared', 'ps-b', [['ps-a', 60_000], ['ps-c', 60_000]]);

    await addTrip('t-b-only', 'B Only Trip', 'u-b', 'trip');
    await addParticipant('pb-b', 't-b-only', 'Chi', 'u-b', 0, 1);
    await addParticipant('pb-c', 't-b-only', 'Cuong', 'u-c', 1);
    await addExpense('t-b-only', 'pb-b', [['pb-b', 90_000], ['pb-c', 90_000]]);

    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await run(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)',
      'mr-cache-1',
      'u-a',
      'u-b',
      'zalo',
      'z-b',
      'pending',
      CREATED,
      expiresAt,
    );

    // Warm trip_balance_cache and personal_trip_cache for both accounts
    await fetchCachedViews(sidA);
    await fetchCachedViews(sidB);

    expect(
      await row<{ trip_id: string }>('SELECT trip_id FROM trip_balance_cache WHERE trip_id = ?', 'l-b'),
    ).not.toBeNull();
    expect(
      await row<{ trip_id: string }>(
        'SELECT trip_id FROM personal_trip_cache WHERE user_id = ? AND trip_id = ?',
        'u-a',
        'l-b',
      ),
    ).not.toBeNull();

    const acceptRes = await call('/api/me/merge-requests/mr-cache-1/accept', {
      method: 'POST',
      headers: { Cookie: `sid=${sidB}` },
    });
    expect(acceptRes.status).toBe(200);

    // Folded ledger l-b must have no orphaned trip_balance_cache row, and u-a must have no orphaned personal_trip_cache for l-b
    expect(
      await row<{ trip_id: string }>('SELECT trip_id FROM trip_balance_cache WHERE trip_id = ?', 'l-b'),
    ).toBeNull();
    expect(
      await row<{ trip_id: string }>(
        'SELECT trip_id FROM personal_trip_cache WHERE user_id = ? AND trip_id = ?',
        'u-a',
        'l-b',
      ),
    ).toBeNull();
    expect(
      (await row<{ n: number }>('SELECT COUNT(*) AS n FROM personal_trip_cache WHERE user_id = ?', 'u-b'))!.n,
    ).toBe(0);

    const survivorViews = await expectMatchesUncachedReplay(sidA);
    expect(survivorViews.trips.map((t) => t.id).sort()).toEqual(['t-b-only', 't-shared']);
  });

  it('participant merge bumps trips.version and next reads match uncached replay', async () => {
    const sidA = await memberSid('u-pm-a', 'Anh');
    const sidB = await memberSid('u-pm-b', 'Binh');
    await enablePersonalAndWallet(sidA, 'u-pm-a', 1_000_000);
    await enablePersonalAndWallet(sidB, 'u-pm-b', 1_000_000);

    await addTrip('t-pm', 'Merge Trip', 'u-pm-a');
    await addParticipant('pm-a', 't-pm', 'Anh', 'u-pm-a', 0, 1);
    await addParticipant('pm-b', 't-pm', 'Binh', 'u-pm-b', 1);
    await addParticipant('pm-guest', 't-pm', 'Anh (old)', null, 2);

    await addExpense('t-pm', 'pm-guest', [['pm-guest', 100_000], ['pm-b', 100_000]]);
    await addExpense('t-pm', 'pm-b', [['pm-a', 40_000], ['pm-guest', 40_000], ['pm-b', 40_000]]);

    // Warm caches before merge
    await fetchCachedViews(sidA);
    await fetchCachedViews(sidB);
    const vBefore = (await row<{ version: number }>('SELECT version FROM trips WHERE id = ?', 't-pm'))!.version;

    const mergeRes = await call('/api/trips/t-pm/people/merge', {
      method: 'POST',
      headers: { Cookie: `sid=${sidA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromId: 'pm-guest', intoId: 'pm-a' }),
    });
    expect(mergeRes.status).toBe(204);

    const vAfter = (await row<{ version: number }>('SELECT version FROM trips WHERE id = ?', 't-pm'))!.version;
    expect(vAfter).toBeGreaterThan(vBefore);

    await expectMatchesUncachedReplay(sidA);
    await expectMatchesUncachedReplay(sidB);
  });

  it('participant remove bumps trips.version and next reads match uncached replay', async () => {
    const sidA = await memberSid('u-pr-a', 'Anh');
    const sidB = await memberSid('u-pr-b', 'Binh');
    await enablePersonalAndWallet(sidA, 'u-pr-a', 1_000_000);
    await enablePersonalAndWallet(sidB, 'u-pr-b', 1_000_000);

    await addTrip('t-pr', 'Remove Trip', 'u-pr-a');
    await addParticipant('pr-a', 't-pr', 'Anh', 'u-pr-a', 0, 1);
    await addParticipant('pr-b', 't-pr', 'Binh', 'u-pr-b', 1);
    await addExpense('t-pr', 'pr-b', [['pr-a', 150_000], ['pr-b', 150_000]]);
    // Auto-confirmed when pr-b is removed, changing balances
    await addPayment('t-pr', 'pr-a', 'pr-b', 150_000, 'says_paid');

    await fetchCachedViews(sidA);
    await fetchCachedViews(sidB);
    const vBefore = (await row<{ version: number }>('SELECT version FROM trips WHERE id = ?', 't-pr'))!.version;

    const removeRes = await call('/api/trips/t-pr/people/pr-b', {
      method: 'DELETE',
      headers: { Cookie: `sid=${sidA}` },
    });
    expect(removeRes.status).toBe(204);

    const vAfter = (await row<{ version: number }>('SELECT version FROM trips WHERE id = ?', 't-pr'))!.version;
    expect(vAfter).toBeGreaterThan(vBefore);

    await expectMatchesUncachedReplay(sidA);
    const removedViews = await expectMatchesUncachedReplay(sidB);
    expect(removedViews.trips).toEqual([]);
  });

  it('participant leave bumps trips.version and next reads match uncached replay', async () => {
    const sidA = await memberSid('u-pl-a', 'Anh');
    const sidB = await memberSid('u-pl-b', 'Binh');
    await enablePersonalAndWallet(sidA, 'u-pl-a', 1_000_000);
    await enablePersonalAndWallet(sidB, 'u-pl-b', 1_000_000);

    await addTrip('t-pl', 'Leave Trip', 'u-pl-a');
    await addParticipant('pl-a', 't-pl', 'Anh', 'u-pl-a', 0, 1);
    await addParticipant('pl-b', 't-pl', 'Binh', 'u-pl-b', 1);
    await addExpense('t-pl', 'pl-b', [['pl-a', 200_000], ['pl-b', 200_000]]);
    // Auto-confirmed when pl-b leaves, changing balances
    await addPayment('t-pl', 'pl-a', 'pl-b', 200_000, 'says_paid');

    await fetchCachedViews(sidA);
    await fetchCachedViews(sidB);
    const vBefore = (await row<{ version: number }>('SELECT version FROM trips WHERE id = ?', 't-pl'))!.version;

    const leaveRes = await call('/api/trips/t-pl/leave', {
      method: 'POST',
      headers: { Cookie: `sid=${sidB}` },
    });
    expect(leaveRes.status).toBe(204);

    const vAfter = (await row<{ version: number }>('SELECT version FROM trips WHERE id = ?', 't-pl'))!.version;
    expect(vAfter).toBeGreaterThan(vBefore);

    await expectMatchesUncachedReplay(sidA);
    const leftViews = await expectMatchesUncachedReplay(sidB);
    expect(leftViews.trips).toEqual([]);
  });
});
