import { describe, it, expect, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { seedTrip, linkMember, T, U, PID } from './helpers';
import worker from '../src/index';
import * as pushCron from '../src/notifications/push/cron';
import { sendDueReminders } from '../src/notifications/push/cron';
import { sendToSubscriptions } from '../src/notifications/push/dispatch';
import { getDb } from '@cc/api-db/client';
import { pushSubscriptions } from '@cc/api-db/schema';
import * as usage from '../src/ops/usage';
import * as feedback from '../src/feedback/deliver';
import * as loanReminders from '../src/notifications/cron/loanReminders';
import * as monthlyNotice from '../src/notifications/cron/monthlyNotice';
import * as syncPurge from '../src/personal/syncPurge';
import * as tripPurge from '../src/trips/purge';

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function rawPublicKey(): Promise<string> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return b64url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer));
}

async function setVapid(): Promise<void> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  (env as any).VAPID_PUBLIC_KEY = b64url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer));
  (env as any).VAPID_PRIVATE_KEY = jwk.d;
  (env as any).VAPID_SUBJECT = 'mailto:test@example.com';
}

async function seedSubscription(
  id: string,
  userId: string,
  endpoint: string,
  opts: { newSession?: number; sessionReminder?: number; lead?: number } = {},
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, new_session, session_reminder, reminder_lead_minutes, expense_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
  )
    .bind(
      id,
      userId,
      endpoint,
      await rawPublicKey(),
      b64url(crypto.getRandomValues(new Uint8Array(16))),
      opts.newSession ?? 1,
      opts.sessionReminder ?? 1,
      opts.lead ?? 30,
      '2026-11-13T00:00:00.000Z',
      '2026-11-13T00:00:00.000Z',
    )
    .run();
}

function stubFetch(statusFor: (url: string) => number = () => 201) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new Response(null, { status: statusFor(url) });
  });
}

function pushedTo(spy: ReturnType<typeof stubFetch>): string[] {
  return spy.mock.calls
    .map(([input]) => (typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url))
    .filter((url) => url.startsWith('https://fcm.googleapis.com/'));
}

async function seedPlannedSession(
  rootId: string,
  opts: {
    spentOn?: string;
    status?: 'approved' | 'completed' | 'deleted';
    description?: string;
    timeRange?: string;
    locationName?: string | null;
    participantId?: string;
  } = {},
): Promise<void> {
  const spentOn = opts.spentOn ?? '2026-11-14';
  const status = opts.status ?? 'approved';
  const description = opts.description ?? 'Cầu lông T5';
  const timeRange = opts.timeRange ?? '19:00 - 21:00';
  const location =
    opts.locationName === null
      ? null
      : { name: opts.locationName ?? 'Sân Phú Thọ', address: '219 Lý Thường Kiệt' };
  const pid = opts.participantId ?? PID.A;

  const metaJson = JSON.stringify({
    sport: {
      planning: true,
      location,
      courtSlots: [{ courtName: 'Sân 5', timeRange }],
      court: 100000,
      shuttlecocks: [],
      extra: 0,
      rule: 'equal',
      maleSlotRate: 0,
      femaleSlotRate: 0,
      entries: [{ participantId: pid, value: 0, maleSlots: 1, femaleSlots: 0 }],
    },
  });

  await env.DB.prepare(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description,
      amount, currency, spent_on, payer_id, split_mode, status,
      created_by_participant_id, meta_json, created_at, updated_at
    ) VALUES (?, ?, NULL, 1, ?, 'expense', ?, 0, 'VND', ?, ?, 'amounts', ?, ?, ?, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z')`,
  )
    .bind(rootId, rootId, T.tripId, description, spentOn, PID.M, status, PID.M, metaJson)
    .run();
}

async function seedReminder(
  id: string,
  subscriptionId: string,
  rootId: string,
  dueAt: string,
  sentAt: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, subscriptionId, rootId, T.tripId, dueAt, sentAt)
    .run();
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedTrip();
  await setVapid();
});

describe('Push reminder cron (sendDueReminders)', () => {
  it('sends a due reminder once', async () => {
    await linkMember(PID.A, U.an, 'An');
    await seedSubscription('sub-an-1', U.an, 'https://fcm.googleapis.com/fcm/send/an-phone', {
      sessionReminder: 1,
      lead: 30,
    });

    // Session starts at 19:00 ICT on 2026-11-14 -> 12:00 UTC
    await seedPlannedSession('sess-1', {
      spentOn: '2026-11-14',
      timeRange: '19:00 - 21:00',
      description: 'Cầu lông T5',
    });

    // Now is 11:30 UTC (30 mins before session start)
    const now = new Date('2026-11-14T11:30:00.000Z');
    // Due 1 min ago: 11:29 UTC
    const dueAt = new Date('2026-11-14T11:29:00.000Z').toISOString();
    await seedReminder('rem-1', 'sub-an-1', 'sess-1', dueAt, null);

    const fetchSpy = stubFetch();

    // First run -> should send
    await sendDueReminders(env, now);

    expect(pushedTo(fetchSpy)).toEqual(['https://fcm.googleapis.com/fcm/send/an-phone']);

    const row = await env.DB.prepare('SELECT sent_at FROM push_reminders WHERE id = ?')
      .bind('rem-1')
      .first<{ sent_at: string | null }>();
    expect(row?.sent_at).toBe(now.toISOString());

    // Second run -> should not send again
    fetchSpy.mockClear();
    await sendDueReminders(env, now);
    expect(pushedTo(fetchSpy)).toHaveLength(0);
  });

  it('skips a reminder for a completed session', async () => {
    await linkMember(PID.A, U.an, 'An');
    await seedSubscription('sub-an-2', U.an, 'https://fcm.googleapis.com/fcm/send/an-phone-2');

    await seedPlannedSession('sess-completed', {
      status: 'completed',
      spentOn: '2026-11-14',
      timeRange: '19:00 - 21:00',
    });

    const now = new Date('2026-11-14T11:30:00.000Z');
    const dueAt = new Date('2026-11-14T11:29:00.000Z').toISOString();
    await seedReminder('rem-2', 'sub-an-2', 'sess-completed', dueAt, null);

    const fetchSpy = stubFetch();
    await sendDueReminders(env, now);

    expect(pushedTo(fetchSpy)).toHaveLength(0);

    const row = await env.DB.prepare('SELECT sent_at FROM push_reminders WHERE id = ?')
      .bind('rem-2')
      .first<{ sent_at: string | null }>();
    expect(row?.sent_at).toBe(now.toISOString());
  });

  it('skips a reminder whose session start is already past', async () => {
    await linkMember(PID.A, U.an, 'An');
    await seedSubscription('sub-an-past', U.an, 'https://fcm.googleapis.com/fcm/send/an-past');

    // 05:00 - 07:00 ICT on 2026-11-14 is 2026-11-13T22:00:00Z UTC
    await seedPlannedSession('sess-past', {
      spentOn: '2026-11-14',
      timeRange: '05:00 - 07:00',
    });

    // Now is 2026-11-14T01:00:00Z (session start is in the past)
    const now = new Date('2026-11-14T01:00:00.000Z');
    const dueAt = new Date('2026-11-13T21:30:00.000Z').toISOString();
    await seedReminder('rem-past', 'sub-an-past', 'sess-past', dueAt, null);

    const fetchSpy = stubFetch();
    await sendDueReminders(env, now);

    expect(pushedTo(fetchSpy)).toHaveLength(0);

    const row = await env.DB.prepare('SELECT sent_at FROM push_reminders WHERE id = ?')
      .bind('rem-past')
      .first<{ sent_at: string | null }>();
    expect(row?.sent_at).toBe(now.toISOString());
  });

  it('does not send future reminders', async () => {
    await linkMember(PID.A, U.an, 'An');
    await seedSubscription('sub-an-3', U.an, 'https://fcm.googleapis.com/fcm/send/an-phone-3');

    await seedPlannedSession('sess-future', {
      spentOn: '2026-11-14',
      timeRange: '19:00 - 21:00',
    });

    const now = new Date('2026-11-14T11:30:00.000Z');
    // Future reminder: due at 11:35 UTC (5 mins in future)
    const dueAt = new Date('2026-11-14T11:35:00.000Z').toISOString();
    await seedReminder('rem-3', 'sub-an-3', 'sess-future', dueAt, null);

    const fetchSpy = stubFetch();
    await sendDueReminders(env, now);

    expect(pushedTo(fetchSpy)).toHaveLength(0);

    const row = await env.DB.prepare('SELECT sent_at FROM push_reminders WHERE id = ?')
      .bind('rem-3')
      .first<{ sent_at: string | null }>();
    expect(row?.sent_at).toBeNull();
  });

  it('empty run does one query', async () => {
    const now = new Date('2026-11-14T11:30:00.000Z');
    const prepareSpy = vi.spyOn(env.DB, 'prepare');

    await sendDueReminders(env, now);

    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });

  it('scheduled handler routes */5 to reminders only', async () => {
    const usageSpy = vi.spyOn(usage, 'checkUsage').mockResolvedValue(undefined as any);
    const feedbackSpy = vi.spyOn(feedback, 'retryUndeliveredFeedback').mockResolvedValue(undefined as any);
    const loanSpy = vi.spyOn(loanReminders, 'sendWeeklyLoanReminders').mockResolvedValue(undefined as any);
    const monthlySpy = vi.spyOn(monthlyNotice, 'sendMonthlyNotices').mockResolvedValue(undefined as any);
    const pushSpy = vi.spyOn(pushCron, 'sendDueReminders').mockResolvedValue(undefined);

    const waitUntilPromises: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: vi.fn((p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      }),
    } as unknown as ExecutionContext;

    // Trigger 5-minute cron
    await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(pushSpy).toHaveBeenCalled();
    expect(usageSpy).not.toHaveBeenCalled();
    expect(feedbackSpy).not.toHaveBeenCalled();
    expect(loanSpy).not.toHaveBeenCalled();
    expect(monthlySpy).not.toHaveBeenCalled();

    // Trigger hourly cron
    pushSpy.mockClear();
    waitUntilPromises.length = 0;
    await worker.scheduled({ cron: '0 * * * *' } as ScheduledController, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(pushSpy).not.toHaveBeenCalled();
    expect(usageSpy).toHaveBeenCalled();
    expect(feedbackSpy).toHaveBeenCalled();
    expect(loanSpy).toHaveBeenCalled();
    expect(monthlySpy).toHaveBeenCalled();
  });

  it('scheduled handler routes 30 * * * * exclusively to purgeDeletedGroups', async () => {
    const usageSpy = vi.spyOn(usage, 'checkUsage').mockResolvedValue(undefined as any);
    const feedbackSpy = vi.spyOn(feedback, 'retryUndeliveredFeedback').mockResolvedValue(undefined as any);
    const loanSpy = vi.spyOn(loanReminders, 'sendWeeklyLoanReminders').mockResolvedValue(undefined as any);
    const monthlySpy = vi.spyOn(monthlyNotice, 'sendMonthlyNotices').mockResolvedValue(undefined as any);
    const syncPurgeSpy = vi.spyOn(syncPurge, 'purgeSyncDeletions').mockResolvedValue(undefined);
    const pushSpy = vi.spyOn(pushCron, 'sendDueReminders').mockResolvedValue(undefined);
    const purgeSpy = vi.spyOn(tripPurge, 'purgeDeletedGroups').mockResolvedValue(undefined);

    const waitUntilPromises: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: vi.fn((p: Promise<unknown>) => {
        waitUntilPromises.push(p);
      }),
    } as unknown as ExecutionContext;

    // Trigger :30 purge cron
    await worker.scheduled({ cron: '30 * * * *' } as ScheduledController, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(purgeSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).toHaveBeenCalledWith(env, expect.any(Date));
    expect(pushSpy).not.toHaveBeenCalled();
    expect(usageSpy).not.toHaveBeenCalled();
    expect(feedbackSpy).not.toHaveBeenCalled();
    expect(loanSpy).not.toHaveBeenCalled();
    expect(monthlySpy).not.toHaveBeenCalled();
    expect(syncPurgeSpy).not.toHaveBeenCalled();

    // Verify 0 * * * * does NOT call purgeDeletedGroups
    purgeSpy.mockClear();
    waitUntilPromises.length = 0;
    await worker.scheduled({ cron: '0 * * * *' } as ScheduledController, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(purgeSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(usageSpy).toHaveBeenCalled();
    expect(loanSpy).toHaveBeenCalled();
    expect(monthlySpy).toHaveBeenCalled();
    expect(syncPurgeSpy).toHaveBeenCalled();

    // Verify */5 * * * * does NOT call purgeDeletedGroups
    purgeSpy.mockClear();
    usageSpy.mockClear();
    loanSpy.mockClear();
    monthlySpy.mockClear();
    syncPurgeSpy.mockClear();
    waitUntilPromises.length = 0;
    await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(purgeSpy).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalled();
    expect(loanSpy).not.toHaveBeenCalled();
    expect(monthlySpy).not.toHaveBeenCalled();
  });

  it('processes backlogs above 90 in batches without exceeding D1 param limits', async () => {
    await linkMember(PID.A, U.an, 'An');

    await seedPlannedSession('sess-batch', {
      spentOn: '2026-11-14',
      timeRange: '19:00 - 21:00',
      description: 'Cầu lông T5',
    });

    const now = new Date('2026-11-14T11:30:00.000Z');
    const dueAt = new Date('2026-11-14T11:29:00.000Z').toISOString();
    const pubKey = await rawPublicKey();
    const authKey = b64url(crypto.getRandomValues(new Uint8Array(16)));

    // Seed 95 due reminders with distinct subscriptions
    for (let i = 0; i < 95; i++) {
      const subId = `sub-batch-${i}`;
      const endpoint = `https://fcm.googleapis.com/fcm/send/batch-${i}`;
      await env.DB.prepare(
        'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, new_session, session_reminder, reminder_lead_minutes, expense_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 30, 1, ?, ?)',
      )
        .bind(subId, U.an, endpoint, pubKey, authKey, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z')
        .run();

      await seedReminder(`rem-batch-${i}`, subId, 'sess-batch', dueAt, null);
    }

    const fetchSpy = stubFetch();

    // Run sendDueReminders three times: 40 + 40 + 15 = 95
    await sendDueReminders(env, now);
    await sendDueReminders(env, now);
    await sendDueReminders(env, now);

    const unsent = await env.DB.prepare(
      'SELECT count(*) as count FROM push_reminders WHERE transaction_root_id = ? AND sent_at IS NULL',
    )
      .bind('sess-batch')
      .first<{ count: number }>();
    expect(unsent?.count).toBe(0);

    const sent = await env.DB.prepare(
      'SELECT count(*) as count FROM push_reminders WHERE transaction_root_id = ? AND sent_at IS NOT NULL',
    )
      .bind('sess-batch')
      .first<{ count: number }>();
    expect(sent?.count).toBe(95);

    expect(pushedTo(fetchSpy)).toHaveLength(95);
  });

  it('one cron run processes at most 40 rows and the rest go in the next run', async () => {
    await linkMember(PID.A, U.an, 'An');
    await seedPlannedSession('sess-cap-40', {
      spentOn: '2026-11-14',
      timeRange: '19:00 - 21:00',
      description: 'Cầu lông T5',
    });

    const now = new Date('2026-11-14T11:30:00.000Z');
    const dueAt = new Date('2026-11-14T11:29:00.000Z').toISOString();
    const pubKey = await rawPublicKey();
    const authKey = b64url(crypto.getRandomValues(new Uint8Array(16)));

    for (let i = 0; i < 45; i++) {
      const subId = `sub-cap-${i}`;
      const endpoint = `https://fcm.googleapis.com/fcm/send/cap-${i}`;
      await env.DB.prepare(
        'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, new_session, session_reminder, reminder_lead_minutes, expense_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 30, 1, ?, ?)',
      )
        .bind(subId, U.an, endpoint, pubKey, authKey, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z')
        .run();
      await seedReminder(`rem-cap-${i}`, subId, 'sess-cap-40', dueAt, null);
    }

    const fetchSpy = stubFetch();

    await sendDueReminders(env, now);
    expect(pushedTo(fetchSpy)).toHaveLength(40);
    const afterFirst = await env.DB.prepare(
      'SELECT count(*) as count FROM push_reminders WHERE transaction_root_id = ? AND sent_at IS NULL',
    )
      .bind('sess-cap-40')
      .first<{ count: number }>();
    expect(afterFirst?.count).toBe(5);

    await sendDueReminders(env, now);
    expect(pushedTo(fetchSpy)).toHaveLength(45);
    const afterSecond = await env.DB.prepare(
      'SELECT count(*) as count FROM push_reminders WHERE transaction_root_id = ? AND sent_at IS NULL',
    )
      .bind('sess-cap-40')
      .first<{ count: number }>();
    expect(afterSecond?.count).toBe(0);
  });

  it('sendToSubscriptions caps at 40 fetches per call and warns with skipped count without logging endpoints', async () => {
    await linkMember(PID.A, U.an, 'An');
    const pubKey = await rawPublicKey();
    const authKey = b64url(crypto.getRandomValues(new Uint8Array(16)));
    for (let i = 0; i < 45; i++) {
      await env.DB.prepare(
        'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, new_session, session_reminder, reminder_lead_minutes, expense_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 30, 1, ?, ?)',
      )
        .bind(`sub-disp-${i}`, U.an, `https://fcm.googleapis.com/fcm/send/disp-${i}`, pubKey, authKey, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z')
        .run();
    }

    const db = getDb(env);
    const subs = await db.select().from(pushSubscriptions);
    expect(subs.length).toBe(45);

    const fetchSpy = stubFetch();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await sendToSubscriptions(
      env,
      db,
      subs,
      { title: 'Test', body: 'Body', url: '/', tag: 'test' },
      { ttlSeconds: 60, urgency: 'normal' },
    );

    expect(pushedTo(fetchSpy)).toHaveLength(40);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnMsg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(warnMsg).toContain('5');
    expect(warnMsg).not.toContain('fcm.googleapis.com');
  });
});
