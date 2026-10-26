import { beforeEach, describe, expect, it } from 'vitest';
import { call, json, memberSid, PID, seedExpenses, seedTrip, T, U } from './helpers';
import { bumpVersion, makeSport, seedFundExpense, seedIncome } from './fund-helpers';
import type { TripListItem, TripView } from '@fsl/core';

let minh: Record<string, string>;
const view = (headers: Record<string, string>) => json<TripView>(call(`/api/trips/${T.tripId}`, { headers }));

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
  minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
});

describe('group fund in the trip view', () => {
  it('a trip group has fund null', async () => {
    expect((await view(minh)).fund).toBeNull();
  });

  it('sums approved income minus approved fund-paid expenses, newest income first', async () => {
    await makeSport();
    await seedIncome({ id: 'i-1', amount: 200000, createdAt: '2026-10-26T10:00:00.000Z' });
    await seedIncome({ id: 'i-2', amount: 300000, createdAt: '2026-10-25T10:00:00.000Z' });
    await seedIncome({ id: 'i-3', amount: 150000, createdAt: '2026-10-24T10:00:00.000Z' });
    await seedIncome({ id: 'i-4', amount: 100000, status: 'disabled', disabledByUserId: U.minh, createdAt: '2026-10-23T10:00:00.000Z' });
    await seedFundExpense({ id: 'e-f1', amount: 150000 });
    await seedFundExpense({ id: 'e-f2', amount: 100000 });
    const v = await view(minh);
    expect(v.fund).toMatchObject({ balance: 400000, added: 650000, spent: 250000 });
    expect(v.fund!.incomes.map((i) => i.id)).toEqual(['i-1', 'i-2', 'i-3', 'i-4']);
    expect(v.fund!.incomes[3]).toMatchObject({ status: 'disabled', disabledByName: 'Minh' });
    expect(v.expenses.find((e) => e.id === 'e-f1')).toMatchObject({ meta: { paidFromFund: true }, shares: [] });
  });

  it('fund-paid expenses stay off balances, suggestions and the trip list, but count in the total', async () => {
    await makeSport();
    const before = await view(minh);
    const listBefore = await json<TripListItem[]>(call('/api/trips', { headers: minh }));
    await seedFundExpense({ id: 'e-f1', amount: 150000 });
    await bumpVersion();
    const after = await view(minh);
    expect(after.balances).toEqual(before.balances);
    expect(after.suggestions).toEqual(before.suggestions);
    expect(after.myBalance).toEqual(before.myBalance);
    expect(after.trip.total).toBe(before.trip.total + 150000);
    expect(await json<TripListItem[]>(call('/api/trips', { headers: minh }))).toEqual(listBefore);
  });

  it('income history: addedById from payer_id, createdById from the latest version, older versions newest first', async () => {
    await makeSport();
    await seedIncome({ id: 'i-1', amount: 100000, status: 'superseded', isLatest: 0, createdAt: '2026-10-24T10:00:00.000Z' });
    await seedIncome({ id: 'i-2', rootId: 'i-1', parentId: 'i-1', amount: 150000, createdById: PID.A, createdAt: '2026-10-25T10:00:00.000Z' });
    const [income] = (await view(minh)).fund!.incomes;
    expect(income).toMatchObject({ id: 'i-2', rootId: 'i-1', addedById: PID.M, createdById: PID.A, amount: 150000, meta: { category: null } });
    expect(income!.history.map((h) => [h.id, h.amount])).toEqual([['i-1', 100000]]);
  });

  it('every expense carries createdAt', async () => {
    expect((await view(minh)).expenses.every((e) => typeof e.createdAt === 'string')).toBe(true);
  });
});
