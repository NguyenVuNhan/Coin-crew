import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { TripListItem } from '@cc/core';
import * as schema from '@cc/api-db/schema';
import { getSnapshot } from '../src/trips/snapshot';
import { app, json, memberSid, seedUser } from './helpers';

const ME = 'u-me';
const FRIEND = 'u-friend';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, createdAt: string, opts: { preset?: string; fewest?: number; round?: number } = {}) {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 'VND', ?, ?, ?, ?, ?, 0, ?)",
    id, `Group ${id}`, opts.preset ?? 'trip', opts.fewest ?? 1, opts.round ?? 0, ME, `g-${id}`, `v-${id}`, createdAt,
  );
}

async function addPerson(tripId: string, id: string, userId: string | null, sort: number, status = 'active') {
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, tripId, id, id, userId, status, sort, '2026-10-01T00:00:00.000Z',
  );
}

let txSeq = 0;
async function addExpense(tripId: string, payer: string, shares: [string, number][], opts: { status?: string; meta?: unknown } = {}) {
  const id = `${tripId}-e${txSeq++}`;
  const amount = shares.reduce((s, [, a]) => s + a, 0);
  const at = `2026-10-10T00:00:${String(txSeq % 60).padStart(2, '0')}.000Z`;
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', ?, 'VND', '2026-10-10', ?, 'exact', ?, ?, ?, ?, ?)",
    id, id, tripId, amount, payer, opts.status ?? 'approved', payer, opts.meta ? JSON.stringify(opts.meta) : null, at, at,
  );
  for (const [p, a] of shares) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)', id, p, a, a);
  }
  return id;
}

async function addPayment(tripId: string, from: string, to: string, amount: number, status: string, amountConfirmed: number | null = null) {
  const id = `${tripId}-p${txSeq++}`;
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed, currency, spent_on, payer_id, to_id, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'payment', '', ?, ?, 'VND', '2026-10-11', ?, ?, ?, ?, ?, ?)",
    id, id, tripId, amount, amountConfirmed, from, to, status, from, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z',
  );
}

function bump(tripId: string) {
  return run('UPDATE trips SET version = version + 1 WHERE id = ?', tripId);
}

/** env with a DB that counts every statement prepared on it. */
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

const db = () => drizzle(env.DB, { schema });

/** The list balance as the old per-group code computed it from getSnapshot. */
async function expectedBalance(tripId: string, pid: string): Promise<number> {
  const trip = (await db().select().from(schema.trips).where(eq(schema.trips.id, tripId)).get())!;
  const snap = await getSnapshot(db(), trip);
  if (trip.roundTransfers !== 1) return snap.balances[pid] ?? 0;
  const owed = snap.suggestions.filter((s) => s.toId === pid).reduce((a, s) => a + s.amount, 0);
  const owe = snap.suggestions.filter((s) => s.fromId === pid).reduce((a, s) => a + s.amount, 0);
  return owed - owe;
}

/** Eight groups, each with a saved view that is out of date in a different way. */
async function seedEightStaleGroups(): Promise<Record<string, string>> {
  await seedUser(FRIEND, 'Friend');
  const me: Record<string, string> = {};
  const day = (i: number) => `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`;
  const groups: { id: string; opts: Parameters<typeof addTrip>[2] }[] = [
    { id: 'g0', opts: {} },
    { id: 'g1', opts: { round: 1 } },
    { id: 'g2', opts: { fewest: 0 } },
    { id: 'g3', opts: { fewest: 1, round: 1 } },
    { id: 'g4', opts: { preset: 'sport' } },
    { id: 'g5', opts: {} },
    { id: 'g6', opts: { fewest: 0, round: 1 } },
    { id: 'g7', opts: {} },
  ];
  for (const [i, g] of groups.entries()) {
    await addTrip(g.id, day(i), g.opts);
    const [m, a, b, c] = [`${g.id}-me`, `${g.id}-a`, `${g.id}-b`, `${g.id}-c`];
    me[g.id] = m;
    await addPerson(g.id, m, ME, 0);
    await addPerson(g.id, a, FRIEND, 1);
    await addPerson(g.id, b, null, 2);
    await addPerson(g.id, c, null, 3, i === 5 ? 'left' : 'active');
    await addExpense(g.id, m, [[m, 333_333], [a, 333_333], [b, 333_334]]);
    await addExpense(g.id, a, [[m, 120_700], [a, 120_700], [c, 120_600]]);
    await addExpense(g.id, b, [[a, 51_250], [c, 48_750]]);
    await addExpense(g.id, b, [[m, 99_000]], { status: 'pending' });
    await addPayment(g.id, b, m, 100_000, 'confirmed');
    await addPayment(g.id, c, a, 50_000, 'says_paid');
    await addPayment(g.id, a, m, 90_000, 'confirmed', 80_000);
    if (g.opts?.preset === 'sport') {
      await addExpense(g.id, m, [[m, 10_000], [a, 10_000]], { meta: { paidFromFund: true } });
    }
  }
  // Save every group's view, then make each one out of date.
  for (const g of groups) await expectedBalance(g.id, me[g.id]!);
  for (const [i, g] of groups.entries()) {
    const [m, a, b, c] = [`${g.id}-me`, `${g.id}-a`, `${g.id}-b`, `${g.id}-c`];
    if (i === 6) {
      // A view from before trip locations: same version, missing a field.
      const row = await env.DB.prepare('SELECT json FROM trip_views WHERE trip_id = ?').bind(g.id).first<{ json: string }>();
      const old = JSON.parse(row!.json) as Record<string, unknown>;
      delete old.locations;
      await run('UPDATE trip_views SET json = ? WHERE trip_id = ?', JSON.stringify(old), g.id);
      continue;
    }
    if (i === 7) {
      // No saved view at all.
      await run('DELETE FROM trip_views WHERE trip_id = ?', g.id);
      continue;
    }
    await addExpense(g.id, c, [[m, 77_777], [b, 22_223]]);
    await addPayment(g.id, m, a, 30_000, i % 2 === 0 ? 'confirmed' : 'says_paid');
    await bump(g.id);
  }
  return me;
}

async function listAs(userId: string, e: object = env) {
  const sid = await memberSid(userId, userId);
  const res = await Promise.resolve(app.request('/api/trips', { headers: { Cookie: `sid=${sid}` } }, e));
  expect(res.status).toBe(200);
  return json<TripListItem[]>(res);
}

describe('GET /api/trips query budget', () => {
  it('eight out-of-date groups: few queries, same balances as the snapshot, no view writes', async () => {
    const me = await seedEightStaleGroups();
    const sid = await memberSid(ME, 'Me');
    const viewsBefore = await env.DB.prepare('SELECT trip_id, version, json, updated_at FROM trip_views ORDER BY trip_id').all();

    const { env: counted, counter } = countingEnv();
    const res = await Promise.resolve(app.request('/api/trips', { headers: { Cookie: `sid=${sid}` } }, counted));
    expect(res.status).toBe(200);
    const list = await json<TripListItem[]>(res);
    console.log(`GET /api/trips with 8 stale groups: ${counter.queries} D1 queries`);
    expect(counter.queries).toBeLessThanOrEqual(6);

    const viewsAfter = await env.DB.prepare('SELECT trip_id, version, json, updated_at FROM trip_views ORDER BY trip_id').all();
    expect(viewsAfter.results).toEqual(viewsBefore.results);

    expect(list.map((t) => t.id)).toEqual(['g7', 'g6', 'g5', 'g4', 'g3', 'g2', 'g1', 'g0']);
    for (const item of list) {
      expect(item.myBalance, item.id).toBe(await expectedBalance(item.id, me[item.id]!));
    }
    // Rounding really is in play: some rounded balance differs from the raw one.
    expect(list.find((t) => t.id === 'g1')!.myBalance % 1000).toBe(0);
  }, 30_000);

  it('uses current saved views without loading group data', async () => {
    const me = await seedEightStaleGroups();
    for (const id of Object.keys(me)) await expectedBalance(id, me[id]!); // refresh every view

    const sid = await memberSid(ME, 'Me');
    const { env: counted, counter } = countingEnv();
    const res = await Promise.resolve(app.request('/api/trips', { headers: { Cookie: `sid=${sid}` } }, counted));
    expect(res.status).toBe(200);
    const list = await json<TripListItem[]>(res);
    expect(counter.sql.some((q) => q.includes('transaction_shares'))).toBe(false);
    for (const item of list) {
      expect(item.myBalance, item.id).toBe(await expectedBalance(item.id, me[item.id]!));
    }
  }, 30_000);

  it('a friend in the same groups gets their own balances', async () => {
    await seedEightStaleGroups();
    const list = await listAs(FRIEND);
    expect(list).toHaveLength(8);
    for (const item of list) {
      expect(item.myBalance, item.id).toBe(await expectedBalance(item.id, `${item.id}-a`));
    }
  }, 30_000);
});
