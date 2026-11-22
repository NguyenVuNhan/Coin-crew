import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { PeopleSummaryResponse, TripListItem } from '@cc/core';
import * as schema from '@cc/api-db/schema';
import { backfillPersonalTripCache, backfillTripBalanceCache } from '../src/ops/backfillBalances';
import { createApp } from '../src/app';
import { memberSid, seedUser } from './helpers';

const app = createApp();

const ME = 'u-budget-me';
const FRIEND = 'u-budget-friend';
const NOW = '2026-11-20T00:00:00.000Z';
const MONTH = '2026-11';

const GROUP_COUNT = 30;
const ACTIVE_GROUP_COUNT = 15;
const TX_PER_GROUP = 500;
const PERSONAL_TX_PER_WALLET = 400; // 5 wallets * 400 = 2,000

interface BudgetMetrics {
  operation: string;
  queries: number;
  rowsRead: number;
  rowsWritten: number;
}

function countingEnv() {
  const counter = {
    queries: 0,
    rowsRead: 0,
    rowsWritten: 0,
    sql: [] as string[],
  };
  const rawStmtMap = new WeakMap<object, D1PreparedStatement>();

  function recordMeta(res: unknown) {
    if (res && typeof res === 'object' && 'meta' in res) {
      const meta = (res as { meta?: { rows_read?: number; rows_written?: number } }).meta;
      if (meta) {
        counter.rowsRead += meta.rows_read ?? 0;
        counter.rowsWritten += meta.rows_written ?? 0;
      }
    }
  }

  function wrapStmt(stmt: D1PreparedStatement, querySql: string): D1PreparedStatement {
    const proxy = new Proxy(stmt, {
      get(target, prop) {
        if (prop === 'bind') {
          return (...values: unknown[]) => wrapStmt(target.bind(...values), querySql);
        }
        if (prop === 'all') {
          return async (...args: unknown[]) => {
            const res = await (target.all as (...a: unknown[]) => Promise<unknown>)(...args);
            recordMeta(res);
            return res;
          };
        }
        if (prop === 'run') {
          return async (...args: unknown[]) => {
            const res = await (target.run as (...a: unknown[]) => Promise<unknown>)(...args);
            recordMeta(res);
            return res;
          };
        }
        if (prop === 'first') {
          return async (...args: unknown[]) => {
            const res = await (target.first as (...a: unknown[]) => Promise<unknown>)(...args);
            recordMeta(res);
            return res;
          };
        }
        if (prop === 'raw') {
          return async (...args: unknown[]) => {
            if (/^\s*(SELECT|WITH)\b/i.test(querySql)) {
              const metaRes = await target.all();
              recordMeta(metaRes);
            }
            return await (target.raw as (...a: unknown[]) => Promise<unknown>)(...args);
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    rawStmtMap.set(proxy, stmt);
    return proxy;
  }

  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (q: string) => {
          counter.queries += 1;
          counter.sql.push(q);
          return wrapStmt(target.prepare(q), q);
        };
      }
      if (prop === 'batch') {
        return async (stmts: D1PreparedStatement[]) => {
          const rawStmts = stmts.map((s) => rawStmtMap.get(s) ?? s);
          const results = await target.batch(rawStmts);
          for (const r of results) {
            recordMeta(r);
          }
          return results;
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  return { env: { ...env, DB }, counter };
}

async function batchSql(statements: string[]): Promise<void> {
  const BATCH_SIZE = 20;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE).map((s) => env.DB.prepare(s));
    await env.DB.batch(chunk);
  }
}

async function seedHeavyAccount(): Promise<string> {
  await seedUser(ME, 'Heavy User');
  await seedUser(FRIEND, 'Heavy Friend');
  const sid = await memberSid(ME, 'Heavy User');

  await env.DB.prepare(
    'INSERT OR REPLACE INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, 1, ?)',
  )
    .bind(ME, NOW)
    .run();

  // Seed 30 groups (15 active + 15 archived) + 2 participants each
  const groupStmts: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    const gid = `g-${String(g).padStart(2, '0')}`;
    const archivedAt = g < ACTIVE_GROUP_COUNT ? 'NULL' : `'2026-11-01T00:00:00.000Z'`;
    groupStmts.push(
      `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES ('${gid}', 'Group ${gid}', 'trip', 'VND', 1, 0, '${ME}', 'gt-${gid}', 'vt-${gid}', 1, '2026-10-01T00:00:00.000Z', ${archivedAt})`,
    );
    groupStmts.push(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-${gid}-me', '${gid}', 'Me', 'me', '${ME}', 'active', 0, '2026-10-01T00:00:00.000Z'), ('p-${gid}-fr', '${gid}', 'Friend', 'friend', '${FRIEND}', 'active', 1, '2026-10-01T00:00:00.000Z')`,
    );
  }
  await batchSql(groupStmts);

  // Seed 500 approved expenses per group = 15,000 transactions + 30,000 shares
  const txStmts: string[] = [];
  const ROW_CHUNK = 125;
  for (let g = 0; g < GROUP_COUNT; g++) {
    const gid = `g-${String(g).padStart(2, '0')}`;
    const mePid = `p-${gid}-me`;
    const frPid = `p-${gid}-fr`;

    for (let offset = 0; offset < TX_PER_GROUP; offset += ROW_CHUNK) {
      const end = Math.min(offset + ROW_CHUNK, TX_PER_GROUP);
      const txValues: string[] = [];
      const shareValues: string[] = [];
      for (let t = offset; t < end; t++) {
        const txId = `${gid}-e-${String(t).padStart(3, '0')}`;
        const payer = t % 3 === 0 ? frPid : mePid;
        const sec = String(t % 60).padStart(2, '0');
        const at = `2026-10-10T00:00:${sec}.000Z`;
        txValues.push(
          `('${txId}', '${txId}', NULL, 1, '${gid}', 'expense', 'Expense ${t}', 10000, 'VND', '2026-10-10', '${payer}', 'equal', 'approved', '${payer}', '${at}', '${at}')`,
        );
        shareValues.push(
          `('${txId}', '${mePid}', 1, 5000), ('${txId}', '${frPid}', 1, 5000)`,
        );
      }
      txStmts.push(
        `INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ${txValues.join(',')}`,
      );
      txStmts.push(
        `INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ${shareValues.join(',')}`,
      );
    }
  }
  await batchSql(txStmts);

  // Seed 5 personal wallets: 3 VND everyday, 1 USD everyday, 1 investment
  await env.DB.prepare(
    `INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES
      ('w-vnd-1', ?, 'Cash VND', 'VND', 1000000, '2026-01-01', 1, ?, ?),
      ('w-vnd-2', ?, 'Bank VND', 'VND', 500000, '2026-01-01', 0, ?, ?),
      ('w-vnd-3', ?, 'Savings VND', 'VND', 250000, '2026-01-01', 0, ?, ?),
      ('w-usd-1', ?, 'USD Wallet', 'USD', 1000, '2026-01-01', 0, ?, ?),
      ('w-inv-1', ?, 'Invest VND', 'VND', 5000000, '2026-01-01', 0, ?, ?)`,
  )
    .bind(ME, NOW, NOW, ME, NOW, NOW, ME, NOW, NOW, ME, NOW, NOW, ME, NOW, NOW)
    .run();

  await env.DB.prepare(
    `INSERT INTO personal_wallet_settings (wallet_id, user_id, kind, start_cost_vnd, sort_order, updated_at) VALUES
      ('w-vnd-1', ?, 'everyday', NULL, 0, ?),
      ('w-vnd-2', ?, 'everyday', NULL, 1, ?),
      ('w-vnd-3', ?, 'everyday', NULL, 2, ?),
      ('w-usd-1', ?, 'everyday', NULL, 3, ?),
      ('w-inv-1', ?, 'investment', 5000000, 4, ?)`,
  )
    .bind(ME, NOW, ME, NOW, ME, NOW, ME, NOW, ME, NOW)
    .run();

  await env.DB.prepare(
    `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, created_at, updated_at) VALUES
      ('cat-exp', ?, NULL, 'expense', 'Food', 'utensils', 0, 0, ?, ?),
      ('cat-inc', ?, NULL, 'income', 'Salary', 'wallet', 0, 1, ?, ?)`,
  )
    .bind(ME, NOW, NOW, ME, NOW, NOW)
    .run();

  // Seed 2,000 personal transactions across the 5 wallets (400 per wallet)
  const walletSpecs = [
    { id: 'w-vnd-1', amount: 10000 },
    { id: 'w-vnd-2', amount: 20000 },
    { id: 'w-vnd-3', amount: 30000 },
    { id: 'w-usd-1', amount: 10 },
    { id: 'w-inv-1', amount: 50000 },
  ];
  const ptxStmts: string[] = [];
  for (const w of walletSpecs) {
    for (let offset = 0; offset < PERSONAL_TX_PER_WALLET; offset += 200) {
      const end = Math.min(offset + 200, PERSONAL_TX_PER_WALLET);
      const values: string[] = [];
      for (let i = offset; i < end; i++) {
        const id = `ptx-${w.id}-${String(i).padStart(3, '0')}`;
        const type = i % 2 === 0 ? 'income' : 'expense';
        const catId = type === 'income' ? 'cat-inc' : 'cat-exp';
        const monthOffset = i % 20; // spread across 20 months (100 tx in 2026-11)
        const totalMonths = 2025 * 12 + 3 + monthOffset; // 2025-04 .. 2026-11
        const year = Math.floor(totalMonths / 12);
        const month = String((totalMonths % 12) + 1).padStart(2, '0');
        const day = String((i % 20) + 1).padStart(2, '0');
        values.push(
          `('${id}', '${ME}', '${w.id}', '${type}', ${w.amount}, '${catId}', NULL, NULL, NULL, '${year}-${month}-${day}', NULL, 'tx ${i}', '${NOW}', '${NOW}')`,
        );
      }
      ptxStmts.push(
        `INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, transfer_id, asset_id, quantity, date, time, note, created_at, updated_at) VALUES ${values.join(',')}`,
      );
    }
  }
  await batchSql(ptxStmts);

  // Backfill personal_wallet_balances matching 0033_balance_caching.sql
  await env.DB.prepare(
    `INSERT OR IGNORE INTO personal_wallet_balances (
      wallet_id, user_id, personal_net, entry_count, vnd_value, cash_vnd, holdings_json, needs_replay, updated_at
    )
    SELECT
      pw.id,
      pw.user_id,
      COALESCE(tx.personal_net, 0),
      COALESCE(tx.entry_count, 0),
      NULL,
      NULL,
      NULL,
      CASE
        WHEN pw.currency <> 'VND' OR COALESCE(pws.kind, 'everyday') = 'investment' THEN 1
        ELSE 0
      END,
      ?
    FROM personal_wallets AS pw
    LEFT JOIN personal_wallet_settings AS pws ON pws.wallet_id = pw.id
    LEFT JOIN (
      SELECT
        wallet_id,
        SUM(CASE WHEN type IN ('income', 'transfer_in', 'sell') THEN amount ELSE -amount END) AS personal_net,
        COUNT(*) AS entry_count
      FROM personal_transactions
      GROUP BY wallet_id
    ) AS tx ON tx.wallet_id = pw.id`,
  )
    .bind(NOW)
    .run();

  return sid;
}

describe('heavy-account D1 budget and chunked backfill (#109)', () => {
  it('backfills in chunks idempotently and meets D1 query & row budgets on warm and dirty reads', async () => {
    const sid = await seedHeavyAccount();
    const db = drizzle(env.DB, { schema });

    // 1. Run chunked trip_balance_cache backfill (limit: 10)
    let tripChunks = 0;
    let tripTotal = 0;
    let afterTripId: string | undefined;
    while (true) {
      const res = await backfillTripBalanceCache(db, { limit: 10, afterTripId });
      tripChunks += 1;
      tripTotal += res.processed;
      if (res.done) break;
      afterTripId = res.lastTripId ?? undefined;
    }
    expect(tripTotal).toBe(GROUP_COUNT);

    // Idempotency check: re-running when warm processes 0 rows
    const tripRerun = await backfillTripBalanceCache(db, { limit: 10 });
    expect(tripRerun).toEqual({ processed: 0, lastTripId: null, done: true });

    // 2. Run chunked personal_trip_cache backfill (limit: 5)
    let personalChunks = 0;
    let personalTotal = 0;
    let afterUserId: string | undefined;
    while (true) {
      const res = await backfillPersonalTripCache(db, { limit: 5, afterUserId });
      personalChunks += 1;
      personalTotal += res.processed;
      if (res.done) break;
      afterUserId = res.lastUserId ?? undefined;
    }
    expect(personalTotal).toBe(1);

    const personalCacheCountBefore = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_trip_cache WHERE user_id = ?',
    )
      .bind(ME)
      .first<{ cnt: number }>();
    expect(personalCacheCountBefore?.cnt).toBe(GROUP_COUNT);

    const personalRerun = await backfillPersonalTripCache(db, { limit: 5 });
    expect(personalRerun).toEqual({ processed: 1, lastUserId: ME, done: true });

    const personalCacheCountAfter = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_trip_cache WHERE user_id = ?',
    )
      .bind(ME)
      .first<{ cnt: number }>();
    expect(personalCacheCountAfter?.cnt).toBe(GROUP_COUNT);

    // 3. Initial read to clear needs_replay=1 on USD/investment wallets before measuring warm budgets
    const initWalletsRes = await Promise.resolve(
      app.request('/api/me/personal/wallets', { headers: { Cookie: `sid=${sid}` } }, env),
    );
    expect(initWalletsRes.status).toBe(200);

    const metrics: BudgetMetrics[] = [];
    async function measure(operation: string, path: string, init: RequestInit = {}) {
      const { env: cEnv, counter } = countingEnv();
      const res = await Promise.resolve(
        app.request(
          path,
          {
            ...init,
            headers: { Cookie: `sid=${sid}`, ...(init.headers ?? {}) },
          },
          cEnv,
        ),
      );
      metrics.push({
        operation,
        queries: counter.queries,
        rowsRead: counter.rowsRead,
        rowsWritten: counter.rowsWritten,
      });
      return { res, counter };
    }

    // Warm GET /api/me/personal/wallets
    const w1 = await measure('Warm GET /api/me/personal/wallets', '/api/me/personal/wallets');
    expect(w1.res.status).toBe(200);
    const w1Data = (await w1.res.json()) as {
      wallets: Array<{ id: string; balance: number; entryCount: number }>;
    };
    const w1ById = new Map(w1Data.wallets.map((w) => [w.id, w]));
    // 333 expenses paid by ME * 10,000 = 3,330,000 cash out per group * 30 groups = -99,900,000 on default wallet
    expect(w1ById.get('w-vnd-1')?.balance).toBe(1_000_000 - 99_900_000);
    expect(w1ById.get('w-vnd-1')?.entryCount).toBe(PERSONAL_TX_PER_WALLET);
    expect(w1ById.get('w-vnd-2')?.balance).toBe(500_000);
    expect(w1ById.get('w-vnd-3')?.balance).toBe(250_000);
    expect(w1ById.get('w-usd-1')?.balance).toBe(1_000);
    expect(w1ById.get('w-inv-1')?.balance).toBe(5_000_000);
    expect(w1.counter.queries).toBeLessThanOrEqual(6);
    expect(w1.counter.rowsRead).toBeLessThanOrEqual(150);
    expect(w1.counter.rowsWritten).toBe(0);

    // Warm GET /api/me/personal/summary?month=2026-11
    const s1 = await measure(
      `Warm GET /api/me/personal/summary?month=${MONTH}`,
      `/api/me/personal/summary?month=${MONTH}`,
    );
    expect(s1.res.status).toBe(200);
    expect(s1.counter.queries).toBeLessThanOrEqual(9);
    expect(s1.counter.rowsRead).toBeLessThanOrEqual(250);
    expect(s1.counter.rowsWritten).toBe(0);

    // Warm GET /api/trips?archived=exclude (3 for GET /trips + 1 COUNT(*) for X-Archived-Count)
    const t1 = await measure('Warm GET /api/trips?archived=exclude', '/api/trips?archived=exclude');
    expect(t1.res.status).toBe(200);
    const activeTrips = (await t1.res.json()) as TripListItem[];
    expect(activeTrips).toHaveLength(ACTIVE_GROUP_COUNT);
    for (const trip of activeTrips) {
      // 333 * 10,000 paid - 500 * 5,000 share = +830,000 per group
      expect(trip.myBalance).toBe(830_000);
    }
    expect(t1.counter.queries).toBeLessThanOrEqual(4);
    expect(t1.counter.rowsRead).toBeLessThanOrEqual(250);
    expect(t1.counter.rowsWritten).toBe(0);

    // Warm GET /api/me/people/summary
    const p1 = await measure('Warm GET /api/me/people/summary', '/api/me/people/summary');
    expect(p1.res.status).toBe(200);
    const peopleSummary = (await p1.res.json()) as PeopleSummaryResponse;
    expect(peopleSummary.people).toHaveLength(1);
    expect(peopleSummary.people[0]?.key).toBe(`u:${FRIEND}`);
    expect(peopleSummary.people[0]?.total).toBe(GROUP_COUNT * 830_000);
    expect(peopleSummary.people[0]?.items).toHaveLength(GROUP_COUNT);
    expect(p1.counter.queries).toBeLessThanOrEqual(6);
    expect(p1.counter.rowsRead).toBeLessThanOrEqual(400);
    expect(p1.counter.rowsWritten).toBe(0);

    // POST /api/me/personal/transactions (VND)
    const ptxPost = await measure('POST /api/me/personal/transactions (VND)', '/api/me/personal/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletId: 'w-vnd-1',
        type: 'expense',
        amount: 25000,
        categoryId: 'cat-exp',
        date: '2026-11-20',
        note: 'Coffee',
      }),
    });
    expect(ptxPost.res.status).toBe(201);
    expect(ptxPost.counter.queries).toBeLessThanOrEqual(10);
    expect(ptxPost.counter.rowsRead).toBeLessThanOrEqual(20);
    expect(ptxPost.counter.rowsWritten).toBeLessThanOrEqual(15);

    // Next GET /api/me/personal/wallets after VND write
    const w2 = await measure(
      'GET /api/me/personal/wallets (after VND write)',
      '/api/me/personal/wallets',
    );
    expect(w2.res.status).toBe(200);
    const w2Data = (await w2.res.json()) as {
      wallets: Array<{ id: string; balance: number; entryCount: number }>;
    };
    const w2Default = w2Data.wallets.find((w) => w.id === 'w-vnd-1');
    expect(w2Default?.balance).toBe(1_000_000 - 99_900_000 - 25_000);
    expect(w2Default?.entryCount).toBe(PERSONAL_TX_PER_WALLET + 1);
    expect(w2.counter.queries).toBeLessThanOrEqual(6);
    expect(w2.counter.rowsRead).toBeLessThanOrEqual(150);
    expect(w2.counter.rowsWritten).toBe(0);

    // Write 1 group expense in g-00
    const gExpPost = await measure('POST /api/trips/g-00/expenses', '/api/trips/g-00/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Late dinner',
        amount: 20000,
        spentOn: '2026-11-20',
        payerId: 'p-g-00-me',
        mode: 'equal',
        entries: [
          { participantId: 'p-g-00-me', value: 1 },
          { participantId: 'p-g-00-fr', value: 1 },
        ],
      }),
    });
    expect(gExpPost.res.status).toBe(201);

    // Dirty GET /api/trips?archived=exclude (1 changed group)
    const tDirty = await measure(
      'GET /api/trips?archived=exclude (1 dirty group)',
      '/api/trips?archived=exclude',
    );
    expect(tDirty.res.status).toBe(200);
    expect(tDirty.counter.queries).toBeLessThanOrEqual(8);
    expect(tDirty.counter.rowsRead).toBeLessThan(5000); // 1 changed group (~501 tx + 1,002 shares) vs 15,000-tx corpus

    // Dirty GET /api/me/personal/wallets (1 changed group)
    const wDirty = await measure(
      'GET /api/me/personal/wallets (1 dirty group)',
      '/api/me/personal/wallets',
    );
    expect(wDirty.res.status).toBe(200);
    expect(wDirty.counter.queries).toBeLessThanOrEqual(15);
    expect(wDirty.counter.rowsRead).toBeLessThan(5000);

    // Following warm reads return to O(1)
    const tWarm2 = await measure(
      'GET /api/trips?archived=exclude (re-warmed)',
      '/api/trips?archived=exclude',
    );
    expect(tWarm2.res.status).toBe(200);
    expect(tWarm2.counter.queries).toBeLessThanOrEqual(4);
    expect(tWarm2.counter.rowsRead).toBeLessThanOrEqual(250);
    expect(tWarm2.counter.rowsWritten).toBe(0);

    const wWarm2 = await measure(
      'GET /api/me/personal/wallets (re-warmed)',
      '/api/me/personal/wallets',
    );
    expect(wWarm2.res.status).toBe(200);
    expect(wWarm2.counter.queries).toBeLessThanOrEqual(6);
    expect(wWarm2.counter.rowsRead).toBeLessThanOrEqual(150);
    expect(wWarm2.counter.rowsWritten).toBe(0);

    console.info(
      `\n[Heavy-Account Budget Report] tripChunks=${tripChunks} (processed=${tripTotal}), personalChunks=${personalChunks} (processed=${personalTotal})`,
    );
    console.info(
      metrics
        .map(
          (m) =>
            `  - ${m.operation}: queries=${m.queries}, rowsRead=${m.rowsRead}, rowsWritten=${m.rowsWritten}`,
        )
        .join('\n'),
    );
  }, 60000);
});
