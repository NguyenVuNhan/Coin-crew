import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpensePayView, TripView } from '@cc/core';
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

async function friendReportOnSport(amount = 45000): Promise<string> {
  const dev = await newDevice();
  const headers = { Cookie: dev.cookie, 'X-Link-Token': T.groupToken };
  await post('/expenses/e-sport/friend', headers, { participantId: PID.A });
  const res = await post('/expenses/e-sport/pay-report', headers, {
    amount,
    paidBy: 'friend',
  });
  return (await json<{ paymentId: string }>(res)).paymentId;
}

async function guestReportOnSport(amount = 45000): Promise<{
  paymentId: string;
  headers: Record<string, string>;
}> {
  const headers = await guestHeaders(PID.B);
  const res = await post('/expenses/e-sport/pay-report', headers, {
    amount,
    paidBy: 'self',
  });
  const { paymentId } = await json<{ paymentId: string }>(res);
  return { paymentId, headers };
}

beforeEach(async () => {
  await seedTrip();
  await seedMinhBank();
  await seedSportExpense();
});

describe('grouped expense payment approvals and payment revision', () => {
  it('two linked reports → one expense_payments approval with both ids', async () => {
    const p1 = await friendReportOnSport(45000);
    const { paymentId: p2 } = await guestReportOnSport(45000);

    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const view = await json<TripView>(call(base, { headers: minh }));
    expect(view.approvals).toHaveLength(1);
    const a = view.approvals[0];
    expect(a).toMatchObject({ kind: 'expense_payments', expenseId: 'e-sport' });
    if (a?.kind === 'expense_payments') {
      expect([...a.paymentIds].sort()).toEqual([p1, p2].sort());
    }
  });

  it('confirming one of two reports keeps the grouped card for the one still waiting', async () => {
    const p1 = await friendReportOnSport(45000);
    const { paymentId: p2 } = await guestReportOnSport(45000);
    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    expect((await post(`/payments/${p2}/confirm`, minh)).status).toBe(204);

    const view = await json<TripView>(call(base, { headers: minh }));
    expect(view.approvals).toEqual([{ kind: 'expense_payments', expenseId: 'e-sport', paymentIds: [p1] }]);
  });

  it('one linked report → plain payment approval', async () => {
    const { paymentId } = await guestReportOnSport(45000);

    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const view = await json<TripView>(call(base, { headers: minh }));
    expect(view.approvals).toEqual([
      {
        kind: 'payment',
        paymentId,
      },
    ]);
  });

  it('unlinked reports unchanged', async () => {
    const b = await guestHeaders(PID.B);
    const c = await guestHeaders(PID.C);
    const r1 = await json<{ paymentId: string }>(
      post('/payments', b, { fromId: PID.B, toId: PID.M, amount: 20000 }),
    );
    const r2 = await json<{ paymentId: string }>(
      post('/payments', c, { fromId: PID.C, toId: PID.M, amount: 30000 }),
    );

    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const view = await json<TripView>(call(base, { headers: minh }));
    expect(view.approvals).toHaveLength(2);
    expect(view.approvals).toEqual(
      expect.arrayContaining([
        { kind: 'payment', paymentId: r1.paymentId },
        { kind: 'payment', paymentId: r2.paymentId },
      ]),
    );
  });

  it('revise undo puts it back in the grouped approval', async () => {
    const p1 = await friendReportOnSport(45000);
    const { paymentId: p2 } = await guestReportOnSport(45000);
    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };

    expect((await post(`/payments/${p1}/confirm`, minh, { amount: 40000 })).status).toBe(204);

    const afterConfirm = await json<TripView>(call(base, { headers: minh }));
    // Still one grouped card: p1 is confirmed, p2 still waits.
    expect(afterConfirm.approvals).toEqual([{ kind: 'expense_payments', expenseId: 'e-sport', paymentIds: [p2] }]);

    const undoRes = await post(`/payments/${p1}/revise`, minh, { action: 'undo' });
    expect(undoRes.status).toBe(204);

    const row = await env.DB.prepare(
      'SELECT status, amount_confirmed, confirmed_by_participant_id FROM transactions WHERE id = ?',
    )
      .bind(p1)
      .first<{
        status: string;
        amount_confirmed: number | null;
        confirmed_by_participant_id: string | null;
      }>();
    expect(row).toEqual({
      status: 'says_paid',
      amount_confirmed: null,
      confirmed_by_participant_id: null,
    });

    const share = await env.DB.prepare(
      'SELECT amount FROM transaction_shares WHERE transaction_id = ?',
    )
      .bind(p1)
      .first<{ amount: number }>();
    expect(share?.amount).toBe(45000);

    const afterUndo = await json<TripView>(call(base, { headers: minh }));
    expect(afterUndo.approvals).toHaveLength(1);
    const a = afterUndo.approvals[0];
    expect(a).toMatchObject({ kind: 'expense_payments', expenseId: 'e-sport' });
    if (a?.kind === 'expense_payments') {
      expect([...a.paymentIds].sort()).toEqual([p1, p2].sort());
    }
  });

  it('revise amount changes balances', async () => {
    const { paymentId } = await guestReportOnSport(45000);
    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };

    expect((await post(`/payments/${paymentId}/confirm`, minh)).status).toBe(204);

    const beforeRevise = await json<TripView>(call(base, { headers: minh }));
    expect(beforeRevise.balances[PID.B]).toBe(0);

    const reviseRes = await post(`/payments/${paymentId}/revise`, minh, {
      action: 'amount',
      amount: 30000,
    });
    expect(reviseRes.status).toBe(204);

    const afterRevise = await json<TripView>(call(base, { headers: minh }));
    expect(afterRevise.balances[PID.B]).toBe(-15000);
    expect(
      afterRevise.payments.find((p) => p.id === paymentId)?.amountConfirmed,
    ).toBe(30000);

    const act = await env.DB.prepare(
      "SELECT details_json FROM activity WHERE trip_id = ? AND action = 'payment_revised'",
    )
      .bind(T.tripId)
      .first<{ details_json: string }>();
    expect(JSON.parse(act!.details_json)).toEqual({
      action: 'amount',
      amount: 30000,
    });
  });

  it('revise not_arrived rejects and remaining goes back up', async () => {
    const { paymentId, headers: bHeaders } = await guestReportOnSport(45000);
    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };

    expect((await post(`/payments/${paymentId}/confirm`, minh)).status).toBe(204);

    const confirmedView = await json<ExpensePayView>(
      call(`${base}/expenses/e-sport/pay`, { headers: bHeaders }),
    );
    expect(confirmedView.row.remaining).toBe(0);

    const reviseRes = await post(`/payments/${paymentId}/revise`, minh, {
      action: 'not_arrived',
    });
    expect(reviseRes.status).toBe(204);

    const afterView = await json<ExpensePayView>(
      call(`${base}/expenses/e-sport/pay`, { headers: bHeaders }),
    );
    expect(afterView.row.remaining).toBe(45000);
    expect(afterView.paid).toEqual([
      {
        paymentId,
        amount: 45000,
        status: 'rejected',
        paidBy: 'self',
        notArrived: false,
      },
    ]);
  });

  it('revise by someone other than the confirming receiver → 403', async () => {
    const { paymentId, headers: bHeaders } = await guestReportOnSport(45000);
    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const an = { Cookie: `sid=${await memberSid(U.an, 'An')}` };

    expect((await post(`/payments/${paymentId}/confirm`, minh)).status).toBe(204);

    const asAn = await post(`/payments/${paymentId}/revise`, an, { action: 'undo' });
    expect(asAn.status).toBe(403);
    expect(await errCode(asAn)).toBe('FORBIDDEN');

    const asGuest = await post(`/payments/${paymentId}/revise`, bHeaders, {
      action: 'undo',
    });
    expect(asGuest.status).toBe(403);
    expect(await errCode(asGuest)).toBe('FORBIDDEN');

    await env.DB.prepare(
      'UPDATE transactions SET confirmed_by_participant_id = ? WHERE id = ?',
    )
      .bind(PID.A, paymentId)
      .run();

    const asMinhNotConfirmer = await post(`/payments/${paymentId}/revise`, minh, {
      action: 'undo',
    });
    expect(asMinhNotConfirmer.status).toBe(403);
    expect(await errCode(asMinhNotConfirmer)).toBe('FORBIDDEN');
  });

  it('revise on says_paid → 403', async () => {
    const { paymentId } = await guestReportOnSport(45000);
    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };

    const res = await post(`/payments/${paymentId}/revise`, minh, { action: 'undo' });
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe('FORBIDDEN');
  });
});
