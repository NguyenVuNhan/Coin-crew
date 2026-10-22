import { describe, it, expect, beforeEach } from 'vitest';
import type { ExpenseInput, TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, linkMember, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const equalAll = (amount: number, payerId: string, description = 'Bánh tráng nướng, chợ đêm'): ExpenseInput => ({
  description, amount, spentOn: '2026-10-11', payerId, mode: 'equal',
  entries: [PID.M, PID.A, PID.B, PID.C].map((participantId) => ({ participantId, value: 1 })),
});
const record = async (headers: Record<string, string>, fromId: string, toId: string, amount: number) => {
  const res = await send('POST', '/payments', headers, { fromId, toId, amount });
  return { res, body: res.status === 201 ? await json<{ paymentId: string; status: string }>(res) : null };
};

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
  await call(`${base}/people/${PID.C}`, { method: 'DELETE', headers: await minh() });
});

describe('money with people who left', () => {
  it('a left guest who pays up drops out of the suggestions', async () => {
    const owed = -(await view(await minh())).balances[PID.C]!;
    const { body } = await record(await minh(), PID.C, PID.M, owed);
    expect(body?.status).toBe('confirmed');
    const v = await view(await minh());
    expect(v.suggestions.some((s) => s.fromId === PID.C || s.toId === PID.C)).toBe(false);
    expect(v.people.find((p) => p.id === PID.C)?.status).toBe('left');
  });

  it('a payment to a left member counts straight away', async () => {
    await linkMember(PID.B, 'u-binh', 'Bình');
    await call(`${base}/people/${PID.B}`, { method: 'DELETE', headers: await minh() });
    const { body } = await record(await guestHeaders(PID.A), PID.A, PID.B, 100000);
    expect(body?.status).toBe('confirmed');
  });

  it('a new expense cannot include a left person', async () => {
    expect((await send('POST', '/expenses', await minh(), equalAll(100000, PID.M))).status).toBe(422);
    expect((await send('POST', '/expenses', await minh(), { ...equalAll(100000, PID.C), entries: [{ participantId: PID.M, value: 1 }] })).status).toBe(422);
  });

  it('editing an expense keeps a left person already on it, but cannot put them back once taken off', async () => {
    expect((await send('PATCH', '/expenses/e-1', await minh(), equalAll(3300000, PID.M, 'Homestay Bloom · 2 nights'))).status).toBe(200);
    const without = { ...equalAll(3300000, PID.M, 'Homestay Bloom · 2 nights'), entries: [PID.M, PID.A, PID.B].map((participantId) => ({ participantId, value: 1 })) };
    expect((await send('PATCH', '/expenses/e-1', await minh(), without)).status).toBe(200);
    expect((await send('PATCH', '/expenses/e-1', await minh(), equalAll(3300000, PID.M, 'Homestay Bloom · 2 nights'))).status).toBe(422);
  });
});
