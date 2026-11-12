import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

async function recordSaysPaid(): Promise<string> {
  const res = await send('/payments', await guestHeaders(PID.C), { fromId: PID.C, toId: PID.M, amount: 1245000 });
  expect(res.status).toBe(201);
  return (await json<{ paymentId: string }>(res)).paymentId;
}

async function paymentStatus(pid: string) {
  const row = await env.DB.prepare('SELECT status FROM transactions WHERE id = ?').bind(pid).first<{ status: string }>();
  return row!.status;
}

async function tripState() {
  const trip = await env.DB.prepare('SELECT version FROM trips WHERE id = ?').bind(T.tripId).first<{ version: number }>();
  const acts = await env.DB.prepare('SELECT COUNT(*) AS n FROM activity WHERE trip_id = ?').bind(T.tripId).first<{ n: number }>();
  return { version: trip!.version, activity: acts!.n };
}

beforeEach(async () => { await seedTrip(); await seedExpenses(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('payment status changes are atomic', () => {
  it('a lost confirm writes nothing', async () => {
    const pid = await recordSaysPaid();
    const headers = await minh();
    expect((await send(`/payments/${pid}/confirm`, headers, {})).status).toBe(204);
    const before = await tripState();

    const res = await send(`/payments/${pid}/confirm`, headers, {});
    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('ALREADY_HANDLED');
    expect(await tripState()).toEqual(before);
  });

  it('a failed batch leaves the payment says_paid on confirm', async () => {
    const pid = await recordSaysPaid();
    const headers = await minh();
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await send(`/payments/${pid}/confirm`, headers, {});
    expect(res.status).toBe(500);
    expect(await paymentStatus(pid)).toBe('says_paid');
  });

  it('a lost disable writes nothing', async () => {
    const pid = await recordSaysPaid();
    const headers = await minh();
    expect((await send(`/payments/${pid}/disable`, headers)).status).toBe(204);
    const before = await tripState();

    const res = await send(`/payments/${pid}/disable`, headers);
    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('ALREADY_HANDLED');
    expect(await tripState()).toEqual(before);
  });

  it('a failed batch leaves the payment says_paid on disable', async () => {
    const pid = await recordSaysPaid();
    const headers = await minh();
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await send(`/payments/${pid}/disable`, headers);
    expect(res.status).toBe(500);
    expect(await paymentStatus(pid)).toBe('says_paid');
  });
});
