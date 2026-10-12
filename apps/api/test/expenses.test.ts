import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpenseInput, TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const err = async (res: Response) => (await json<{ error: { code: string; message: string } }>(res)).error;
const equalAll = (amount: number, payerId: string, description = 'Bánh tráng nướng, chợ đêm'): ExpenseInput => ({
  description, amount, spentOn: '2026-10-11', payerId, mode: 'equal',
  entries: [PID.M, PID.A, PID.B, PID.C].map((participantId) => ({ participantId, value: 1 })),
});
const addAs = async (headers: Record<string, string>, input: ExpenseInput) => json<{ expenseId: string }>(send('POST', '/expenses', headers, input));

beforeEach(async () => { await seedTrip(); await seedExpenses(); });

describe('adding expenses', () => {
  it('a member expense counts straight away', async () => {
    const headers = await minh();
    const res = await send('POST', '/expenses', headers, { ...equalAll(100000, PID.M, 'Bánh mì'), entries: [{ participantId: PID.M, value: 1 }, { participantId: PID.A, value: 1 }] });
    expect(res.status).toBe(201);
    const v = await view(headers);
    expect(v.expenses.find((e) => e.description === 'Bánh mì')?.status).toBe('approved');
    expect(v.balances[PID.M]).toBe(2195000 + 50000);
    expect(v.balances[PID.A]).toBe(-385000 - 50000);
  });

  it('a guest expense waits and shows the guest what would change', async () => {
    const g = await guestHeaders(PID.C);
    const { expenseId } = await addAs(g, equalAll(180000, PID.C));
    const v = await view(g);
    expect(v.expenses.find((e) => e.id === expenseId)?.status).toBe('pending');
    expect(v.balances[PID.C]).toBe(-1245000);
    expect(v.myBalance?.ifPendingApproved).toBe(-1110000);
  });

  it('a split that does not add up is refused with the split error', async () => {
    const res = await send('POST', '/expenses', await minh(), {
      ...equalAll(80000, PID.M), mode: 'amounts', entries: [{ participantId: PID.M, value: 50000 }, { participantId: PID.A, value: 20000 }],
    });
    expect(res.status).toBe(422);
    expect(await err(res)).toEqual({ code: 'VALIDATION', message: 'AMOUNTS_DONT_ADD_UP' });
  });

  it('people must belong to the trip', async () => {
    const res = await send('POST', '/expenses', await minh(), { ...equalAll(100000, 'p-nobody') });
    expect(res.status).toBe(422);
  });

  it('a guest who has not picked a name cannot add', async () => {
    expect((await send('POST', '/expenses', await guestHeaders(), equalAll(100000, PID.C))).status).toBe(403);
  });

  it('a viewer cannot add', async () => {
    expect((await send('POST', '/expenses', await guestHeaders(undefined, T.viewToken), equalAll(100000, PID.C))).status).toBe(403);
  });

  it('a trip holds at most 50 pending guest expenses', async () => {
    const stmt = env.DB.prepare("INSERT INTO expenses (id, trip_id, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, 'x', 1000, 'VND', '2026-10-11', ?, 'equal', 'pending', ?, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z')");
    await env.DB.batch(Array.from({ length: 50 }, (_, i) => stmt.bind(`e-bulk-${i}`, T.tripId, PID.C, PID.C)));
    const res = await send('POST', '/expenses', await guestHeaders(PID.C), equalAll(100000, PID.C));
    expect(res.status).toBe(429);
  });
});

describe('editing and deleting', () => {
  it('a guest edits their own pending expense', async () => {
    const g = await guestHeaders(PID.C);
    const { expenseId } = await addAs(g, equalAll(180000, PID.C));
    expect((await send('PATCH', `/expenses/${expenseId}`, g, equalAll(200000, PID.C))).status).toBe(204);
    expect((await view(g)).expenses.find((e) => e.id === expenseId)?.amount).toBe(200000);
  });

  it('a guest cannot edit an approved expense or someone else\'s', async () => {
    const chi = await guestHeaders(PID.C);
    expect((await send('PATCH', '/expenses/e-1', chi, equalAll(1000, PID.M))).status).toBe(403);
    const { expenseId } = await addAs(await guestHeaders(PID.A), equalAll(90000, PID.A));
    expect((await send('PATCH', `/expenses/${expenseId}`, chi, equalAll(1000, PID.A))).status).toBe(403);
  });

  it('a member deletes an expense and the activity keeps what it was', async () => {
    const headers = await minh();
    expect((await send('DELETE', '/expenses/e-4', headers)).status).toBe(204);
    expect((await view(headers)).expenses.map((e) => e.id)).not.toContain('e-4');
    const row = await env.DB.prepare("SELECT details_json FROM activity WHERE trip_id = ? AND action = 'expense_deleted'").bind(T.tripId).first<{ details_json: string }>();
    expect(JSON.parse(row!.details_json)).toMatchObject({ description: 'Cà phê Túi Mơ To', amount: 240000 });
  });
});

describe('approving, rejecting, disabling', () => {
  it('Review Focus 1: two members approving at once count once', async () => {
    const { expenseId } = await addAs(await guestHeaders(PID.C), equalAll(180000, PID.C));
    const headers = await minh();
    const results = await Promise.all([send('POST', `/expenses/${expenseId}/approve`, headers), send('POST', `/expenses/${expenseId}/approve`, headers)]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect((await err(loser)).code).toBe('ALREADY_HANDLED');
    const n = await env.DB.prepare("SELECT count(*) AS n FROM activity WHERE action = 'expense_approved'").first<{ n: number }>();
    expect(n?.n).toBe(1);
    expect((await view(headers)).balances[PID.C]).toBe(-1110000);
  });

  it('Review Focus 4: an expense that includes a name still waiting is blocked', async () => {
    const g = await guestHeaders();
    const { participantId } = await json<{ participantId: string }>(send('POST', '/people', g, { name: 'Dũng', confirmNew: true }));
    const { expenseId } = await addAs(g, { ...equalAll(100000, participantId), entries: [{ participantId, value: 1 }, { participantId: PID.M, value: 1 }] });
    const res = await send('POST', `/expenses/${expenseId}/approve`, await minh());
    expect(res.status).toBe(409);
    expect((await err(res)).code).toBe('PERSON_PENDING');
  });

  it('reject keeps the reason for the guest', async () => {
    const g = await guestHeaders(PID.C);
    const { expenseId } = await addAs(g, equalAll(180000, PID.C));
    expect((await send('POST', `/expenses/${expenseId}/reject`, await minh(), { reason: 'Already paid by An' })).status).toBe(204);
    expect((await view(g)).expenses.find((e) => e.id === expenseId)).toMatchObject({ status: 'rejected', rejectReason: 'Already paid by An' });
  });

  it('guests cannot approve', async () => {
    const { expenseId } = await addAs(await guestHeaders(PID.C), equalAll(180000, PID.C));
    expect((await send('POST', `/expenses/${expenseId}/approve`, await guestHeaders(PID.A))).status).toBe(403);
  });

  it('disable leaves the expense out of balances; enable brings it back', async () => {
    const headers = await minh();
    expect((await send('POST', '/expenses/e-1/disable', headers)).status).toBe(204);
    let v = await view(headers);
    expect(v.expenses.find((e) => e.id === 'e-1')).toMatchObject({ status: 'disabled', disabledByName: 'Minh' });
    expect(v.balances[PID.M]).toBe(-205000);
    expect((await send('POST', '/expenses/e-1/enable', headers)).status).toBe(204);
    v = await view(headers);
    expect(v.balances[PID.M]).toBe(2195000);
    expect(v.expenses.find((e) => e.id === 'e-1')?.disabledByName).toBeNull();
  });
});
