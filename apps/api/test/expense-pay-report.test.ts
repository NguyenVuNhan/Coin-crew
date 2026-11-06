import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpensePayView } from '@cc/core';
import {
  call,
  json,
  seedTrip,
  seedMinhBank,
  newDevice,
  guestHeaders,
  linkMember,
  memberSid,
  T,
  U,
  PID,
} from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const errCode = async (res: Response) =>
  (await json<{ error: { code: string } }>(res)).error.code;

async function seedSportExpense(): Promise<void> {
  await linkMember(PID.A, U.an, 'An');
  await env.DB.prepare("UPDATE participants SET gender = 'F' WHERE id = ?").bind(PID.A).run();
  const metaJson = JSON.stringify({
    sport: {
      court: 120000,
      shuttlecocks: [{ qty: 1, unitPrice: 55000 }],
      extra: 0,
      rule: { mode: 'fixed_female', femalePrice: 40000 },
      entries: [
        { participantId: PID.M, maleSlots: 1, femaleSlots: 0 },
        { participantId: PID.A, maleSlots: 1, femaleSlots: 1 },
        { participantId: PID.B, maleSlots: 1, femaleSlots: 0 },
      ],
      maleSlotRate: 45000,
      femaleSlotRate: 40000,
    },
  });
  await env.DB.prepare(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES ('e-sport', 'e-sport', NULL, 1, ?, 'expense', 'Sân cầu lông', 175000, 'VND', '2026-10-12', ?, 'amounts', 'approved', ?, ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
  )
    .bind(T.tripId, PID.M, PID.M, metaJson)
    .run();
  await env.DB.prepare(
    "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-sport', ?, 45000, 45000), ('e-sport', ?, 85000, 85000), ('e-sport', ?, 45000, 45000)",
  )
    .bind(PID.M, PID.A, PID.B)
    .run();
}

beforeEach(async () => {
  await seedTrip();
  await seedMinhBank();
  await seedSportExpense();
});

describe('report a payment for an expense', () => {
  it('guest self report → says_paid with meta', async () => {
    const b = await guestHeaders(PID.B);
    const res = await post('/expenses/e-sport/pay-report', b, {
      amount: 45000,
      paidBy: 'self',
    });
    expect(res.status).toBe(201);
    const body = await json<{ paymentId: string; status: string }>(res);
    expect(body.status).toBe('says_paid');

    const row = await env.DB.prepare(
      'SELECT payer_id, to_id, amount, status, created_by_participant_id, meta_json FROM transactions WHERE id = ?',
    )
      .bind(body.paymentId)
      .first<{
        payer_id: string;
        to_id: string;
        amount: number;
        status: string;
        created_by_participant_id: string;
        meta_json: string;
      }>();
    expect(row).toEqual({
      payer_id: PID.B,
      to_id: PID.M,
      amount: 45000,
      status: 'says_paid',
      created_by_participant_id: PID.B,
      meta_json: JSON.stringify({ expenseId: 'e-sport', paidBy: 'self' }),
    });

    const act = await env.DB.prepare(
      "SELECT details_json FROM activity WHERE trip_id = ? AND action = 'payment_recorded'",
    )
      .bind(T.tripId)
      .first<{ details_json: string }>();
    expect(JSON.parse(act!.details_json)).toEqual({
      fromId: PID.B,
      toId: PID.M,
      amount: 45000,
      status: 'says_paid',
      expenseId: 'e-sport',
    });

    const view = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers: b }));
    expect(view.row.remaining).toBe(0);
    expect(view.paid).toEqual([
      {
        paymentId: body.paymentId,
        amount: 45000,
        status: 'says_paid',
        paidBy: 'self',
        notArrived: false,
      },
    ]);
  });

  it('member self report → confirmed', async () => {
    const an = { Cookie: `sid=${await memberSid(U.an, 'An')}` };
    const res = await post('/expenses/e-sport/pay-report', an, {
      amount: 85000,
      paidBy: 'self',
    });
    expect(res.status).toBe(201);
    const body = await json<{ paymentId: string; status: string }>(res);
    expect(body.status).toBe('confirmed');

    const row = await env.DB.prepare(
      'SELECT amount_confirmed, status, confirmed_by_participant_id, meta_json FROM transactions WHERE id = ?',
    )
      .bind(body.paymentId)
      .first<{
        amount_confirmed: number | null;
        status: string;
        confirmed_by_participant_id: string | null;
        meta_json: string;
      }>();
    expect(row).toEqual({
      amount_confirmed: 85000,
      status: 'confirmed',
      confirmed_by_participant_id: PID.A,
      meta_json: JSON.stringify({ expenseId: 'e-sport', paidBy: 'self' }),
    });
  });

  it('friend report → says_paid, paidBy friend, payer from row', async () => {
    const dev = await newDevice();
    const headers = { Cookie: dev.cookie, 'X-Link-Token': T.groupToken };
    expect(
      (await post('/expenses/e-sport/friend', headers, { participantId: PID.A })).status,
    ).toBe(204);

    const res = await post('/expenses/e-sport/pay-report', headers, {
      amount: 45000,
      paidBy: 'friend',
    });
    expect(res.status).toBe(201);
    const body = await json<{ paymentId: string; status: string }>(res);
    expect(body.status).toBe('says_paid');

    const row = await env.DB.prepare(
      'SELECT payer_id, to_id, amount, status, created_by_participant_id, meta_json FROM transactions WHERE id = ?',
    )
      .bind(body.paymentId)
      .first<{
        payer_id: string;
        to_id: string;
        amount: number;
        status: string;
        created_by_participant_id: string;
        meta_json: string;
      }>();
    expect(row).toEqual({
      payer_id: PID.A,
      to_id: PID.M,
      amount: 45000,
      status: 'says_paid',
      created_by_participant_id: PID.A,
      meta_json: JSON.stringify({ expenseId: 'e-sport', paidBy: 'friend' }),
    });

    const view = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers }));
    expect(view.row.remaining).toBe(40000);
    expect(view.paid).toEqual([
      {
        paymentId: body.paymentId,
        amount: 45000,
        status: 'says_paid',
        paidBy: 'friend',
        notArrived: false,
      },
    ]);
  });

  it('friend cannot send paidBy self', async () => {
    const dev = await newDevice();
    const headers = { Cookie: dev.cookie, 'X-Link-Token': T.groupToken };
    expect(
      (await post('/expenses/e-sport/friend', headers, { participantId: PID.A })).status,
    ).toBe(204);

    const res = await post('/expenses/e-sport/pay-report', headers, {
      amount: 45000,
      paidBy: 'self',
    });
    expect(res.status).toBe(201);
    const body = await json<{ paymentId: string; status: string }>(res);

    const row = await env.DB.prepare('SELECT meta_json FROM transactions WHERE id = ?')
      .bind(body.paymentId)
      .first<{ meta_json: string }>();
    expect(JSON.parse(row!.meta_json)).toEqual({
      expenseId: 'e-sport',
      paidBy: 'friend',
    });
  });

  it('amount over remaining → 422', async () => {
    const b = await guestHeaders(PID.B);
    const over = await post('/expenses/e-sport/pay-report', b, {
      amount: 45001,
      paidBy: 'self',
    });
    expect(over.status).toBe(422);
    expect(await errCode(over)).toBe('VALIDATION');

    const zero = await post('/expenses/e-sport/pay-report', b, {
      amount: 0,
      paidBy: 'self',
    });
    expect(zero.status).toBe(422);
    expect(await errCode(zero)).toBe('VALIDATION');
  });

  it('second report after the first covered everything → 409, one row only', async () => {
    const b = await guestHeaders(PID.B);
    const first = await post('/expenses/e-sport/pay-report', b, {
      amount: 45000,
      paidBy: 'self',
    });
    expect(first.status).toBe(201);

    const second = await post('/expenses/e-sport/pay-report', b, {
      amount: 45000,
      paidBy: 'self',
    });
    expect(second.status).toBe(409);
    expect(await errCode(second)).toBe('ALREADY_HANDLED');

    const rows = await env.DB.prepare(
      "SELECT id FROM transactions WHERE trip_id = ? AND type = 'payment'",
    )
      .bind(T.tripId)
      .all();
    expect(rows.results).toHaveLength(1);
  });

  it('friend grant for expense A cannot report on expense B → 403', async () => {
    await env.DB.prepare(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-other', 'e-other', NULL, 1, ?, 'expense', 'Nước suối', 100000, 'VND', '2026-10-12', ?, 'equal', 'approved', ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
    )
      .bind(T.tripId, PID.M, PID.M)
      .run();
    await env.DB.prepare(
      "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-other', ?, 1, 50000), ('e-other', ?, 1, 50000)",
    )
      .bind(PID.M, PID.A)
      .run();
    await env.DB.prepare('UPDATE trips SET version = version + 1 WHERE id = ?').bind(T.tripId).run();

    const dev = await newDevice();
    const headers = { Cookie: dev.cookie, 'X-Link-Token': T.groupToken };
    expect(
      (await post('/expenses/e-sport/friend', headers, { participantId: PID.A })).status,
    ).toBe(204);

    const res = await post('/expenses/e-other/pay-report', headers, {
      amount: 50000,
      paidBy: 'friend',
    });
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe('FORBIDDEN');
  });
});
