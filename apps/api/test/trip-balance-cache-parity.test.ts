import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { PeopleSummaryResponse, TripListItem, TripView } from '@cc/core';
import * as schema from '@cc/api-db/schema';
import { upsertTripBalanceCacheBatch } from '../src/trips/balanceCache';
import { app, json, memberSid, seedUser } from './helpers';

const ME = 'u-me';
const FRIEND = 'u-friend';
const THIRD = 'u-third';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(
  id: string,
  createdAt: string,
  opts: { preset?: string; fewest?: number; round?: number } = {},
) {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', ?, ?, ?, ?, ?, 0, ?)",
    id,
    `Group ${id}`,
    opts.preset ?? 'trip',
    opts.fewest ?? 1,
    opts.round ?? 0,
    ME,
    `g-${id}`,
    `v-${id}`,
    createdAt,
  );
}

async function addPerson(tripId: string, id: string, userId: string | null, sort: number, status = 'active') {
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    tripId,
    id,
    id,
    userId,
    status,
    sort,
    '2026-10-01T00:00:00.000Z',
  );
}

let txSeq = 0;
async function addExpense(
  tripId: string,
  payer: string,
  shares: [string, number][],
  opts: { status?: string; meta?: unknown; createdAt?: string } = {},
) {
  const id = `${tripId}-e${txSeq++}`;
  const amount = shares.reduce((s, [, a]) => s + a, 0);
  const at = opts.createdAt ?? `2026-10-10T00:00:${String(txSeq % 60).padStart(2, '0')}.000Z`;
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', ?, 'VND', '2026-10-10', ?, 'exact', ?, ?, ?, ?, ?)",
    id,
    id,
    tripId,
    amount,
    payer,
    opts.status ?? 'approved',
    payer,
    opts.meta ? JSON.stringify(opts.meta) : null,
    at,
    at,
  );
  for (const [p, a] of shares) {
    await run(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
      id,
      p,
      a,
      a,
    );
  }
  return id;
}

async function addPayment(
  tripId: string,
  from: string,
  to: string,
  amount: number,
  status: string,
  opts: { amountConfirmed?: number | null; notArrivedAt?: string | null } = {},
) {
  const id = `${tripId}-p${txSeq++}`;
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed, currency, spent_on, payer_id, to_id, status, created_by_participant_id, not_arrived_at, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'payment', '', ?, ?, 'VND', '2026-10-11', ?, ?, ?, ?, ?, ?, ?)",
    id,
    id,
    tripId,
    amount,
    opts.amountConfirmed ?? null,
    from,
    to,
    status,
    from,
    opts.notArrivedAt ?? null,
    '2026-10-11T00:00:00.000Z',
    '2026-10-11T00:00:00.000Z',
  );
  return id;
}

function countingEnv() {
  const counter = { queries: 0, sql: [] as string[] };
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (q: string) => {
          counter.queries += 1;
          counter.sql.push(q);
          return target.prepare(q);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { env: { ...env, DB }, counter };
}

/** Seed 4 groups covering all expense statuses, payment statuses, roundTransfers & fewestTransfers combinations. */
async function seedParityGroups() {
  await seedUser(ME, 'Me');
  await seedUser(FRIEND, 'Friend');
  await seedUser(THIRD, 'Third');

  const configs: { id: string; createdAt: string; opts: Parameters<typeof addTrip>[2] }[] = [
    { id: 't-fr-off', createdAt: '2026-10-01T00:00:00.000Z', opts: { fewest: 0, round: 0 } },
    { id: 't-fewest', createdAt: '2026-10-02T00:00:00.000Z', opts: { fewest: 1, round: 0 } },
    { id: 't-round', createdAt: '2026-10-03T00:00:00.000Z', opts: { fewest: 0, round: 1 } },
    { id: 't-both', createdAt: '2026-10-04T00:00:00.000Z', opts: { preset: 'sport', fewest: 1, round: 1 } },
  ];

  for (const g of configs) {
    await addTrip(g.id, g.createdAt, g.opts);
    const [m, f, t] = [`${g.id}-m`, `${g.id}-f`, `${g.id}-t`];
    await addPerson(g.id, m, ME, 0);
    await addPerson(g.id, f, FRIEND, 1);
    await addPerson(g.id, t, THIRD, 2);

    // Approved expenses with explicit createdAt to verify oldestOpenAt
    await addExpense(g.id, m, [[m, 123_400], [f, 123_400]], { createdAt: '2026-10-05T01:00:00.000Z' });
    await addExpense(g.id, f, [[m, 40_000], [t, 60_000]], { createdAt: '2026-10-06T02:00:00.000Z' });
    await addExpense(g.id, t, [[m, 25_000], [f, 25_000]], { createdAt: '2026-10-07T03:00:00.000Z' });

    // Non-approved / excluded expenses (must not affect balances or oldestOpenAt)
    await addExpense(g.id, f, [[m, 500_000]], { status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' });
    await addExpense(g.id, f, [[m, 500_000]], { status: 'rejected', createdAt: '2026-10-01T00:00:00.000Z' });
    await addExpense(g.id, f, [[m, 500_000]], { status: 'disabled', createdAt: '2026-10-01T00:00:00.000Z' });
    await addExpense(g.id, m, [[m, 10_000], [f, 10_000]], { meta: { paidFromFund: true } });
    await addExpense(g.id, m, [[m, 10_000], [f, 10_000]], { meta: { planning: true } });

    // Payments: confirmed, says_paid, and notArrived
    await addPayment(g.id, f, m, 20_000, 'confirmed');
    await addPayment(g.id, t, m, 10_000, 'says_paid');
    await addPayment(g.id, f, m, 15_000, 'confirmed', { notArrivedAt: '2026-10-12T00:00:00.000Z' });
  }
}

describe('trip_balance_cache parity and query budget', () => {
  it('GET /trips, GET /trips/:id, and GET /me/people/summary return identical balances, waiting, and oldestOpenAt, including after multi-group settle', async () => {
    await seedParityGroups();
    const sid = await memberSid(ME, 'Me');

    const tripsRes = await Promise.resolve(app.request('/api/trips', { headers: { Cookie: `sid=${sid}` } }, env));
    expect(tripsRes.status).toBe(200);
    const tripsList = await json<TripListItem[]>(tripsRes);

    const summaryRes = await Promise.resolve(app.request('/api/me/people/summary', { headers: { Cookie: `sid=${sid}` } }, env));
    expect(summaryRes.status).toBe(200);
    const summary = await json<PeopleSummaryResponse>(summaryRes);
    expect(summary.incomplete).toBe(false);

    for (const item of tripsList) {
      const snapRes = await Promise.resolve(
        app.request(`/api/trips/${item.id}`, { headers: { Cookie: `sid=${sid}` } }, env),
      );
      expect(snapRes.status).toBe(200);
      const snap = await json<TripView>(snapRes);
      expect(item.myBalance).toBe(snap.myBalance?.now ?? 0);

      // Compare summary items for FRIEND and THIRD against snapshot suggestions & oldest approved shared expense
      for (const [userId, otherPid, expectedOldest] of [
        [FRIEND, `${item.id}-f`, '2026-10-05T01:00:00.000Z'],
        [THIRD, `${item.id}-t`, '2026-10-06T02:00:00.000Z'],
      ] as const) {
        const person = summary.people.find((p) => p.key === `u:${userId}`);
        const summaryItem = person?.items.find((i) => i.tripId === item.id);
        const myPid = `${item.id}-m`;
        const expectedAmount = snap.suggestions.reduce((acc, s) => {
          if (s.fromId === otherPid && s.toId === myPid) return acc + s.amount;
          if (s.fromId === myPid && s.toId === otherPid) return acc - s.amount;
          return acc;
        }, 0);
        if (expectedAmount === 0) {
          expect(summaryItem).toBeUndefined();
        } else {
          expect(summaryItem?.amount).toBe(expectedAmount);
          expect(summaryItem?.oldestOpenAt).toBe(expectedOldest);
        }
      }
    }

    // Multi-group POST /me/people/:key/settle
    const friendBefore = summary.people.find((p) => p.key === `u:${FRIEND}`)!;
    const settleAmount = Math.min(50_000, Math.abs(friendBefore.total));
    const settleRes = await Promise.resolve(
      app.request(
        `/api/me/people/u:${FRIEND}/settle`,
        {
          method: 'POST',
          headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paid: settleAmount,
            direction: friendBefore.total >= 0 ? 'toOwner' : 'fromOwner',
          }),
        },
        env,
      ),
    );
    expect(settleRes.status).toBe(201);

    const tripsAfterRes = await Promise.resolve(app.request('/api/trips', { headers: { Cookie: `sid=${sid}` } }, env));
    const tripsAfter = await json<TripListItem[]>(tripsAfterRes);
    const summaryAfterRes = await Promise.resolve(
      app.request('/api/me/people/summary', { headers: { Cookie: `sid=${sid}` } }, env),
    );
    const summaryAfter = await json<PeopleSummaryResponse>(summaryAfterRes);

    for (const item of tripsAfter) {
      const snapRes = await Promise.resolve(
        app.request(`/api/trips/${item.id}`, { headers: { Cookie: `sid=${sid}` } }, env),
      );
      const snap = await json<TripView>(snapRes);
      expect(item.myBalance).toBe(snap.myBalance?.now ?? 0);
    }

    const friendAfter = summaryAfter.people.find((p) => p.key === `u:${FRIEND}`);
    const expectedNewTotal =
      friendBefore.total >= 0 ? friendBefore.total - settleAmount : friendBefore.total + settleAmount;
    expect(friendAfter?.total ?? 0).toBe(expectedNewTotal);
  });

  it('populates trip_balance_cache on first request and serves second request with <= 3 (GET /trips) / <= 6 (GET /me/people/summary) queries without reading transactions or transaction_shares', async () => {
    await seedUser(ME, 'Me');
    await seedUser(FRIEND, 'Friend');
    await addTrip('t-c1', '2026-10-01T00:00:00.000Z');
    await addPerson('t-c1', 't-c1-m', ME, 0);
    await addPerson('t-c1', 't-c1-f', FRIEND, 1);
    await addExpense('t-c1', 't-c1-m', [['t-c1-m', 50_000], ['t-c1-f', 50_000]]);
    await addTrip('t-c2', '2026-10-02T00:00:00.000Z', { round: 1 });
    await addPerson('t-c2', 't-c2-m', ME, 0);
    await addPerson('t-c2', 't-c2-f', FRIEND, 1);
    await addExpense('t-c2', 't-c2-m', [['t-c2-m', 33_333], ['t-c2-f', 33_333]]);
    const sid = await memberSid(ME, 'Me');

    // First GET /trips warms trip_balance_cache
    const firstTrips = await Promise.resolve(app.request('/api/trips', { headers: { Cookie: `sid=${sid}` } }, env));
    expect(firstTrips.status).toBe(200);

    const cachedRows = await env.DB.prepare('SELECT trip_id, trip_version FROM trip_balance_cache').all();
    expect(cachedRows.results).toHaveLength(2);

    // Second GET /trips uses cache: <= 3 queries, no transactions or transaction_shares
    const tripsCounted = countingEnv();
    const secondTrips = await Promise.resolve(
      app.request('/api/trips', { headers: { Cookie: `sid=${sid}` } }, tripsCounted.env),
    );
    expect(secondTrips.status).toBe(200);
    expect(tripsCounted.counter.queries).toBeLessThanOrEqual(3);
    expect(tripsCounted.counter.sql.some((q) => q.includes('transactions') || q.includes('transaction_shares'))).toBe(
      false,
    );

    // Second GET /me/people/summary uses cache: <= 6 queries, no transactions or transaction_shares
    const summaryCounted = countingEnv();
    const secondSummary = await Promise.resolve(
      app.request('/api/me/people/summary', { headers: { Cookie: `sid=${sid}` } }, summaryCounted.env),
    );
    expect(secondSummary.status).toBe(200);
    expect(summaryCounted.counter.queries).toBeLessThanOrEqual(6);
    expect(
      summaryCounted.counter.sql.some((q) => q.includes('transactions') || q.includes('transaction_shares')),
    ).toBe(false);
  });

  it('out-of-order stale-version guard: upsertTripBalanceCacheBatch with older tripVersion does not overwrite newer row', async () => {
    const db = drizzle(env.DB, { schema });
    await upsertTripBalanceCacheBatch(
      db,
      [
        {
          tripId: 't-guard',
          tripVersion: 5,
          balances: { p1: 1000 },
          roundedBalances: { p1: 1000 },
          suggestions: [],
          waiting: [],
          oldestShared: {},
        },
      ],
      '2026-10-20T00:00:05.000Z',
    );

    // Attempt stale out-of-order write with tripVersion = 3 < 5
    await upsertTripBalanceCacheBatch(
      db,
      [
        {
          tripId: 't-guard',
          tripVersion: 3,
          balances: { p1: 9999 },
          roundedBalances: { p1: 9999 },
          suggestions: [],
          waiting: [],
          oldestShared: {},
        },
      ],
      '2026-10-20T00:00:03.000Z',
    );

    const row = await env.DB.prepare('SELECT trip_version, balances_json FROM trip_balance_cache WHERE trip_id = ?')
      .bind('t-guard')
      .first<{ trip_version: number; balances_json: string }>();
    expect(row?.trip_version).toBe(5);
    expect(JSON.parse(row!.balances_json)).toEqual({ p1: 1000 });
  });
});
