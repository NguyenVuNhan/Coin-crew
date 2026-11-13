import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, linkMember, memberSid, T, U, PID } from './helpers';
import { newSessionMessage, changedSessionMessage, reminderMessage } from '../src/notifications/push/messages';

const base = `/api/trips/${T.tripId}`;
const MINH_PHONE = 'https://fcm.googleapis.com/fcm/send/minh-phone';
const AN_PHONE = 'https://fcm.googleapis.com/fcm/send/an-phone';
const AN_TABLET = 'https://fcm.googleapis.com/fcm/send/an-tablet';
const BINH_PHONE = 'https://fcm.googleapis.com/fcm/send/binh-phone';
const U_BINH = 'u-binh';

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

const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}`, 'Content-Type': 'application/json' });
const an = async () => ({ Cookie: `sid=${await memberSid(U.an, 'An')}`, 'Content-Type': 'application/json' });

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

function plannedSessionInput(
  opts: {
    spentOn?: string;
    timeRange?: string;
    locationName?: string | null;
    participants?: string[];
  } = {},
) {
  const pids = opts.participants ?? [PID.M, PID.A];
  const spentOn = opts.spentOn ?? '2099-11-14';
  const timeRange = opts.timeRange ?? '05:00 - 07:00';
  const location =
    opts.locationName === null
      ? null
      : { name: opts.locationName ?? 'Sân Phú Thọ', address: '219 Lý Thường Kiệt' };
  return {
    description: 'Cầu lông T5',
    amount: 0,
    spentOn,
    payerId: PID.M,
    mode: 'amounts',
    entries: pids.map((participantId) => ({ participantId, value: 0 })),
    meta: {
      sport: {
        planning: true,
        location,
        courtSlots: [{ courtName: 'Sân 5', timeRange }],
        court: 100000,
        shuttlecocks: [],
        extra: 0,
        rule: { kind: 'equal' },
        entries: pids.map((participantId) => ({ participantId, maleSlots: 1, femaleSlots: 0 })),
        maleSlotRate: 0,
        femaleSlotRate: 0,
      },
    },
  };
}

async function createSession(body: unknown = plannedSessionInput()): Promise<string> {
  const res = await call(`${base}/expenses`, { method: 'POST', headers: await minh(), body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await json<{ expenseId: string }>(res)).expenseId;
}

async function patchSession(id: string, body: unknown): Promise<{ expenseId: string; rootId: string }> {
  const res = await call(`${base}/expenses/${id}`, { method: 'PATCH', headers: await minh(), body: JSON.stringify(body) });
  expect(res.status).toBe(200);
  return json<{ expenseId: string; rootId: string }>(res);
}

async function remindersForRoot(rootId: string): Promise<{ subscription_id: string; due_at: string; sent_at: string | null }[]> {
  const rows = await env.DB.prepare(
    'SELECT subscription_id, due_at, sent_at FROM push_reminders WHERE transaction_root_id = ? ORDER BY subscription_id',
  )
    .bind(rootId)
    .all<{ subscription_id: string; due_at: string; sent_at: string | null }>();
  return rows.results;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedTrip();
  await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
  await linkMember(PID.A, U.an, 'An');
  await linkMember(PID.B, U_BINH, 'Bình');
  await setVapid();
  await seedSubscription('s-minh', U.minh, MINH_PHONE);
  await seedSubscription('s-an', U.an, AN_PHONE);
  await seedSubscription('s-binh', U_BINH, BINH_PHONE);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (env as any).VAPID_PUBLIC_KEY;
  delete (env as any).VAPID_PRIVATE_KEY;
  delete (env as any).VAPID_SUBJECT;
});

describe('session push and reminders', () => {
  it('planning a session pushes everyone on the list except the actor', async () => {
    const spy = stubFetch();
    const rootId = await createSession(plannedSessionInput({ participants: [PID.M, PID.A] }));
    expect(pushedTo(spy)).toEqual([AN_PHONE]);
    const rows = await remindersForRoot(rootId);
    // Both actor (Minh) and An get a reminder row
    expect(rows.map((r) => r.subscription_id)).toEqual(['s-an', 's-minh']);
    // 2099-11-14 05:00 UTC+7 = 2099-11-13T22:00:00.000Z; minus 30m = 2099-11-13T21:30:00.000Z
    expect(rows[0]!.due_at).toBe('2099-11-13T21:30:00.000Z');
  });

  it('adding a person to a planned session pushes only the newcomer', async () => {
    const spy = stubFetch();
    const rootId = await createSession(plannedSessionInput({ participants: [PID.M, PID.A] }));
    spy.mockClear();

    await patchSession(rootId, plannedSessionInput({ participants: [PID.M, PID.A, PID.B] }));
    expect(pushedTo(spy)).toEqual([BINH_PHONE]);
    const rows = await remindersForRoot(rootId);
    expect(rows.map((r) => r.subscription_id)).toEqual(['s-an', 's-binh', 's-minh']);
  });

  it('removing a person sends nothing and drops their reminder', async () => {
    const spy = stubFetch();
    const rootId = await createSession(plannedSessionInput({ participants: [PID.M, PID.A, PID.B] }));
    spy.mockClear();

    await patchSession(rootId, plannedSessionInput({ participants: [PID.M, PID.A] }));
    expect(pushedTo(spy)).toEqual([]);
    const rows = await remindersForRoot(rootId);
    expect(rows.map((r) => r.subscription_id)).toEqual(['s-an', 's-minh']);
  });

  it('changing the time pushes "đổi giờ" and moves the reminder', async () => {
    const spy = stubFetch();
    const rootId = await createSession(plannedSessionInput({ timeRange: '05:00 - 07:00', participants: [PID.M, PID.A] }));
    const before = await remindersForRoot(rootId);
    expect(before[0]!.due_at).toBe('2099-11-13T21:30:00.000Z');
    spy.mockClear();

    await patchSession(rootId, plannedSessionInput({ timeRange: '07:00 - 09:00', participants: [PID.M, PID.A] }));
    expect(pushedTo(spy)).toEqual([AN_PHONE]);
    const after = await remindersForRoot(rootId);
    expect(after[0]!.due_at).toBe('2099-11-13T23:30:00.000Z');
  });

  it("reminder row uses each device's lead time", async () => {
    await seedSubscription('s-an-tablet', U.an, AN_TABLET, { lead: 120 });
    const spy = stubFetch();
    const rootId = await createSession(plannedSessionInput({ timeRange: '05:00 - 07:00', participants: [PID.M, PID.A] }));
    expect(pushedTo(spy).sort()).toEqual([AN_PHONE, AN_TABLET].sort());
    const rows = await remindersForRoot(rootId);
    const anPhone = rows.find((r) => r.subscription_id === 's-an')!;
    const anTablet = rows.find((r) => r.subscription_id === 's-an-tablet')!;
    expect(anPhone.due_at).toBe('2099-11-13T21:30:00.000Z');
    expect(anTablet.due_at).toBe('2099-11-13T20:00:00.000Z');
  });

  it('rebuild drops reminders when the time no longer parses', async () => {
    stubFetch();
    const rootId = await createSession(plannedSessionInput({ timeRange: '05:00 - 07:00' }));
    expect(await remindersForRoot(rootId)).toHaveLength(2);

    await patchSession(rootId, plannedSessionInput({ timeRange: 'tối muộn' }));
    expect(await remindersForRoot(rootId)).toEqual([]);
  });

  it('completing, deleting or disabling removes unsent reminders', async () => {
    stubFetch();
    // 1. Completing
    const completeRoot = await createSession(plannedSessionInput());
    expect(await remindersForRoot(completeRoot)).toHaveLength(2);
    const bill = {
      description: 'Cầu lông T5',
      amount: 100000,
      spentOn: '2099-11-14',
      payerId: PID.M,
      mode: 'amounts',
      entries: [
        { participantId: PID.M, value: 50000 },
        { participantId: PID.A, value: 50000 },
      ],
      meta: {
        sport: {
          planning: false,
          courtSlots: [{ courtName: 'Sân 5', timeRange: '05:00 - 07:00' }],
          court: 100000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [
            { participantId: PID.M, maleSlots: 1, femaleSlots: 0 },
            { participantId: PID.A, maleSlots: 1, femaleSlots: 0 },
          ],
          maleSlotRate: 50000,
          femaleSlotRate: 0,
        },
      },
    };
    await patchSession(completeRoot, bill);
    expect(await remindersForRoot(completeRoot)).toEqual([]);

    // 2. Disabling
    const disableRoot = await createSession(plannedSessionInput());
    expect(await remindersForRoot(disableRoot)).toHaveLength(2);
    const disRes = await call(`${base}/expenses/${disableRoot}/disable`, { method: 'POST', headers: await minh() });
    expect(disRes.status).toBe(204);
    expect(await remindersForRoot(disableRoot)).toEqual([]);

    // 3. Deleting
    const deleteRoot = await createSession(plannedSessionInput());
    expect(await remindersForRoot(deleteRoot)).toHaveLength(2);
    const delRes = await call(`${base}/expenses/${deleteRoot}`, { method: 'DELETE', headers: await minh() });
    expect(delRes.status).toBe(204);
    expect(await remindersForRoot(deleteRoot)).toEqual([]);
  });

  it('enable re-creates reminders; rollback to an older time rebuilds reminders', async () => {
    const spy = stubFetch();
    const rootId = await createSession(plannedSessionInput({ timeRange: '05:00 - 07:00' }));
    expect(await remindersForRoot(rootId)).toHaveLength(2);

    // Disable -> Enable
    await call(`${base}/expenses/${rootId}/disable`, { method: 'POST', headers: await minh() });
    expect(await remindersForRoot(rootId)).toEqual([]);
    spy.mockClear();
    const enRes = await call(`${base}/expenses/${rootId}/enable`, { method: 'POST', headers: await minh() });
    expect(enRes.status).toBe(204);
    expect(pushedTo(spy)).toEqual([AN_PHONE]);
    expect(await remindersForRoot(rootId)).toHaveLength(2);

    // Edit time, then rollback to rootId (which is the older version with 05:00 - 07:00)
    await patchSession(rootId, plannedSessionInput({ timeRange: '08:00 - 10:00' }));
    expect((await remindersForRoot(rootId))[0]!.due_at).toBe('2099-11-14T00:30:00.000Z');
    spy.mockClear();

    const rbRes = await call(`${base}/expenses/${rootId}/rollback`, {
      method: 'POST',
      headers: await minh(),
      body: JSON.stringify({ targetHistoryId: rootId }),
    });
    expect(rbRes.status).toBe(200);
    expect(pushedTo(spy)).toEqual([AN_PHONE]);
    expect((await remindersForRoot(rootId))[0]!.due_at).toBe('2099-11-13T21:30:00.000Z');
  });

  it('no reminder when due time already passed', async () => {
    stubFetch();
    const rootId = await createSession(plannedSessionInput({ spentOn: '2020-01-01', timeRange: '05:00 - 07:00' }));
    expect(await remindersForRoot(rootId)).toEqual([]);
  });

  it('rebuildRemindersForSubscription follows a lead change', async () => {
    stubFetch();
    const rootId = await createSession(plannedSessionInput({ timeRange: '05:00 - 07:00', participants: [PID.M, PID.A] }));
    const before = (await remindersForRoot(rootId)).find((r) => r.subscription_id === 's-an')!;
    expect(before.due_at).toBe('2099-11-13T21:30:00.000Z');

    const res = await call('/api/push/subscription', {
      method: 'PATCH',
      headers: await an(),
      body: JSON.stringify({ endpoint: AN_PHONE, reminderLeadMinutes: 60 }),
    });
    expect(res.status).toBe(200);

    const after = (await remindersForRoot(rootId)).find((r) => r.subscription_id === 's-an')!;
    expect(after.due_at).toBe('2099-11-13T21:00:00.000Z');
  });

  it('PUT subscription back-fills reminders for already-planned sessions and skips direct trips', async () => {
    const spy = stubFetch();
    const rootId = await createSession(plannedSessionInput({ timeRange: '05:00 - 07:00', participants: [PID.M, PID.A] }));
    const newEp = 'https://fcm.googleapis.com/fcm/send/an-new-phone';
    const putRes = await call('/api/push/subscription', {
      method: 'PUT',
      headers: await an(),
      body: JSON.stringify({
        endpoint: newEp,
        keys: { p256dh: await rawPublicKey(), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
      }),
    });
    expect(putRes.status).toBe(200);
    const subRow = await env.DB.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').bind(newEp).first<{ id: string }>();
    const rows = await remindersForRoot(rootId);
    expect(rows.some((r) => r.subscription_id === subRow!.id)).toBe(true);

    // Direct trip skips both session push and reminders
    await env.DB.prepare("UPDATE trips SET preset = 'direct' WHERE id = ?").bind(T.tripId).run();
    spy.mockClear();
    const directRoot = await createSession(plannedSessionInput({ timeRange: '05:00 - 07:00', participants: [PID.M, PID.A] }));
    expect(pushedTo(spy)).toEqual([]);
    expect(await remindersForRoot(directRoot)).toEqual([]);
  });
});

describe('session and reminder messages', () => {
  it('reminderMessage formats lead time and body', () => {
    const msg = reminderMessage({
      description: 'Cầu lông T5',
      leadMinutes: 30,
      locationName: 'Sân Phú Thọ',
      courts: 'Sân 5, Sân 6',
      timeRange: '19:00 - 21:00',
      tripId: 't-1',
      rootId: 'r-1',
    });
    expect(msg).toEqual({
      title: 'Còn 30 phút nữa: Cầu lông T5',
      body: 'Sân Phú Thọ · Sân 5, Sân 6 · 19:00 - 21:00',
      url: '/t/t-1/expenses/r-1',
      tag: 'reminder:r-1',
    });
  });

  it('newSessionMessage formats weekday in UTC+7 and omits zero gender counts', () => {
    // 2026-11-13T22:00:00.000Z is 2026-11-14 05:00 in UTC+7 (Saturday = thứ Bảy)
    const msg = newSessionMessage({
      description: 'Cầu lông T5',
      locationName: 'Sân Phú Thọ',
      startUtc: '2026-11-13T22:00:00.000Z',
      male: 4,
      female: 2,
      tripId: 't-1',
      rootId: 'r-1',
    });
    expect(msg).toEqual({
      title: 'Cầu lông T5 · bạn có tên',
      body: 'Sân Phú Thọ · 05:00 thứ Bảy · 4 Nam, 2 Nữ',
      url: '/t/t-1/expenses/r-1',
      tag: 'session:r-1',
    });

    const maleOnly = newSessionMessage({
      description: 'Cầu lông T5',
      locationName: null,
      startUtc: null,
      male: 3,
      female: 0,
      tripId: 't-1',
      rootId: 'r-1',
    });
    expect(maleOnly.body).toBe('3 Nam');
  });

  it('changedSessionMessage formats title and location/time body', () => {
    const msg = changedSessionMessage({
      description: 'Cầu lông T5',
      locationName: 'Sân Phú Thọ',
      startUtc: '2026-11-13T22:00:00.000Z',
      tripId: 't-1',
      rootId: 'r-1',
    });
    expect(msg).toEqual({
      title: 'Cầu lông T5 đổi giờ hoặc địa điểm',
      body: 'Sân Phú Thọ · 05:00 thứ Bảy',
      url: '/t/t-1/expenses/r-1',
      tag: 'session:r-1',
    });
  });
});
