import { describe, it, expect, beforeEach } from 'vitest';
import type { ExpenseInput, ExpenseView, TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const err = async (res: Response) => (await json<{ error: { code: string; message: string } }>(res)).error;

/** Minh typed `first`; An, Bình and Chi left their boxes blank. */
const auto = (amount: number, mode: 'amounts' | 'percent', first: number): ExpenseInput => ({
  description: 'Lẩu nấm', amount, spentOn: '2026-10-20', payerId: PID.M, mode,
  entries: [{ participantId: PID.M, value: first }, ...[PID.A, PID.B, PID.C].map((participantId) => ({ participantId, value: null }))],
});
const shareOf = (e: ExpenseView | undefined, pid: string) => e?.shares.find((s) => s.participantId === pid);
const byRoot = (v: TripView, rootId: string) => v.expenses.find((e) => e.id === rootId || e.rootId === rootId);

beforeEach(async () => { await seedTrip(); await seedExpenses(); });

describe('automatic split boxes', () => {
  it('blank exact boxes are stored as automatic and come back blank', async () => {
    const headers = await minh();
    const res = await send('POST', '/expenses', headers, auto(1_000_000, 'amounts', 400000));
    expect(res.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(res);
    const e = byRoot(await view(headers), expenseId);
    expect(shareOf(e, PID.M)).toMatchObject({ amount: 400000, inputValue: 400000 });
    for (const pid of [PID.A, PID.B, PID.C]) expect(shareOf(e, pid)).toMatchObject({ amount: 200000, inputValue: null });
  });

  it('blank percent boxes share what is left', async () => {
    const headers = await minh();
    const { expenseId } = await json<{ expenseId: string }>(send('POST', '/expenses', headers, auto(1_000_000, 'percent', 4000)));
    const e = byRoot(await view(headers), expenseId);
    expect(shareOf(e, PID.M)).toMatchObject({ amount: 400000, inputValue: 4000 });
    for (const pid of [PID.A, PID.B, PID.C]) expect(shareOf(e, pid)).toMatchObject({ amount: 200000, inputValue: null });
  });

  it('editing the total re-divides the blank people and history keeps them blank', async () => {
    const headers = await minh();
    const { expenseId } = await json<{ expenseId: string }>(send('POST', '/expenses', headers, auto(1_000_000, 'amounts', 400000)));
    expect((await send('PATCH', `/expenses/${expenseId}`, headers, auto(1_300_000, 'amounts', 400000))).status).toBe(200);
    const e = byRoot(await view(headers), expenseId);
    for (const pid of [PID.A, PID.B, PID.C]) expect(shareOf(e, pid)).toMatchObject({ amount: 300000, inputValue: null });
    expect(e?.history?.[0]?.shares.find((s) => s.participantId === PID.A)?.inputValue).toBeNull();
  });

  it('rolling back to a version with blank boxes keeps them blank', async () => {
    const headers = await minh();
    const { expenseId } = await json<{ expenseId: string }>(send('POST', '/expenses', headers, auto(1_000_000, 'amounts', 400000)));
    const { expenseId: headId } = await json<{ expenseId: string }>(send('PATCH', `/expenses/${expenseId}`, headers, {
      ...auto(1_000_000, 'amounts', 400000),
      entries: [PID.M, PID.A, PID.B, PID.C].map((participantId) => ({ participantId, value: 250000 })),
    }));
    expect((await send('POST', `/expenses/${headId}/rollback`, headers, { targetHistoryId: expenseId })).status).toBe(200);
    const e = byRoot(await view(headers), expenseId);
    expect(shareOf(e, PID.A)).toMatchObject({ amount: 200000, inputValue: null });
  });

  it('a blank in an equal split is refused', async () => {
    const res = await send('POST', '/expenses', await minh(), {
      ...auto(100000, 'amounts', 1), mode: 'equal',
      entries: [{ participantId: PID.M, value: 1 }, { participantId: PID.A, value: null }],
    });
    expect(res.status).toBe(422);
    expect(await err(res)).toEqual({ code: 'VALIDATION', message: 'INVALID_VALUE' });
  });

  it('a value that is neither a number nor blank is refused', async () => {
    const res = await send('POST', '/expenses', await minh(), {
      ...auto(100000, 'amounts', 100000), entries: [{ participantId: PID.M, value: '5' }],
    });
    expect(res.status).toBe(422);
    expect((await err(res)).message).toBe('Invalid entry');
  });

  it('merging people turns automatic boxes into typed amounts', async () => {
    const headers = await minh();
    const { expenseId } = await json<{ expenseId: string }>(send('POST', '/expenses', headers, auto(1_000_000, 'amounts', 400000)));
    expect((await send('POST', '/people/merge', headers, { fromId: PID.B, intoId: PID.A })).status).toBe(204);
    const e = byRoot(await view(headers), expenseId);
    expect(e?.mode).toBe('amounts');
    expect(e?.shares.every((s) => typeof s.inputValue === 'number')).toBe(true);
  });
});
