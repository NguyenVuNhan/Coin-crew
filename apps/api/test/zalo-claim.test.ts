import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, cookiesFrom, cookieHeader, linkMember, memberSid, newDevice, pickAs, PID, seedTrip, T, U } from './helpers';
import { getDb } from '@cc/api-db/client';
import { requestClaim } from '@cc/api-auth/identity';

const realFetch = globalThis.fetch;

const DEFAULT_PROFILE = {
  id: '84123',
  name: 'Minh Zalo',
  picture: {
    data: {
      url: 'https://p.zalo/m.png',
    },
  },
};

function mockZaloFetch(
  profile: Record<string, unknown> = DEFAULT_PROFILE,
  tokenResponse: Record<string, unknown> = { access_token: 'at' },
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://oauth.zaloapp.com/v4/access_token')) {
      return Response.json(tokenResponse);
    }
    if (url.startsWith('https://graph.zalo.me/v2.0/me')) {
      return Response.json(profile);
    }
    return realFetch(input, init);
  });
}

async function claimViaZalo(
  opts: {
    trip?: string;
    pid?: string;
    returnTo?: string;
    profile?: Record<string, unknown>;
    extraCookies?: Record<string, string>;
    callbackQuery?: string;
  } = {},
) {
  const {
    trip = T.tripId,
    pid = PID.M,
    returnTo = `/t/${T.groupToken}`,
    profile = DEFAULT_PROFILE,
    extraCookies = {},
    callbackQuery = '',
  } = opts;

  const params = new URLSearchParams({ intent: 'claim', returnTo });
  if (trip) params.set('trip', trip);
  if (pid) params.set('pid', pid);

  const start = await call(`/api/auth/zalo/start?${params.toString()}`, {
    headers: Object.keys(extraCookies).length
      ? { Cookie: cookieHeader(extraCookies) }
      : undefined,
  });
  const startCookies = cookiesFrom(start);
  const location = start.headers.get('Location');
  const state = location ? (new URL(location).searchParams.get('state') ?? '') : '';
  mockZaloFetch(profile);
  const extra = callbackQuery ? `&${callbackQuery}` : '';
  const cb = await call(`/api/auth/zalo/callback?code=c&state=${state}${extra}`, {
    headers: {
      Cookie: cookieHeader({ ...startCookies, ...extraCookies }),
    },
  });
  return { start, startCookies, cb, sid: cookiesFrom(cb).sid };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Zalo claim merge request', () => {
  it('claim=requested sets a session cookie for the Zalo user and creates one pending merge request row', async () => {
    await seedTrip();
    const existingSid = await memberSid('u-other', 'Other');

    const { start, cb, sid } = await claimViaZalo({
      trip: T.tripId,
      pid: PID.M,
      returnTo: `/t/${T.groupToken}`,
      extraCookies: { sid: existingSid },
    });

    const cookieLines = start.headers.getSetCookie();
    const claimCookieLine = cookieLines.find((l) => l.trim().startsWith('zalo_oauth_claim='));
    expect(claimCookieLine).toBeDefined();
    expect(claimCookieLine).toContain('HttpOnly');
    expect(claimCookieLine).toContain('Secure');
    expect(claimCookieLine).toContain('SameSite=Lax');
    expect(claimCookieLine).toContain('Max-Age=600');

    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=requested`);
    expect(sid).toBeTruthy();
    expect(sid).not.toBe(existingSid);

    const cbCookies = cookiesFrom(cb);
    expect(cbCookies.zalo_oauth_claim).toBe('');

    const zaloUser = await env.DB.prepare(
      "SELECT id, zalo_sub, zalo_name, name FROM users WHERE zalo_sub = '84123'",
    ).first<{ id: string; zalo_sub: string; zalo_name: string | null; name: string }>();
    expect(zaloUser).toBeDefined();

    const rows = await env.DB.prepare(
      'SELECT * FROM account_merge_requests',
    ).all<{
      id: string;
      survivor_user_id: string;
      merged_user_id: string;
      provider: string;
      provider_sub: string;
      status: string;
      created_at: string;
      expires_at: string;
      other_name: string | null;
      identity_label: string | null;
      initiated_by: string;
      claim_trip_id: string | null;
      claim_participant_id: string | null;
    }>();

    expect(rows.results).toHaveLength(1);
    const row = rows.results[0]!;
    expect(row).toMatchObject({
      survivor_user_id: U.minh,
      merged_user_id: zaloUser!.id,
      provider: 'zalo',
      provider_sub: '84123',
      status: 'pending',
      other_name: 'Minh',
      identity_label: 'Minh Zalo',
      initiated_by: 'merged',
      claim_trip_id: T.tripId,
      claim_participant_id: PID.M,
    });
    const ttlMs = Date.parse(row.expires_at) - Date.parse(row.created_at);
    expect(ttlMs).toBe(7 * 86400000);
  });

  it('a second claim by the same Zalo user for another member cancels the first row', async () => {
    await seedTrip();
    await linkMember(PID.A, U.an, 'An');

    await claimViaZalo({ trip: T.tripId, pid: PID.M });
    const { cb } = await claimViaZalo({ trip: T.tripId, pid: PID.A });
    expect(cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=requested`);

    const rows = await env.DB.prepare(
      'SELECT survivor_user_id, claim_participant_id, status, decided_at FROM account_merge_requests ORDER BY created_at ASC, rowid ASC',
    ).all<{
      survivor_user_id: string;
      claim_participant_id: string;
      status: string;
      decided_at: string | null;
    }>();

    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]).toMatchObject({
      survivor_user_id: U.minh,
      claim_participant_id: PID.M,
      status: 'cancelled',
    });
    expect(rows.results[0]!.decided_at).toBeTruthy();
    expect(rows.results[1]).toMatchObject({
      survivor_user_id: U.an,
      claim_participant_id: PID.A,
      status: 'pending',
      decided_at: null,
    });
  });

  it('two different Zalo users claiming the same member leave two pending rows', async () => {
    await seedTrip();

    await claimViaZalo({
      trip: T.tripId,
      pid: PID.M,
      profile: { id: '84111', name: 'Zalo One' },
    });
    await claimViaZalo({
      trip: T.tripId,
      pid: PID.M,
      profile: { id: '84222', name: 'Zalo Two' },
    });

    const rows = await env.DB.prepare(
      'SELECT provider_sub, status, survivor_user_id FROM account_merge_requests ORDER BY provider_sub ASC',
    ).all<{ provider_sub: string; status: string; survivor_user_id: string }>();

    expect(rows.results).toEqual([
      { provider_sub: '84111', status: 'pending', survivor_user_id: U.minh },
      { provider_sub: '84222', status: 'pending', survivor_user_id: U.minh },
    ]);
  });

  it('claim=self when the participant already belongs to the Zalo user', async () => {
    await seedTrip();
    const { sid } = await claimViaZalo({ trip: T.tripId, pid: PID.A });
    expect(sid).toBeTruthy();

    const zaloUser = await env.DB.prepare(
      "SELECT id FROM users WHERE zalo_sub = '84123'",
    ).first<{ id: string }>();
    await env.DB.prepare('UPDATE participants SET user_id = ? WHERE id = ?')
      .bind(zaloUser!.id, PID.A)
      .run();

    const { cb } = await claimViaZalo({ trip: T.tripId, pid: PID.A });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=self`);

    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM account_merge_requests',
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('claim=incoming when a pending unexpired survivor-initiated request already exists', async () => {
    await seedTrip();
    // Sign in once to create the Zalo user row.
    await claimViaZalo({ trip: T.tripId, pid: PID.A });
    const zaloUser = await env.DB.prepare(
      "SELECT id FROM users WHERE zalo_sub = '84123'",
    ).first<{ id: string }>();

    await env.DB.prepare(
      `INSERT INTO account_merge_requests
        (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, initiated_by)
       VALUES (?, ?, ?, 'zalo', '84123', 'pending', '2026-10-12T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 'Minh Zalo', 'Minh Zalo', 'survivor')`,
    )
      .bind('req-surv-1', U.minh, zaloUser!.id)
      .run();

    const directOutcome = await requestClaim(getDb(env), zaloUser!.id, {
      tripId: T.tripId,
      participantId: PID.M,
    });
    expect(directOutcome).toEqual({ result: 'incoming', requestId: 'req-surv-1' });

    const { cb } = await claimViaZalo({ trip: T.tripId, pid: PID.M });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=incoming`);

    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM account_merge_requests',
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('claim=taken when the participant user already has a zaloSub and creates no row', async () => {
    await seedTrip();
    await env.DB.prepare("UPDATE users SET zalo_sub = '84999' WHERE id = ?").bind(U.minh).run();

    const { cb, sid } = await claimViaZalo({ trip: T.tripId, pid: PID.M });
    expect(cb.status).toBe(302);
    expect(cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=taken`);
    expect(sid).toBeTruthy();

    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM account_merge_requests',
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('claim=invalid for a guest participant, non-active participant, or wrong trip', async () => {
    await seedTrip();

    // Guest participant (userId is null)
    const guestRes = await claimViaZalo({ trip: T.tripId, pid: PID.A });
    expect(guestRes.cb.status).toBe(302);
    expect(guestRes.cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=invalid`);
    expect(guestRes.sid).toBeTruthy();

    // Non-existent participant in trip
    const wrongTripRes = await claimViaZalo({ trip: 'other-trip', pid: PID.M });
    expect(wrongTripRes.cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=invalid`);

    // Inactive participant
    await linkMember(PID.B, U.an, 'Bình');
    await env.DB.prepare("UPDATE participants SET status = 'left' WHERE id = ?").bind(PID.B).run();
    const leftRes = await claimViaZalo({ trip: T.tripId, pid: PID.B });
    expect(leftRes.cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=invalid`);

    const count = await env.DB.prepare(
      'SELECT count(*) AS n FROM account_merge_requests',
    ).first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('treats missing trip or pid on start as signin and reads claim from cookie only on callback', async () => {
    await seedTrip();

    // Missing pid -> treated as signin, no zalo_oauth_claim cookie, redirects without ?claim=
    const { start, startCookies, cb } = await claimViaZalo({
      trip: T.tripId,
      pid: '',
      returnTo: `/t/${T.groupToken}`,
      callbackQuery: `trip=${T.tripId}&pid=${PID.M}`,
    });
    expect(startCookies.zalo_oauth_claim).toBeUndefined();
    expect(startCookies.zalo_oauth_intent).toBe('signin');
    expect(start.status).toBe(302);
    expect(cb.headers.get('Location')).toBe(`/t/${T.groupToken}`);

    // Callback ignores query params and uses only the cookie
    const claimRun = await claimViaZalo({
      trip: T.tripId,
      pid: PID.A, // guest -> invalid in cookie
      returnTo: `/t/${T.groupToken}`,
      callbackQuery: `trip=${T.tripId}&pid=${PID.M}`, // active member in query params (must be ignored)
    });
    expect(claimRun.cb.headers.get('Location')).toBe(`/t/${T.groupToken}?claim=invalid`);
  });

  it("forgets the device's guest pick in that trip, so the claimed person isn't shown as someone else again", async () => {
    await seedTrip();
    const dev = await newDevice();
    await pickAs(dev.deviceId, PID.A);
    const { cb } = await claimViaZalo({ extraCookies: { did: dev.deviceId } });
    expect(cb.status).toBe(302);
    const left = await env.DB.prepare('SELECT count(*) AS n FROM device_participants WHERE trip_id = ?')
      .bind(T.tripId)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
