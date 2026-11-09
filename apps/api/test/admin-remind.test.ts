import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, linkMember, memberSid, T, U, PID } from './helpers';
import { ConsoleEmailService } from '../src/notifications/emailService';

const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const an = async () => ({ Cookie: `sid=${await memberSid(U.an, 'An')}` });

async function addExpense(
  tripId: string,
  id: string,
  payerId: string,
  amount: number,
  participantIds: string[],
  spentOn = '2026-10-15',
) {
  await env.DB.prepare(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'Chi phí', ?, 'VND', ?, ?, 'equal', 'approved', ?, '2026-10-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z')",
  )
    .bind(id, id, tripId, amount, spentOn, payerId, payerId)
    .run();

  const shareAmt = amount / participantIds.length;
  for (const pid of participantIds) {
    await env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)',
    )
      .bind(id, pid, shareAmt)
      .run();
  }
}

describe('Admin Manual Nudge Route (POST /api/trips/:id/remind-debtors)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await seedTrip();
    await linkMember(PID.A, U.an, 'An');
    await addExpense(T.tripId, 'e-1', PID.M, 300000, [PID.M, PID.A]);
  });

  it('Test 1: Admin clicks POST /api/trips/:id/remind-debtors -> sends nudge to debtors in this group, returns { sentCount: 1, throttledCount: 0 }', async () => {
    const minhHeaders = await minh();
    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    const res = await call(`/api/trips/${T.tripId}/remind-debtors`, {
      method: 'POST',
      headers: minhHeaders,
    });

    expect(res.status).toBe(200);
    const data = await json<{ sentCount: number; throttledCount: number }>(res);
    expect(data).toEqual({ sentCount: 1, throttledCount: 0 });

    const anEmails = sendSpy.mock.calls.filter(([c]) => c.to === `${U.an}@example.com`);
    expect(anEmails).toHaveLength(1);
    expect(anEmails[0]![0].text).toContain('Đà Lạt · Oct 2026');

    const logs = await env.DB.prepare(
      'SELECT * FROM notification_logs WHERE user_id = ? AND trip_id = ? AND type = ?',
    )
      .bind(U.an, T.tripId, 'loan_reminder')
      .all<Record<string, unknown>>();

    expect(logs.results).toHaveLength(1);
  });

  it('Test 2: Non-admin caller receives 403 Forbidden', async () => {
    const anHeaders = await an();
    const res = await call(`/api/trips/${T.tripId}/remind-debtors`, {
      method: 'POST',
      headers: anHeaders,
    });

    expect(res.status).toBe(403);
  });

  it('Test 3 (Review Focus #4): Second admin click within 1 hour is throttled ({ sentCount: 0, throttledCount: 1 }) without sending duplicate emails', async () => {
    const minhHeaders = await minh();
    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    const res1 = await call(`/api/trips/${T.tripId}/remind-debtors`, {
      method: 'POST',
      headers: minhHeaders,
    });
    expect(res1.status).toBe(200);
    expect(await json(res1)).toEqual({ sentCount: 1, throttledCount: 0 });
    expect(sendSpy).toHaveBeenCalledTimes(1);

    sendSpy.mockClear();

    const res2 = await call(`/api/trips/${T.tripId}/remind-debtors`, {
      method: 'POST',
      headers: minhHeaders,
    });
    expect(res2.status).toBe(200);
    expect(await json(res2)).toEqual({ sentCount: 0, throttledCount: 1 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('Test 4: Debtors who disabled loan reminders in settings are excluded', async () => {
    // Disable loan reminders for An
    await env.DB.prepare(
      'INSERT INTO user_notification_settings (user_id, transaction_crud, loan_reminders, monthly_notice, updated_at) VALUES (?, 1, 0, 1, ?)',
    )
      .bind(U.an, '2026-10-01T00:00:00.000Z')
      .run();

    const minhHeaders = await minh();
    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    const res = await call(`/api/trips/${T.tripId}/remind-debtors`, {
      method: 'POST',
      headers: minhHeaders,
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ sentCount: 0, throttledCount: 0 });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('Test 5: When trip has no debtors, returns sentCount: 0, throttledCount: 0', async () => {
    // Settle debt by having An pay Minh 150000
    await env.DB.prepare(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed, currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('pay-1', 'pay-1', NULL, 1, ?, 'payment', 'Trả tiền', 150000, 150000, 'VND', '2026-10-16', ?, ?, 'equal', 'confirmed', ?, '2026-10-16T00:00:00.000Z', '2026-10-16T00:00:00.000Z')",
    )
      .bind(T.tripId, PID.A, PID.M, PID.A)
      .run();

    const minhHeaders = await minh();
    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    const res = await call(`/api/trips/${T.tripId}/remind-debtors`, {
      method: 'POST',
      headers: minhHeaders,
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ sentCount: 0, throttledCount: 0 });
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
