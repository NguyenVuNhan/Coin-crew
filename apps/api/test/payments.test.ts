import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const record = async (headers: Record<string, string>, fromId: string, toId: string, amount: number) => {
  const res = await send('/payments', headers, { fromId, toId, amount });
  return { res, body: res.status === 201 ? await json<{ paymentId: string; status: string }>(res) : null };
};
const suggestion = (v: TripView, fromId: string, toId: string) => v.suggestions.find((s) => s.fromId === fromId && s.toId === toId);

beforeEach(async () => { await seedTrip(); await seedExpenses(); });

describe('guest pays a member', () => {
  it('stays "says paid" until the member confirms, but leaves the suggestions', async () => {
    const chi = await guestHeaders(PID.C);
    const { res, body } = await record(chi, PID.C, PID.M, 1245000);
    expect(res.status).toBe(201);
    expect(body?.status).toBe('says_paid');
    const v = await view(chi);
    expect(v.balances[PID.C]).toBe(-1245000);
    expect(suggestion(v, PID.C, PID.M)).toBeUndefined();
    expect(v.myBalance?.waitingConfirm).toBe(1245000);
    expect((await view(await minh())).approvals).toContainEqual({ kind: 'payment', paymentId: body!.paymentId });
  });

  it('Review Focus 1: confirming twice at once counts once', async () => {
    const { body } = await record(await guestHeaders(PID.C), PID.C, PID.M, 1245000);
    const headers = await minh();
    const results = await Promise.all([send(`/payments/${body!.paymentId}/confirm`, headers, {}), send(`/payments/${body!.paymentId}/confirm`, headers, {})]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect((await json<{ error: { code: string } }>(results.find((r) => r.status === 409)!)).error.code).toBe('ALREADY_HANDLED');
    expect((await view(headers)).balances[PID.M]).toBe(950000);
  });

  it('confirming a smaller amount leaves the rest owed', async () => {
    const { body } = await record(await guestHeaders(PID.C), PID.C, PID.M, 1245000);
    const headers = await minh();
    expect((await send(`/payments/${body!.paymentId}/confirm`, headers, { amount: 1000000 })).status).toBe(204);
    expect(suggestion(await view(headers), PID.C, PID.M)?.amount).toBe(245000);
  });

  it('"didn\'t arrive" puts the debt back', async () => {
    const { body } = await record(await guestHeaders(PID.C), PID.C, PID.M, 1245000);
    const headers = await minh();
    expect((await send(`/payments/${body!.paymentId}/not-arrived`, headers)).status).toBe(204);
    const v = await view(headers);
    expect(v.payments.find((p) => p.id === body!.paymentId)?.status).toBe('rejected');
    expect(suggestion(v, PID.C, PID.M)?.amount).toBe(1245000);
  });

  it('only the receiving member can confirm', async () => {
    const { body } = await record(await guestHeaders(PID.C), PID.C, PID.M, 1245000);
    expect((await send(`/payments/${body!.paymentId}/confirm`, await guestHeaders(PID.C), {})).status).toBe(403);
  });
});

describe('member pays a guest, guest pays a guest', () => {
  it('a member paying a guest counts straight away', async () => {
    const { body } = await record(await minh(), PID.M, PID.A, 100000);
    expect(body?.status).toBe('confirmed');
  });

  it('guest to guest counts straight away; "didn\'t arrive" flags it; a member disables and re-enables', async () => {
    await env.DB.prepare("INSERT INTO expenses (id, trip_id, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-c', ?, 'Dâu tây', 400000, 'VND', '2026-10-11', ?, 'equal', 'approved', ?, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z')").bind(T.tripId, PID.C, PID.M).run();
    await env.DB.prepare("INSERT INTO expense_shares (expense_id, participant_id, input_value, amount) VALUES ('e-c', ?, 1, 200000), ('e-c', ?, 1, 200000)").bind(PID.A, PID.C).run();
    const { body } = await record(await guestHeaders(PID.A), PID.A, PID.C, 200000);
    expect(body?.status).toBe('confirmed');
    const headers = await minh();
    expect((await view(headers)).balances).toMatchObject({ [PID.A]: -385000, [PID.C]: -1245000 });

    expect((await send(`/payments/${body!.paymentId}/not-arrived`, await guestHeaders(PID.C))).status).toBe(204);
    let v = await view(headers);
    expect(v.payments.find((p) => p.id === body!.paymentId)).toMatchObject({ status: 'confirmed', notArrived: true });
    expect(v.approvals).toContainEqual({ kind: 'not_arrived', paymentId: body!.paymentId });

    expect((await send(`/payments/${body!.paymentId}/disable`, headers)).status).toBe(204);
    v = await view(headers);
    expect(v.balances).toMatchObject({ [PID.A]: -585000, [PID.C]: -1045000 });
    expect((await send(`/payments/${body!.paymentId}/enable`, headers)).status).toBe(204);
    expect((await view(headers)).balances).toMatchObject({ [PID.A]: -385000, [PID.C]: -1245000 });
  });
});

describe('who may record a payment', () => {
  it('not a third party, not a pending name, not a viewer', async () => {
    expect((await record(await guestHeaders(PID.B), PID.A, PID.M, 1000)).res.status).toBe(403);
    const g = await guestHeaders();
    const { participantId } = await json<{ participantId: string }>(send('/people', g, { name: 'Dũng', confirmNew: true }));
    expect((await record(g, participantId, PID.M, 1000)).res.status).toBe(403);
    expect((await record(await guestHeaders(undefined, T.viewToken), PID.C, PID.M, 1000)).res.status).toBe(403);
  });

  it('the amount must be a positive whole number', async () => {
    expect((await record(await guestHeaders(PID.C), PID.C, PID.M, 0)).res.status).toBe(422);
    expect((await record(await guestHeaders(PID.C), PID.C, PID.M, 12.5)).res.status).toBe(422);
  });

  it('guests cannot disable', async () => {
    const { body } = await record(await minh(), PID.M, PID.A, 100000);
    expect((await send(`/payments/${body!.paymentId}/disable`, await guestHeaders(PID.A))).status).toBe(403);
  });
});
