import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_AMOUNT } from '@fsl/core';
import type { ActivityItem, TripView } from '@fsl/core';
import { call, guestHeaders, json, linkMember, memberSid, PID, seedExpenses, seedTrip, T, U } from './helpers';
import { archive, bumpVersion, makeAdmin, makeSport, seedFundExpense } from './fund-helpers';

const base = `/api/trips/${T.tripId}`;
const income = { amount: 200000, spentOn: '2026-10-26', description: 'Thu 2 khách vãng lai' };

let minh: Record<string, string>;
let an: Record<string, string>;

const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = (path: string, headers: Record<string, string>, body?: unknown) => send('POST', path, headers, body);
const patch = (path: string, headers: Record<string, string>, body?: unknown) => send('PATCH', path, headers, body);

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
  await makeSport();
  minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
  an = { Cookie: `sid=${await linkMember(PID.A, U.an, 'An')}` };
});

describe('fund income routes', () => {
  it("an admin adds income: 201, fund +200.000, nobody's balance changes", async () => {
    const before = await view(minh);
    const res = await post('/fund/incomes', minh, income);
    expect(res.status).toBe(201);
    const after = await view(minh);
    expect(after.fund!.balance).toBe(200000);
    expect(after.balances).toEqual(before.balances);
    expect(after.fund!.incomes[0]).toMatchObject({ ...income, addedById: PID.M, status: 'approved', meta: { category: null } });
  });

  it('refuses non-admins, guests and archived groups', async () => {
    expect((await post('/fund/incomes', an, income)).status).toBe(403);
    expect((await post('/fund/incomes', await guestHeaders(PID.B), income)).status).toBe(403);
    await archive();
    expect((await post('/fund/incomes', minh, income)).status).toBe(409); // TRIP_ARCHIVED
  });

  it.each([
    [{ ...income, amount: 0 }],
    [{ ...income, amount: 1.5 }],
    [{ ...income, amount: MAX_AMOUNT + 1 }],
    [{ ...income, spentOn: '26/10/2026' }],
    [{ ...income, description: '   ' }],
    [{ ...income, description: 'x'.repeat(81) }],
    [{ ...income, category: 'walk-in' }],
  ])('422 for %j', async (body) => {
    expect((await post('/fund/incomes', minh, body)).status).toBe(422);
  });

  it('edit and roll back keep addedById, record the editor', async () => {
    const { incomeId } = await json<{ incomeId: string }>(post('/fund/incomes', minh, income));
    await makeAdmin(PID.A);
    const edited = await json<{ incomeId: string; rootId: string }>(patch(`/fund/incomes/${incomeId}`, an, { ...income, amount: 250000 }));
    expect(edited.rootId).toBe(incomeId);
    let latest = (await view(minh)).fund!.incomes[0]!;
    expect(latest).toMatchObject({ amount: 250000, addedById: PID.M, createdById: PID.A });
    const res = await post(`/fund/incomes/${edited.incomeId}/rollback`, an, { targetHistoryId: incomeId });
    expect(res.status).toBe(200);
    latest = (await view(minh)).fund!.incomes[0]!;
    expect(latest).toMatchObject({ amount: 200000, addedById: PID.M, createdById: PID.A });
  });

  it('disable and enable return 204; a second disable is ALREADY_HANDLED', async () => {
    const { incomeId } = await json<{ incomeId: string }>(post('/fund/incomes', minh, income));
    expect((await post(`/fund/incomes/${incomeId}/disable`, minh)).status).toBe(204);
    expect((await view(minh)).fund).toMatchObject({ balance: 0, incomes: [{ status: 'disabled', disabledByName: 'Minh' }] });
    expect((await post(`/fund/incomes/${incomeId}/disable`, minh)).status).toBe(409);
    expect((await post(`/fund/incomes/${incomeId}/enable`, minh)).status).toBe(204);
    expect((await post(`/fund/incomes/${incomeId}/enable`, minh)).status).toBe(409);
  });

  it('404 for an unknown income', async () => {
    expect((await post('/fund/incomes/nope/disable', minh)).status).toBe(404);
  });

  it('FUND_SHORT when money already spent would go missing', async () => {
    const { incomeId } = await json<{ incomeId: string }>(post('/fund/incomes', minh, { ...income, amount: 300000 }));
    await seedFundExpense({ id: 'e-f1', amount: 250000 });
    await bumpVersion();
    const short = async (res: Promise<Response>) => {
      const r = await res;
      expect(r.status).toBe(409);
      expect((await json<{ error: { code: string } }>(r)).error.code).toBe('FUND_SHORT');
    };
    await short(post(`/fund/incomes/${incomeId}/disable`, minh));
    await short(patch(`/fund/incomes/${incomeId}`, minh, { ...income, amount: 200000 }));
    expect((await patch(`/fund/incomes/${incomeId}`, minh, { ...income, amount: 250000 })).status).toBe(200);
  });

  it('writes income activity', async () => {
    await post('/fund/incomes', minh, income);
    const [item] = await json<ActivityItem[]>(call(`${base}/activity`, { headers: minh }));
    expect(item).toMatchObject({ action: 'income_added', details: { description: income.description, amount: 200000 } });
  });
});

describe('in a trip group', () => {
  beforeEach(async () => {
    await env.DB.prepare("UPDATE trips SET preset = 'trip' WHERE id = ?").bind(T.tripId).run();
  });

  it('refuses income', async () => {
    expect((await post('/fund/incomes', minh, income)).status).toBe(403);
  });
});
