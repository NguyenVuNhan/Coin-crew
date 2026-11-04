import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { buildVietQrPayload, type ExpensePayView, type TripView } from '@fsl/core';
import { call, json, seedTrip, seedMinhBank, newDevice, guestHeaders, linkMember, memberSid, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

async function insertLinkedPayment(opts: {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  status?: 'says_paid' | 'confirmed';
  expenseId?: string;
  paidBy?: 'self' | 'friend';
  createdAt?: string;
}): Promise<void> {
  const createdAt = opts.createdAt ?? '2026-10-12T01:00:00.000Z';
  const status = opts.status ?? 'says_paid';
  const metaJson = JSON.stringify({
    expenseId: opts.expenseId ?? 'e-sport',
    paidBy: opts.paidBy ?? 'self',
  });
  await env.DB.prepare(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed, currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id, confirmed_by_participant_id, meta_json, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'payment', '', ?, ?, 'VND', '2026-10-12', ?, ?, 'equal', ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      opts.id,
      opts.id,
      T.tripId,
      opts.amount,
      status === 'confirmed' ? opts.amount : null,
      opts.fromId,
      opts.toId,
      status,
      opts.fromId,
      status === 'confirmed' ? opts.toId : null,
      metaJson,
      createdAt,
      createdAt,
    )
    .run();
  await env.DB.prepare('UPDATE trips SET version = version + 1 WHERE id = ?').bind(T.tripId).run();
}

beforeEach(async () => {
  await seedTrip();
  await seedMinhBank();
  await seedSportExpense();
});

describe('expense pay view', () => {
  it('self guest sees share, remaining and a VietQR payload carrying the remaining amount', async () => {
    const b = await guestHeaders(PID.B);
    const view = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers: b }));
    expect(view.viewer).toBe('self');
    expect(view.expense).toEqual({
      id: 'e-sport',
      description: 'Sân cầu lông',
      spentOn: '2026-10-12',
      amount: 175000,
    });
    expect(view.payer).toEqual({ id: PID.M, name: 'Minh' });
    expect(view.row).toEqual({
      participantId: PID.B,
      name: 'Bình',
      isMember: false,
      slots: 1,
      share: 45000,
      remaining: 45000,
      tiles: [],
    });
    expect(view.pay?.amount).toBe(45000);
    expect(view.pay?.payload).toContain('540545000');
    expect(view.pay?.payload).toBe(
      buildVietQrPayload({
        bin: '970407',
        accountNumber: '19031234565678',
        amount: 45000,
        note: view.pay!.refCode,
      }),
    );
  });

  it('remaining drops after a linked says_paid payment; pay is null at 0', async () => {
    const b = await guestHeaders(PID.B);
    await insertLinkedPayment({
      id: 'p-1',
      fromId: PID.B,
      toId: PID.M,
      amount: 20000,
      createdAt: '2026-10-12T01:00:00.000Z',
    });

    const partial = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers: b }));
    expect(partial.row.remaining).toBe(25000);
    expect(partial.pay?.amount).toBe(25000);
    expect(partial.pay?.payload).toContain('540525000');
    expect(partial.paid).toEqual([
      { paymentId: 'p-1', amount: 20000, status: 'says_paid', paidBy: 'self', notArrived: false },
    ]);

    await insertLinkedPayment({
      id: 'p-2',
      fromId: PID.B,
      toId: PID.M,
      amount: 25000,
      createdAt: '2026-10-12T02:00:00.000Z',
    });

    const done = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers: b }));
    expect(done.row.remaining).toBe(0);
    expect(done.pay).toBeNull();
    expect(done.paid.map((p) => p.paymentId)).toEqual(['p-2', 'p-1']);
  });

  it('share edited below what was paid → remaining 0', async () => {
    const b = await guestHeaders(PID.B);
    await insertLinkedPayment({
      id: 'p-1',
      fromId: PID.B,
      toId: PID.M,
      amount: 45000,
      status: 'confirmed',
    });

    await env.DB.prepare(
      "UPDATE transaction_shares SET amount = 30000, input_value = 30000 WHERE transaction_id = 'e-sport' AND participant_id = ?",
    )
      .bind(PID.B)
      .run();
    await env.DB.prepare("UPDATE transactions SET amount = 160000 WHERE id = 'e-sport'").run();
    await env.DB.prepare('UPDATE trips SET version = version + 1 WHERE id = ?').bind(T.tripId).run();

    const view = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers: b }));
    expect(view.row.share).toBe(30000);
    expect(view.row.remaining).toBe(0);
    expect(view.pay).toBeNull();
  });

  it('fewestTransfers on: remaining still equals the share', async () => {
    // Chi paid 400.000 for Minh alone, so under fewestTransfers Bình is routed to pay Chi, not Minh.
    await env.DB.prepare(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-chi', 'e-chi', NULL, 1, ?, 'expense', 'Thuê sân', 400000, 'VND', '2026-10-12', ?, 'amounts', 'approved', ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
    )
      .bind(T.tripId, PID.C, PID.M)
      .run();
    await env.DB.prepare(
      "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-chi', ?, 400000, 400000)",
    )
      .bind(PID.M)
      .run();
    await env.DB.prepare('UPDATE trips SET version = version + 1 WHERE id = ?').bind(T.tripId).run();

    const b = await guestHeaders(PID.B);
    const tripView = await json<TripView>(call(base, { headers: b }));
    expect(tripView.trip.fewestTransfers).toBe(true);
    expect(tripView.suggestions.find((s) => s.fromId === PID.B && s.toId === PID.M)).toBeUndefined();

    const view = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers: b }));
    expect(view.row.remaining).toBe(45000);
    expect(view.pay?.amount).toBe(45000);
  });

  it('friend grant device gets viewer friend; another expense id returns row null', async () => {
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
    expect((await post('/expenses/e-sport/friend', headers, { participantId: PID.A })).status).toBe(204);

    const view = await json<ExpensePayView>(call(`${base}/expenses/e-sport/pay`, { headers }));
    expect(view.viewer).toBe('friend');
    expect(view.row).toEqual({
      participantId: PID.A,
      name: 'An',
      isMember: true,
      slots: 2,
      share: 85000,
      remaining: 85000,
      tiles: [{ gender: 'M', amount: 45000 }],
    });
    expect(view.pay?.amount).toBe(85000);

    const other = await json<{ row: null }>(call(`${base}/expenses/e-other/pay`, { headers }));
    expect(other).toEqual({ row: null });
  });

  it('roundTransfers on: expense pay view rounds remaining and accepts rounded pay-report', async () => {
    await env.DB.prepare(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-round-3way', 'e-round-3way', NULL, 1, ?, 'expense', 'Ăn sáng', 50000, 'VND', '2026-10-12', ?, 'equal', 'approved', ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
    )
      .bind(T.tripId, PID.M, PID.M)
      .run();
    await env.DB.prepare(
      "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-round-3way', ?, 1, 16666), ('e-round-3way', ?, 1, 16667), ('e-round-3way', ?, 1, 16667)",
    )
      .bind(PID.M, PID.A, PID.B)
      .run();
    await env.DB.prepare('UPDATE trips SET round_transfers = 1, version = version + 1 WHERE id = ?')
      .bind(T.tripId)
      .run();

    const b = await guestHeaders(PID.B);
    const view = await json<ExpensePayView>(call(`${base}/expenses/e-round-3way/pay`, { headers: b }));
    expect(view.row.remaining).toBe(17000);
    expect(view.pay?.amount).toBe(17000);

    const res = await post('/expenses/e-round-3way/pay-report', b, {
      amount: 17000,
      paidBy: 'self',
    });
    expect(res.status).toBe(201);
  });

  it('payer viewing returns row null', async () => {
    const minhHeaders = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const res = await call(`${base}/expenses/e-sport/pay`, { headers: minhHeaders });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ row: null });
  });
});
