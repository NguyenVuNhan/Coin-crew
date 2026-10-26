import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_AMOUNT } from '@fsl/core';
import type { ActivityItem, TripView } from '@fsl/core';
import { call, guestHeaders, json, linkMember, memberSid, PID, seedExpenses, seedTrip, T, U } from './helpers';
import { makeAdmin, makeSport, seedFundExpense } from './fund-helpers';

const base = `/api/trips/${T.tripId}`;
const fundPaid = { description: 'Nước sau trận', amount: 150000, spentOn: '2026-10-26', payerId: PID.M, mode: 'equal', entries: [], meta: { paidFromFund: true } };

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

describe('fund-paid expenses', () => {
  beforeEach(async () => {
    await seedTrip();
    await seedExpenses();
    await makeSport();
    minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    an = { Cookie: `sid=${await linkMember(PID.A, U.an, 'An')}` };
    expect((await post('/fund/incomes', minh, { amount: 400000, spentOn: '2026-10-26', description: 'Quỹ' })).status).toBe(201);
  });

  it('an admin pays from the fund: no shares, payer is the admin, balances unchanged, fund −150.000, total +150.000', async () => {
    const before = await view(minh);
    const res = await post('/expenses', minh, { ...fundPaid, payerId: PID.B });
    expect(res.status).toBe(201);
    const after = await view(minh);
    const e = after.expenses.find((x) => x.description === 'Nước sau trận')!;
    expect(e).toMatchObject({ payerId: PID.M, shares: [], status: 'approved', meta: { paidFromFund: true } });
    expect(after.balances).toEqual(before.balances);
    expect(after.fund!.balance).toBe(250000);
    expect(after.trip.total).toBe(before.trip.total + 150000);
  });

  it.each([
    [{ ...fundPaid, entries: [{ participantId: PID.M, value: 1 }] }],
    [{ ...fundPaid, mode: 'amounts' }],
    [{ ...fundPaid, meta: { paidFromFund: true, sport: { court: 150000, shuttlecocks: [], extra: 0, rule: { kind: 'equal' }, entries: [], maleSlotRate: 0, femaleSlotRate: 0 } } }],
    [{ ...fundPaid, meta: { paidFromFund: 'yes' } }],
  ])('422 for a malformed fund-paid body', async (body) => expect((await post('/expenses', minh, body)).status).toBe(422));

  it.each([[0], [-150000], [1.5], [MAX_AMOUNT + 1]])('422 for a fund-paid amount of %s (no split to check it)', async (amount) => {
    expect((await post('/expenses', minh, { ...fundPaid, amount })).status).toBe(422);
    expect((await view(minh)).fund!.balance).toBe(400000);
  });

  it('FUND_SHORT past the balance; exactly the balance is fine', async () => {
    expect((await post('/expenses', minh, { ...fundPaid, amount: 400001 })).status).toBe(409);
    expect((await post('/expenses', minh, { ...fundPaid, amount: 400000 })).status).toBe(201);
    expect((await view(minh)).fund!.balance).toBe(0);
  });

  it('FUND_SHORT is the error code; an expense paid by a person never meets the fund check, even below 0₫', async () => {
    await seedFundExpense({ id: 'e-f1', amount: 500000 }); // two admins raced: the fund is at −100.000 (spec §9.10)
    const res = await post('/expenses', minh, { ...fundPaid, amount: 1 });
    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('FUND_SHORT');
    const own = { ...fundPaid, meta: null, entries: [{ participantId: PID.M, value: 1 }, { participantId: PID.B, value: 1 }] };
    expect((await post('/expenses', minh, own)).status).toBe(201);
  });

  it('edit counts the expense\'s own amount as available', async () => {
    const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, amount: 400000 }));
    expect((await patch(`/expenses/${expenseId}`, minh, { ...fundPaid, amount: 400000, description: 'Nước + đá' })).status).toBe(200);
    expect((await patch(`/expenses/${expenseId}`, minh, { ...fundPaid, amount: 400001 })).status).toBe(409);
  });

  it('turning an admin\'s own expense into a fund-paid one drops its shares', async () => {
    const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, meta: null, entries: [{ participantId: PID.M, value: 1 }, { participantId: PID.B, value: 1 }] }));
    const { expenseId: next } = await json<{ expenseId: string }>(patch(`/expenses/${expenseId}`, minh, fundPaid));
    expect((await view(minh)).expenses.find((e) => e.id === next)).toMatchObject({ shares: [], meta: { paidFromFund: true } });
  });

  it('disable returns the money; enable checks again', async () => {
    const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, amount: 300000 }));
    expect((await post(`/expenses/${expenseId}/disable`, minh)).status).toBe(204);
    expect((await view(minh)).fund!.balance).toBe(400000);
    await post('/expenses', minh, { ...fundPaid, amount: 300000 });
    expect((await post(`/expenses/${expenseId}/enable`, minh)).status).toBe(409);
  });

  it('enable within the balance spends it again; delete returns the money', async () => {
    const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, amount: 300000 }));
    await post(`/expenses/${expenseId}/disable`, minh);
    expect((await post(`/expenses/${expenseId}/enable`, minh)).status).toBe(204);
    expect((await view(minh)).fund!.balance).toBe(100000);
    expect((await call(`${base}/expenses/${expenseId}`, { method: 'DELETE', headers: minh })).status).toBe(204);
    expect((await view(minh)).fund!.balance).toBe(400000);
  });

  it('every write on a fund-paid expense needs manage_fund', async () => {
    expect((await post('/expenses', an, fundPaid)).status).toBe(403);
    expect((await post('/expenses', await guestHeaders(PID.B), fundPaid)).status).toBe(403);
    await makeAdmin(PID.A);
    const { expenseId } = await json<{ expenseId: string }>(post('/expenses', an, fundPaid));
    await makeAdmin(PID.A, false);
    expect((await patch(`/expenses/${expenseId}`, an, { ...fundPaid, description: 'x' })).status).toBe(403);
    expect((await post(`/expenses/${expenseId}/disable`, an)).status).toBe(403);
    expect((await call(`${base}/expenses/${expenseId}`, { method: 'DELETE', headers: an })).status).toBe(403);
  });

  it('roll back and enable need manage_fund when the latest version or the target is fund-paid', async () => {
    await makeAdmin(PID.A);
    const own = { ...fundPaid, meta: null, payerId: PID.A, entries: [{ participantId: PID.A, value: 1 }, { participantId: PID.B, value: 1 }] };
    const { expenseId: v1 } = await json<{ expenseId: string }>(post('/expenses', an, fundPaid));
    const { expenseId: v2 } = await json<{ expenseId: string }>(patch(`/expenses/${v1}`, an, own));
    await makeAdmin(PID.A, false);
    // The latest version is An's own; the target is fund-paid.
    expect((await post(`/expenses/${v2}/rollback`, an, { targetHistoryId: v1 })).status).toBe(403);
    // A non-fund expense An added is still hers to edit.
    expect((await patch(`/expenses/${v2}`, an, { ...own, description: 'Nước' })).status).toBe(200);

    await makeAdmin(PID.A);
    const { expenseId: f1 } = await json<{ expenseId: string }>(post('/expenses', an, fundPaid));
    await makeAdmin(PID.A, false);
    expect((await post(`/expenses/${f1}/disable`, minh)).status).toBe(204);
    expect((await post(`/expenses/${f1}/enable`, an)).status).toBe(403);
  });

  it('roll back to a larger fund-paid version is checked', async () => {
    const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, { ...fundPaid, amount: 300000 }));
    const { expenseId: v2 } = await json<{ expenseId: string }>(patch(`/expenses/${expenseId}`, minh, { ...fundPaid, amount: 100000 }));
    await post('/expenses', minh, { ...fundPaid, amount: 300000 }); // balance now 0
    expect((await post(`/expenses/${v2}/rollback`, minh, { targetHistoryId: expenseId })).status).toBe(409);
  });

  it('activity says the expense was paid from the fund', async () => {
    await post('/expenses', minh, fundPaid);
    const [item] = await json<ActivityItem[]>(call(`${base}/activity`, { headers: minh }));
    expect(item).toMatchObject({ action: 'expense_added', details: { paidFromFund: true, amount: 150000 } });
  });

  it('an edit into a fund-paid expense says so too; a plain one does not', async () => {
    const own = { ...fundPaid, meta: null, entries: [{ participantId: PID.M, value: 1 }] };
    const { expenseId } = await json<{ expenseId: string }>(post('/expenses', minh, own));
    await patch(`/expenses/${expenseId}`, minh, fundPaid);
    const items = await json<ActivityItem[]>(call(`${base}/activity`, { headers: minh }));
    expect(items.find((i) => i.action === 'expense_edited')!.details).toMatchObject({ paidFromFund: true });
    expect(items.find((i) => i.action === 'expense_added')!.details).not.toHaveProperty('paidFromFund');
  });
});

describe('in a trip group', () => {
  beforeEach(async () => {
    await seedTrip();
    await seedExpenses();
    minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
  });

  it('refuses paidFromFund', async () => expect((await post('/expenses', minh, fundPaid)).status).toBe(403));
});
