import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, memberSid, seedExpenses, seedTrip, T, U } from './helpers';
import { makeSport, seedIncome } from './fund-helpers';
import type { TripView } from '@fsl/core';

let minh: Record<string, string>;
const view = () => json<TripView>(call(`/api/trips/${T.tripId}`, { headers: minh }));

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
  minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
});

/** Rewrites the cached view as a deploy before the group fund would have stored it, at the same version. */
async function cacheWithoutFund(): Promise<void> {
  await view();
  const row = await env.DB.prepare('SELECT json FROM trip_views WHERE trip_id = ?').bind(T.tripId).first<{ json: string }>();
  const old = JSON.parse(row!.json) as Record<string, unknown> & { expenses: Record<string, unknown>[] };
  delete old.fund;
  for (const e of old.expenses) delete e.createdAt;
  await env.DB.prepare('UPDATE trip_views SET json = ? WHERE trip_id = ?').bind(JSON.stringify(old), T.tripId).run();
}

describe('trip views cached before the group fund', () => {
  it('are rebuilt, so a sport group gets its fund and expenses get createdAt', async () => {
    await makeSport();
    await seedIncome({ id: 'i-1', amount: 200000 });
    await cacheWithoutFund();
    const v = await view();
    expect(v.fund).toMatchObject({ balance: 200000, added: 200000, spent: 0 });
    expect(v.expenses.every((e) => typeof e.createdAt === 'string')).toBe(true);
  });

  it('are rebuilt for a trip group too, which gets fund null', async () => {
    await cacheWithoutFund();
    const v = await view();
    expect(v.fund).toBeNull();
    expect(v.expenses.every((e) => typeof e.createdAt === 'string')).toBe(true);
  });
});
