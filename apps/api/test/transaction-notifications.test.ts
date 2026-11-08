import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, linkMember, memberSid, guestHeaders, T, U, PID } from './helpers';
import { ConsoleEmailService } from '../src/notifications/emailService';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

async function getNotificationLogs(tripId: string = T.tripId) {
  return (
    await env.DB.prepare(
      'SELECT * FROM notification_logs WHERE trip_id = ? ORDER BY sent_at ASC',
    )
      .bind(tripId)
      .all<Record<string, unknown>>()
  ).results;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedTrip();
});

describe('Transaction Email Notifications', () => {
  it('Test 1: Expense approved/created dispatches email to other split participants whose transactionCrud is enabled', async () => {
    const minhHeaders = await minh();
    await linkMember(PID.A, U.an, 'An');
    await linkMember(PID.B, 'u-binh', 'Bình');

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    const res = await send('POST', '/expenses', minhHeaders, {
      description: 'Lẩu nấm',
      amount: 300000,
      spentOn: '2026-10-20',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 100000 },
        { participantId: PID.A, value: 100000 },
        { participantId: PID.B, value: 100000 },
      ],
    });

    expect(res.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(res);

    const logs = await getNotificationLogs();
    expect(logs).toHaveLength(2);

    const recipientUserIds = logs.map((l) => l.user_id).sort();
    expect(recipientUserIds).toEqual([U.an, 'u-binh'].sort());

    for (const log of logs) {
      expect(log.type).toBe('transaction_crud');
      expect(log.reference_id).toBe(expenseId);
      expect(log.trip_id).toBe(T.tripId);
    }

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${U.an}@example.com`,
        subject: expect.stringContaining('Lẩu nấm'),
      }),
    );
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'u-binh@example.com',
        subject: expect.stringContaining('Lẩu nấm'),
      }),
    );
  });

  it('Test 2: Actor who split the bill is filtered out and receives no email for their own action', async () => {
    const minhHeaders = await minh();
    await linkMember(PID.A, U.an, 'An');

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    const res = await send('POST', '/expenses', minhHeaders, {
      description: 'Cà phê sáng',
      amount: 100000,
      spentOn: '2026-10-20',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 50000 },
        { participantId: PID.A, value: 50000 },
      ],
    });

    expect(res.status).toBe(201);
    const logs = await getNotificationLogs();

    const minhLogs = logs.filter((l) => l.user_id === U.minh);
    expect(minhLogs).toHaveLength(0);

    const sentTo = sendSpy.mock.calls.map((c) => c[0].to);
    expect(sentTo).not.toContain(`${U.minh}@example.com`);
  });

  it('Test 3: Participant with Zalo-only account (email: null) is silently skipped; transaction succeeds without error', async () => {
    const minhHeaders = await minh();
    // Seed user with null email (e.g. Zalo-only login)
    await env.DB.prepare(
      'INSERT INTO users (id, zalo_sub, zalo_name, email, name, consent_at, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)',
    )
      .bind('u-chi-zalo', 'zalo-sub-chi', 'Chi Zalo', 'Chi', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')
      .run();
    await env.DB.prepare('UPDATE participants SET user_id = ? WHERE id = ?').bind('u-chi-zalo', PID.C).run();

    const res = await send('POST', '/expenses', minhHeaders, {
      description: 'Kem bơ',
      amount: 100000,
      spentOn: '2026-10-20',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 50000 },
        { participantId: PID.C, value: 50000 },
      ],
    });

    expect(res.status).toBe(201);
    const logs = await getNotificationLogs();
    const chiLogs = logs.filter((l) => l.user_id === 'u-chi-zalo');
    expect(chiLogs).toHaveLength(0);
  });

  it('Test 4: Participant with transactionCrud: 0 in user_notification_settings receives no email', async () => {
    const minhHeaders = await minh();
    await linkMember(PID.A, U.an, 'An');
    await linkMember(PID.B, 'u-binh', 'Bình');

    // Turn off transactionCrud notifications for Binh
    await env.DB.prepare(
      'INSERT INTO user_notification_settings (user_id, transaction_crud, loan_reminders, monthly_notice, updated_at) VALUES (?, 0, 1, 1, ?)',
    )
      .bind('u-binh', new Date().toISOString())
      .run();

    const res = await send('POST', '/expenses', minhHeaders, {
      description: 'Vé tham quan',
      amount: 300000,
      spentOn: '2026-10-20',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 100000 },
        { participantId: PID.A, value: 100000 },
        { participantId: PID.B, value: 100000 },
      ],
    });

    expect(res.status).toBe(201);
    const logs = await getNotificationLogs();

    const recipientUserIds = logs.map((l) => l.user_id);
    expect(recipientUserIds).toContain(U.an);
    expect(recipientUserIds).not.toContain('u-binh');
  });

  it('Test 5: Expense updated -> dispatches update email', async () => {
    const minhHeaders = await minh();
    await linkMember(PID.A, U.an, 'An');

    const createRes = await send('POST', '/expenses', minhHeaders, {
      description: 'Bánh tráng nướng',
      amount: 100000,
      spentOn: '2026-10-20',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 50000 },
        { participantId: PID.A, value: 50000 },
      ],
    });
    expect(createRes.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(createRes);

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    // Update expense
    const updateRes = await send('PATCH', `/expenses/${expenseId}`, minhHeaders, {
      description: 'Bánh tráng nướng đặc biệt',
      amount: 120000,
      spentOn: '2026-10-20',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 60000 },
        { participantId: PID.A, value: 60000 },
      ],
    });
    expect(updateRes.status).toBe(200);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${U.an}@example.com`,
        subject: expect.stringMatching(/Khoản chi đã cập nhật|Updated expense/),
      }),
    );

    const logs = await getNotificationLogs();
    const updateLogs = logs.filter((l) => l.user_id === U.an && l.reference_id === expenseId);
    expect(updateLogs.length).toBeGreaterThanOrEqual(2); // 1 for created, 1 for updated
  });

  it('Test 6: Expense deleted/disabled -> dispatches deletion email', async () => {
    const minhHeaders = await minh();
    await linkMember(PID.A, U.an, 'An');

    const createRes = await send('POST', '/expenses', minhHeaders, {
      description: 'Dâu tây',
      amount: 200000,
      spentOn: '2026-10-20',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 100000 },
        { participantId: PID.A, value: 100000 },
      ],
    });
    expect(createRes.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(createRes);

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    // Disable expense
    const disableRes = await send('POST', `/expenses/${expenseId}/disable`, minhHeaders);
    expect(disableRes.status).toBe(204);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${U.an}@example.com`,
        subject: expect.stringMatching(/Khoản chi đã xoá|Deleted expense/),
      }),
    );

    const logs = await getNotificationLogs();
    const disabledLogs = logs.filter((l) => l.user_id === U.an && l.reference_id === expenseId);
    expect(disabledLogs.length).toBeGreaterThanOrEqual(2); // 1 for create, 1 for disable
  });

  it('Test 7: Payment says_paid -> dispatches confirmation prompt to recipient; payment confirmed -> dispatches receipt to payer', async () => {
    const minhHeaders = await minh();
    const bHeaders = await guestHeaders(PID.B);

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    // Step 1: Guest Binh says_paid to Minh
    const payRes = await send('POST', '/payments', bHeaders, {
      fromId: PID.B,
      toId: PID.M,
      amount: 150000,
    });
    expect(payRes.status).toBe(201);
    const { paymentId, status } = await json<{ paymentId: string; status: string }>(payRes);
    expect(status).toBe('says_paid');

    // Minh (recipient) should receive confirmation prompt
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: `${U.minh}@example.com`,
        subject: expect.stringMatching(/Cần xác nhận|Confirmation needed/),
      }),
    );

    // Binh (guest actor) receives NO email for says_paid
    const callsAfterSaysPaid = sendSpy.mock.calls.map((c) => c[0].to);
    expect(callsAfterSaysPaid).not.toContain('u-binh@example.com');

    const logsAfterSaysPaid = await getNotificationLogs();
    const paymentLogs1 = logsAfterSaysPaid.filter((l) => l.reference_id === paymentId);
    expect(paymentLogs1).toHaveLength(1);
    expect(paymentLogs1[0].user_id).toBe(U.minh);

    sendSpy.mockClear();

    // Binh signs in / links user account before confirmation
    await linkMember(PID.B, 'u-binh', 'Bình');

    // Step 2: Minh confirms payment
    const confirmRes = await send('POST', `/payments/${paymentId}/confirm`, minhHeaders);
    expect(confirmRes.status).toBe(204);

    // Binh (payer) should receive receipt
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'u-binh@example.com',
        subject: expect.stringMatching(/Xác nhận thanh toán|Payment receipt/),
      }),
    );

    // Minh (actor/payee) receives NO email for confirmed
    const callsAfterConfirmed = sendSpy.mock.calls.map((c) => c[0].to);
    expect(callsAfterConfirmed).not.toContain(`${U.minh}@example.com`);

    const logsAfterConfirmed = await getNotificationLogs();
    const paymentLogs2 = logsAfterConfirmed.filter(
      (l) => l.reference_id === paymentId && l.user_id === 'u-binh',
    );
    expect(paymentLogs2).toHaveLength(1);
  });
});
