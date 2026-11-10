import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { seedTrip, linkMember, T, U, PID } from './helpers';
import { ConsoleEmailService } from '../src/notifications/emailService';
import { sendWeeklyLoanReminders } from '../src/notifications/cron/loanReminders';
import { sendMonthlyNotices } from '../src/notifications/cron/monthlyNotice';

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

async function seedSecondTrip(options: { expenseDate?: string } = {}) {
  const expenseDate = options.expenseDate ?? '2026-10-20';

  await env.DB.prepare(
    'INSERT OR IGNORE INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, 0, ?)',
  )
    .bind('t-2', 'Vũng Tàu · Nov 2026', 'VND', U.minh, 'gtok-2', 'vtok-2', '2026-10-12T00:00:00.000Z')
    .run();

  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
  )
    .bind('p2-m', 't-2', 'Minh', 'minh', U.minh, 0, '2026-10-12T00:00:00.000Z')
    .run();

  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
  )
    .bind('p2-a', 't-2', 'An', 'an', U.an, 1, '2026-10-12T00:00:00.000Z')
    .run();

  await addExpense('t-2', 'e-t2-1', 'p2-m', 200000, ['p2-m', 'p2-a'], expenseDate);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedTrip();
});

describe('Consolidated Loan Reminders & Monthly Notice Crons', () => {
  it('Test 1: User in 2 groups with outstanding debt receives 1 consolidated email containing both groups', async () => {
    await linkMember(PID.A, U.an, 'An');
    await addExpense(T.tripId, 'e-t1-1', PID.M, 300000, [PID.M, PID.A], '2026-10-15');
    await seedSecondTrip();

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');
    const now = new Date('2026-11-08T00:00:00Z');

    await sendWeeklyLoanReminders(env, now, { force: true });

    const anEmails = sendSpy.mock.calls.filter(([c]) => c.to === `${U.an}@example.com`);
    expect(anEmails).toHaveLength(1);

    const payload = anEmails[0]![0];
    expect(payload.subject).toContain('2 nhóm');
    expect(payload.text).toContain('Đà Lạt · Oct 2026');
    expect(payload.text).toContain('Vũng Tàu · Nov 2026');

    const logs = await env.DB.prepare(
      'SELECT * FROM notification_logs WHERE user_id = ? AND type = ? ORDER BY trip_id ASC',
    )
      .bind(U.an, 'loan_reminder')
      .all<Record<string, unknown>>();

    expect(logs.results).toHaveLength(2);
    expect(logs.results[0]!.trip_id).toBe('t-1');
    expect(logs.results[1]!.trip_id).toBe('t-2');
  });

  it('Test 2: User with loan reminder sent 3 days ago is skipped by the weekly cron (7-day cooldown)', async () => {
    await linkMember(PID.A, U.an, 'An');
    await addExpense(T.tripId, 'e-t1-1', PID.M, 300000, [PID.M, PID.A], '2026-10-15');
    await seedSecondTrip();

    const now = new Date('2026-11-08T00:00:00Z');
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(
      'INSERT INTO notification_logs (id, user_id, trip_id, type, reference_id, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind('log-prev-1', U.an, 't-1', 'loan_reminder', 't-1', threeDaysAgo)
      .run();

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');

    await sendWeeklyLoanReminders(env, now, { force: true });

    const anEmails = sendSpy.mock.calls.filter(([c]) => c.to === `${U.an}@example.com`);
    expect(anEmails).toHaveLength(1);

    const payload = anEmails[0]![0];
    expect(payload.text).toContain('Vũng Tàu · Nov 2026');
    expect(payload.text).not.toContain('Đà Lạt · Oct 2026');

    sendSpy.mockClear();
    await env.DB.prepare(
      'INSERT INTO notification_logs (id, user_id, trip_id, type, reference_id, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind('log-prev-2', U.an, 't-2', 'loan_reminder', 't-2', threeDaysAgo)
      .run();

    await sendWeeklyLoanReminders(env, now, { force: true });
    const anEmails2 = sendSpy.mock.calls.filter(([c]) => c.to === `${U.an}@example.com`);
    expect(anEmails2).toHaveLength(0);
  });

  it('Test 3 (Review Focus #5): User with 0 balance or positive balance receives no loan reminder email', async () => {
    await linkMember(PID.A, U.an, 'An');
    // An paid 300,000 split between Minh and An. An balance is +150,000.
    await addExpense(T.tripId, 'e-t1-1', PID.A, 300000, [PID.M, PID.A], '2026-10-15');

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');
    const now = new Date('2026-11-08T00:00:00Z');

    await sendWeeklyLoanReminders(env, now, { force: true });

    const anEmails = sendSpy.mock.calls.filter(([c]) => c.to === `${U.an}@example.com`);
    expect(anEmails).toHaveLength(0);
  });

  it('Test 4: Monthly notice cron runs on 1st of month: aggregates previous months spending and net standing across active groups into 1 consolidated email', async () => {
    await linkMember(PID.A, U.an, 'An');
    await addExpense(T.tripId, 'e-t1-oct', PID.M, 300000, [PID.M, PID.A], '2026-10-15');
    await seedSecondTrip();

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');
    const now = new Date('2026-11-01T08:00:00Z');

    await sendMonthlyNotices(env, now, { force: true });

    const anEmails = sendSpy.mock.calls.filter(([c]) => c.to === `${U.an}@example.com`);
    expect(anEmails).toHaveLength(1);

    const payload = anEmails[0]![0];
    expect(payload.subject).toContain('2026-10');
    expect(payload.text).toContain('Đà Lạt · Oct 2026');
    expect(payload.text).toContain('Vũng Tàu · Nov 2026');

    const logs = await env.DB.prepare(
      'SELECT * FROM notification_logs WHERE user_id = ? AND type = ?',
    )
      .bind(U.an, 'monthly_notice')
      .all<Record<string, unknown>>();

    expect(logs.results).toHaveLength(1);
    expect(logs.results[0]!.reference_id).toBe('2026-10');
  });

  it('Test 5: Inactive groups with 0 transactions in that month are excluded from the monthly notice', async () => {
    await linkMember(PID.A, U.an, 'An');
    await addExpense(T.tripId, 'e-t1-oct', PID.M, 300000, [PID.M, PID.A], '2026-10-15');
    await seedSecondTrip({ expenseDate: '2026-09-20' });

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');
    const now = new Date('2026-11-01T08:00:00Z');

    await sendMonthlyNotices(env, now, { force: true });

    const anEmails = sendSpy.mock.calls.filter(([c]) => c.to === `${U.an}@example.com`);
    expect(anEmails).toHaveLength(1);

    const payload = anEmails[0]![0];
    expect(payload.text).toContain('Đà Lạt · Oct 2026');
    expect(payload.text).not.toContain('Vũng Tàu · Nov 2026');
  });

  it('Test 6: Direct ledgers (preset = direct) and archived groups are excluded from crons', async () => {
    await linkMember(PID.A, U.an, 'An');
    // Archive t-1
    await env.DB.prepare('UPDATE trips SET archived_at = ? WHERE id = ?')
      .bind('2026-10-30T00:00:00.000Z', T.tripId)
      .run();
    await addExpense(T.tripId, 'e-t1-1', PID.M, 300000, [PID.M, PID.A], '2026-10-15');

    // Create a direct preset trip
    await env.DB.prepare(
      "INSERT OR IGNORE INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES ('t-direct', '1-on-1', 'direct', 'VND', 0, ?, 'tok-d', 'vtok-d', 0, '2026-10-01T00:00:00.000Z')",
    )
      .bind(U.minh)
      .run();

    await env.DB.prepare(
      "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-dm', 't-direct', 'Minh', 'minh', ?, 'active', 0, '2026-10-01T00:00:00.000Z')",
    )
      .bind(U.minh)
      .run();

    await env.DB.prepare(
      "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('p-da', 't-direct', 'An', 'an', ?, 'active', 1, '2026-10-01T00:00:00.000Z')",
    )
      .bind(U.an)
      .run();

    await addExpense('t-direct', 'e-td-1', 'p-dm', 200000, ['p-dm', 'p-da'], '2026-10-15');

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');
    const now = new Date('2026-11-01T08:00:00Z');

    // Neither archived t-1 nor direct t-direct should produce loan reminders or monthly notices
    await sendWeeklyLoanReminders(env, now, { force: true });
    expect(sendSpy).not.toHaveBeenCalled();

    await sendMonthlyNotices(env, now, { force: true });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('Test 7: Users who disabled notification settings are excluded from crons', async () => {
    await linkMember(PID.A, U.an, 'An');
    await addExpense(T.tripId, 'e-t1-1', PID.M, 300000, [PID.M, PID.A], '2026-10-15');

    // Disable both loan_reminders and monthly_notice for An and Minh
    await env.DB.prepare(
      'INSERT INTO user_notification_settings (user_id, transaction_crud, loan_reminders, monthly_notice, updated_at) VALUES (?, 1, 0, 0, ?)',
    )
      .bind(U.an, '2026-10-01T00:00:00.000Z')
      .run();

    await env.DB.prepare(
      'INSERT INTO user_notification_settings (user_id, transaction_crud, loan_reminders, monthly_notice, updated_at) VALUES (?, 1, 0, 0, ?)',
    )
      .bind(U.minh, '2026-10-01T00:00:00.000Z')
      .run();

    const sendSpy = vi.spyOn(ConsoleEmailService.prototype, 'send');
    const now = new Date('2026-11-01T08:00:00Z');

    await sendWeeklyLoanReminders(env, now, { force: true });
    expect(sendSpy).not.toHaveBeenCalled();

    await sendMonthlyNotices(env, now, { force: true });
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
