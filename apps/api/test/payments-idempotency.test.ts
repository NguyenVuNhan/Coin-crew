import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';
import { ConsoleEmailService } from '../src/notifications/emailService';

const send = (path: string, headers: Record<string, string>, body?: unknown, tripId: string = T.tripId) =>
  call(`/api/trips/${tripId}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const errCode = async (res: Response) => (await json<{ error: { code: string } }>(res)).error.code;
type Created = { paymentId: string; status: string };

const KEY = 'pay-key-0123456789abcdef';

async function paymentRows(rootId: string) {
  return (await env.DB.prepare("SELECT id FROM transactions WHERE root_id = ? AND type = 'payment'").bind(rootId).all()).results;
}
async function countPayments(fromId: string, toId: string) {
  const row = await env.DB.prepare("SELECT count(*) AS n FROM transactions WHERE type = 'payment' AND payer_id = ? AND to_id = ?").bind(fromId, toId).first<{ n: number }>();
  return row!.n;
}
async function countKeys(key: string) {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM payment_keys WHERE key = ?').bind(key).first<{ n: number }>();
  return row!.n;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedTrip();
  await seedExpenses();
});

describe('POST /trips/:id/payments idempotencyKey', () => {
  it('same key twice records one payment', async () => {
    const chi = await guestHeaders(PID.C);
    const body = { fromId: PID.C, toId: PID.M, amount: 100000, idempotencyKey: KEY };
    const first = await send('/payments', chi, body);
    expect(first.status).toBe(201);
    const a = await json<Created>(first);
    const second = await send('/payments', chi, body);
    expect(second.status).toBe(200);
    const b = await json<Created>(second);
    expect(b.paymentId).toBe(a.paymentId);
    expect(b.status).toBe('says_paid');
    expect(await paymentRows(a.paymentId)).toHaveLength(1);
    expect(await countPayments(PID.C, PID.M)).toBe(1);
  });

  it('concurrent same key records one payment', async () => {
    const chi = await guestHeaders(PID.C);
    const body = { fromId: PID.C, toId: PID.M, amount: 100000, idempotencyKey: KEY };
    const results = await Promise.all([send('/payments', chi, body), send('/payments', chi, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    const [a, b] = await Promise.all(results.map((r) => json<Created>(r)));
    expect(a!.paymentId).toBe(b!.paymentId);
    expect(await countPayments(PID.C, PID.M)).toBe(1);
    expect(await countKeys(KEY)).toBe(1);
  });

  it('replay sends no notification', async () => {
    const chi = await guestHeaders(PID.C);
    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');
    const body = { fromId: PID.C, toId: PID.M, amount: 100000, idempotencyKey: KEY };
    const first = await send('/payments', chi, body);
    const { paymentId } = await json<Created>(first);
    expect((await send('/payments', chi, body)).status).toBe(200);

    const toMinh = sendSpy.mock.calls.filter((c) => c[0].to === `${U.minh}@example.com`);
    expect(toMinh).toHaveLength(1);
    const logs = (await env.DB.prepare('SELECT * FROM notification_logs WHERE reference_id = ?').bind(paymentId).all()).results;
    expect(logs).toHaveLength(1);
  });

  it('same key with a different amount is 409 CONFLICT', async () => {
    const chi = await guestHeaders(PID.C);
    expect((await send('/payments', chi, { fromId: PID.C, toId: PID.M, amount: 100000, idempotencyKey: KEY })).status).toBe(201);
    const res = await send('/payments', chi, { fromId: PID.C, toId: PID.M, amount: 200000, idempotencyKey: KEY });
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('CONFLICT');
    expect(await countPayments(PID.C, PID.M)).toBe(1);
  });

  it('the same key used in another trip is 409 CONFLICT', async () => {
    const chi = await guestHeaders(PID.C);
    expect((await send('/payments', chi, { fromId: PID.C, toId: PID.M, amount: 100000, idempotencyKey: KEY })).status).toBe(201);

    const t2 = 't-2';
    const now = '2026-10-12T00:00:00.000Z';
    await env.DB.prepare('INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, 0, ?)')
      .bind(t2, 'Other', 'VND', U.minh, 'gtok-2', 'vtok-2', now).run();
    await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p2-minh', ?, 'Minh', 'minh', ?, 'active', 0, ?)")
      .bind(t2, U.minh, now).run();
    await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p2-chi', ?, 'Chi', 'chi', NULL, 'active', 1, ?)")
      .bind(t2, now).run();

    const res = await send('/payments', await minh(), { fromId: 'p2-minh', toId: 'p2-chi', amount: 100000, idempotencyKey: KEY }, t2);
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('CONFLICT');
    expect(await countPayments('p2-minh', 'p2-chi')).toBe(0);
  });

  it('malformed key is 422 VALIDATION', async () => {
    const res = await send('/payments', await guestHeaders(PID.C), { fromId: PID.C, toId: PID.M, amount: 100000, idempotencyKey: 'short' });
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe('VALIDATION');
    expect(await countPayments(PID.C, PID.M)).toBe(0);
  });

  it('no key keeps today\'s behaviour', async () => {
    const chi = await guestHeaders(PID.C);
    const body = { fromId: PID.C, toId: PID.M, amount: 100000 };
    expect((await send('/payments', chi, body)).status).toBe(201);
    expect((await send('/payments', chi, body)).status).toBe(201);
    expect(await countPayments(PID.C, PID.M)).toBe(2);
  });

  it('retried tick after success returns the original', async () => {
    const chi = await guestHeaders(PID.C);
    const body = { fromId: PID.C, toId: PID.M, amount: 1245000, settles: true, idempotencyKey: KEY };
    const first = await send('/payments', chi, body);
    expect(first.status).toBe(201);
    const a = await json<Created>(first);
    const second = await send('/payments', chi, body);
    expect(second.status).toBe(200);
    expect((await json<Created>(second)).paymentId).toBe(a.paymentId);
    expect(await countPayments(PID.C, PID.M)).toBe(1);
  });

  it('replay returns the current status', async () => {
    const chi = await guestHeaders(PID.C);
    const body = { fromId: PID.C, toId: PID.M, amount: 100000, idempotencyKey: KEY };
    const { paymentId, status } = await json<Created>(await send('/payments', chi, body));
    expect(status).toBe('says_paid');
    expect((await send(`/payments/${paymentId}/confirm`, await minh(), {})).status).toBe(204);
    const replay = await send('/payments', chi, body);
    expect(replay.status).toBe(200);
    const r = await json<Created>(replay);
    expect(r.paymentId).toBe(paymentId);
    expect(r.status).toBe('confirmed');
  });
});
