import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, linkMember, memberSid, T, U, PID } from './helpers';
import { expenseMessage } from '../src/notifications/push/messages';

const base = `/api/trips/${T.tripId}`;
const AN_PHONE = 'https://fcm.googleapis.com/fcm/send/an-phone';
const AN_TABLET = 'https://fcm.googleapis.com/fcm/send/an-tablet';
const MINH_PHONE = 'https://fcm.googleapis.com/fcm/send/minh-phone';

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

async function seedSubscription(id: string, userId: string, endpoint: string, expenseNew = 1): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, new_session, session_reminder, reminder_lead_minutes, expense_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 30, ?, ?, ?)',
  )
    .bind(id, userId, endpoint, await rawPublicKey(), b64url(crypto.getRandomValues(new Uint8Array(16))), expenseNew, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z')
    .run();
}

const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}`, 'Content-Type': 'application/json' });

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

const splitMinhAn = {
  description: 'Ăn tối',
  amount: 170000,
  spentOn: '2026-11-13',
  payerId: PID.M,
  mode: 'equal',
  entries: [
    { participantId: PID.M, value: 1 },
    { participantId: PID.A, value: 1 },
  ],
};

async function createExpense(body: unknown = splitMinhAn): Promise<string> {
  const res = await call(`${base}/expenses`, { method: 'POST', headers: await minh(), body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await json<{ expenseId: string }>(res)).expenseId;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedTrip();
  await linkMember(PID.A, U.an, 'An');
  await setVapid();
  await seedSubscription('s-minh', U.minh, MINH_PHONE);
  await seedSubscription('s-an', U.an, AN_PHONE);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (env as any).VAPID_PUBLIC_KEY;
  delete (env as any).VAPID_PRIVATE_KEY;
  delete (env as any).VAPID_SUBJECT;
});

describe('expense push', () => {
  it('new approved expense pushes to included members but not the actor', async () => {
    const spy = stubFetch();
    await createExpense();
    expect(pushedTo(spy)).toEqual([AN_PHONE]);
    const [, init] = spy.mock.calls.find(([input]) => String(input) === AN_PHONE)!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('TTL')).toBe('86400');
    expect(headers.get('Urgency')).toBe('normal');
    const row = await env.DB.prepare('SELECT last_success_at FROM push_subscriptions WHERE id = ?').bind('s-an').first<{ last_success_at: string | null }>();
    expect(row?.last_success_at).toBeTruthy();
  });

  it("no push when An's expenseNew is off", async () => {
    await env.DB.prepare('UPDATE push_subscriptions SET expense_new = 0 WHERE id = ?').bind('s-an').run();
    const spy = stubFetch();
    await createExpense();
    expect(pushedTo(spy)).toEqual([]);
  });

  it('no push for a payer with zero share', async () => {
    const spy = stubFetch();
    await createExpense({ ...splitMinhAn, payerId: PID.A, entries: [{ participantId: PID.M, value: 1 }] });
    expect(pushedTo(spy)).toEqual([]);
  });

  it('no push in a direct trip', async () => {
    await env.DB.prepare("UPDATE trips SET preset = 'direct' WHERE id = ?").bind(T.tripId).run();
    const spy = stubFetch();
    await createExpense();
    expect(pushedTo(spy)).toEqual([]);
  });

  it('no push without VAPID keys', async () => {
    delete (env as any).VAPID_PUBLIC_KEY;
    delete (env as any).VAPID_PRIVATE_KEY;
    const spy = stubFetch();
    await createExpense();
    expect(pushedTo(spy)).toEqual([]);
  });

  it('completing a planned session pushes the bill', async () => {
    await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
    const sport = {
      planning: true,
      courtSlots: [{ courtName: 'Sân 1', timeRange: '05:00 - 07:00' }],
      court: 100000,
      shuttlecocks: [],
      extra: 0,
      rule: { kind: 'equal' },
      entries: [
        { participantId: PID.M, maleSlots: 1, femaleSlots: 0 },
        { participantId: PID.A, maleSlots: 1, femaleSlots: 0 },
      ],
      maleSlotRate: 0,
      femaleSlotRate: 0,
    };
    const planning = {
      description: 'Cầu lông',
      amount: 0,
      spentOn: '2026-11-13',
      payerId: PID.M,
      mode: 'amounts',
      entries: [
        { participantId: PID.M, value: 0 },
        { participantId: PID.A, value: 0 },
      ],
      meta: { sport },
    };
    const spy = stubFetch();
    const expenseId = await createExpense(planning);
    expect(pushedTo(spy)).toEqual([]);

    const bill = {
      ...planning,
      amount: 100000,
      entries: [
        { participantId: PID.M, value: 50000 },
        { participantId: PID.A, value: 50000 },
      ],
      meta: { sport: { ...sport, planning: false, maleSlotRate: 50000 } },
    };
    const res = await call(`${base}/expenses/${expenseId}`, { method: 'PATCH', headers: await minh(), body: JSON.stringify(bill) });
    expect(res.status).toBe(200);
    expect(pushedTo(spy)).toEqual([AN_PHONE]);
  });

  it('gone subscription is removed and others still send', async () => {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind('s-an').run();
    await seedSubscription('s-an-1', U.an, AN_PHONE);
    await seedSubscription('s-an-2', U.an, AN_TABLET);
    const spy = stubFetch((url) => (url === AN_PHONE ? 410 : 201));
    await createExpense();
    expect(pushedTo(spy).sort()).toEqual([AN_PHONE, AN_TABLET].sort());
    const left = await env.DB.prepare('SELECT id FROM push_subscriptions WHERE user_id = ?').bind(U.an).all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(['s-an-2']);
  });
});

describe('expenseMessage', () => {
  it('expenseMessage formats share as 85.000₫', () => {
    expect(expenseMessage({ actorName: 'Minh', description: 'Ăn tối', groupName: 'Đà Lạt', share: 85000, tripId: 't', rootId: 'r' })).toEqual({
      title: 'Minh thêm Ăn tối · Đà Lạt',
      body: 'Phần của bạn 85.000₫',
      url: '/t/t/expenses/r',
      tag: 'expense:r',
    });
  });

  it('clips a long title to 100 characters', () => {
    const msg = expenseMessage({ actorName: 'Minh', description: 'x'.repeat(300), groupName: 'Đà Lạt', share: 85000, tripId: 't', rootId: 'r' });
    expect(msg.title).toHaveLength(100);
    expect(msg.title.endsWith('…')).toBe(true);
    expect(msg.title.startsWith('Minh thêm xxx')).toBe(true);
    expect(msg.body.length).toBeLessThanOrEqual(180);
  });
});
