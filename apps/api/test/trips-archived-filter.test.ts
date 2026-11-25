import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse, TripListItem, WalletDetailView } from '@cc/core';
import { app, call, json, memberSid, seedUser } from './helpers';

const ME = 'u-arch-me';
const FRIEND = 'u-arch-friend';
const CREATED = '2026-10-15T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(
  id: string,
  name: string,
  createdAt: string,
  archivedAt: string | null = null,
) {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, archived_at, created_at) VALUES (?, ?, 'trip', 'VND', 1, 0, ?, ?, ?, 0, ?, ?)",
    id,
    name,
    ME,
    `gt-${id}`,
    `vt-${id}`,
    archivedAt,
    createdAt,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sortOrder: number) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    id,
    tripId,
    name,
    name.toLowerCase(),
    userId,
    sortOrder,
    CREATED,
  );
}

let txSeq = 0;
async function addExpense(tripId: string, payerId: string, shares: [string, number][]) {
  const id = `${tripId}-e${txSeq++}`;
  const amount = shares.reduce((sum, [, a]) => sum + a, 0);
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'Expense', ?, 'VND', '2026-10-15', ?, 'exact', 'approved', ?, ?, ?)",
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
}

describe('GET /api/trips?archived filter', () => {
  it('filters active vs archived groups, sets X-Archived-Count, rejects invalid values, and keeps personal wallets & people summary complete', async () => {
    await seedUser(FRIEND, 'Friend');
    const sid = await memberSid(ME, 'Me');

    // Enable personal book and create a default VND wallet with 1,000,000₫ starting balance.
    await run(
      "INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, 1, '2026-10-15T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET enabled = 1",
      ME,
    );
    const walletRes = await call('/api/me/personal/wallets', {
      method: 'POST',
      headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cash',
        currency: 'VND',
        startAmount: 1_000_000,
        startDate: '2026-10-01',
      }),
    });
    expect(walletRes.status).toBe(201);

    // 2 active groups
    await addTrip('t-act-1', 'Active 1', '2026-10-18T00:00:00.000Z', null);
    await addPerson('t-act-1', 'pa1-me', 'Me', ME, 0);
    await addPerson('t-act-1', 'pa1-fr', 'Friend', FRIEND, 1);
    await addExpense('t-act-1', 'pa1-me', [
      ['pa1-me', 50_000],
      ['pa1-fr', 50_000],
    ]);

    await addTrip('t-act-2', 'Active 2', '2026-10-17T00:00:00.000Z', null);
    await addPerson('t-act-2', 'pa2-me', 'Me', ME, 0);
    await addPerson('t-act-2', 'pa2-fr', 'Friend', FRIEND, 1);

    // 2 archived groups: one settled, one with unpaid balance (Friend owes Me 200,000₫; Me's share is 100,000₫)
    await addTrip('t-arc-1', 'Archived Settled', '2026-10-16T00:00:00.000Z', '2026-10-19T00:00:00.000Z');
    await addPerson('t-arc-1', 'par1-me', 'Me', ME, 0);
    await addPerson('t-arc-1', 'par1-fr', 'Friend', FRIEND, 1);

    await addTrip('t-arc-2', 'Archived Unpaid', '2026-10-15T00:00:00.000Z', '2026-10-19T00:00:00.000Z');
    await addPerson('t-arc-2', 'par2-me', 'Me', ME, 0);
    await addPerson('t-arc-2', 'par2-fr', 'Friend', FRIEND, 1);
    await addExpense('t-arc-2', 'par2-me', [
      ['par2-me', 100_000],
      ['par2-fr', 200_000],
    ]);

    // 1. ?archived=exclude returns only active groups + X-Archived-Count: 2, without warming cache for archived groups
    const excludeRes = await call('/api/trips?archived=exclude', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(excludeRes.status).toBe(200);
    expect(excludeRes.headers.get('X-Archived-Count')).toBe('2');
    const excludeList = await json<TripListItem[]>(excludeRes);
    expect(excludeList.map((t) => t.id)).toEqual(['t-act-1', 't-act-2']);
    expect(excludeList.every((t) => !t.archived)).toBe(true);

    // Excluded archived groups should not have had trip_balance_cache computed/inserted.
    const archivedCached = await env.DB.prepare(
      "SELECT trip_id FROM trip_balance_cache WHERE trip_id IN ('t-arc-1', 't-arc-2')",
    ).all();
    expect(archivedCached.results).toHaveLength(0);

    // 2. ?archived=only returns only archived groups
    const onlyRes = await call('/api/trips?archived=only', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(onlyRes.status).toBe(200);
    const onlyList = await json<TripListItem[]>(onlyRes);
    expect(onlyList.map((t) => t.id)).toEqual(['t-arc-1', 't-arc-2']);
    expect(onlyList.every((t) => t.archived)).toBe(true);
    expect(onlyList.find((t) => t.id === 't-arc-2')?.myBalance).toBe(200_000);

    // 3. Default GET /api/trips returns all 4 groups
    const allRes = await call('/api/trips', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(allRes.status).toBe(200);
    const allList = await json<TripListItem[]>(allRes);
    expect(allList.map((t) => t.id)).toEqual(['t-act-1', 't-act-2', 't-arc-1', 't-arc-2']);

    // 4. Invalid ?archived values return 422
    const invalidRes = await call('/api/trips?archived=invalid', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(invalidRes.status).toBe(422);
    const invalidBody = await json<{ error: { code: string } }>(invalidRes);
    expect(invalidBody.error.code).toBe('VALIDATION');

    // 5. Personal wallets still include archived group's money
    // Start 1,000,000 - 100,000 (paid in active group) - 300,000 (paid in archived group) = 600,000
    const walletsRes = await call('/api/me/personal/wallets', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(walletsRes.status).toBe(200);
    const walletsBody = await json<{ wallets: WalletDetailView[] }>(walletsRes);
    expect(walletsBody.wallets[0]?.balance).toBe(600_000);

    // 6. People summary still includes archived group's unpaid balance (50,000 + 200,000 = 250,000)
    const summaryRes = await call('/api/me/people/summary', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(summaryRes.status).toBe(200);
    const summary = await json<PeopleSummaryResponse>(summaryRes);
    const friendSummary = summary.people.find((p) => p.userId === FRIEND);
    expect(friendSummary).toBeDefined();
    expect(friendSummary?.total).toBe(250_000);
    expect(friendSummary?.items.some((i) => i.tripId === 't-arc-2' && i.amount === 200_000)).toBe(true);
  });
});
