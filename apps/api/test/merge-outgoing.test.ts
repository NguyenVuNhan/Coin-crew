import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { MeResponse } from '@fsl/core';
import { memberSid, call, json, cookiesFrom, cookieHeader, unsignedJwt } from './helpers';
import { safeReturnTo } from '../src/auth/routes';

const realFetch = globalThis.fetch;

function mockZaloFetch(
  profile: Record<string, unknown>,
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

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function mockGoogleToken(claims: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(GOOGLE_TOKEN_URL)) {
      return Response.json({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: unsignedJwt(claims),
      });
    }
    return realFetch(input, init);
  });
}

async function linkGoogle(
  sid: string | null,
  claims: Record<string, unknown>,
  intent = 'link',
  returnTo = '/trips',
) {
  const startHeaders: Record<string, string> = {};
  if (sid) {
    startHeaders.Cookie = `sid=${sid}`;
  }
  const start = await call(
    `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(intent)}`,
    { headers: startHeaders },
  );
  const startCookies = cookiesFrom(start);
  const location = start.headers.get('Location');
  const state = location ? (new URL(location).searchParams.get('state') ?? '') : '';

  mockGoogleToken(claims);

  const cbCookies: Record<string, string> = { ...startCookies };
  if (sid) {
    cbCookies.sid = sid;
  }
  const cb = await call(`/api/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, {
    headers: {
      Cookie: cookieHeader(cbCookies),
    },
  });

  return { start, cb };
}

async function linkZalo(
  sid: string | null,
  zaloId: string,
  intent = 'link',
  returnTo = '/trips',
  zaloName = 'Zalo Name',
) {
  const startHeaders: Record<string, string> = {};
  if (sid) {
    startHeaders.Cookie = `sid=${sid}`;
  }
  const start = await call(
    `/api/auth/zalo/start?returnTo=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(intent)}`,
    { headers: startHeaders },
  );
  const startCookies = cookiesFrom(start);
  const location = start.headers.get('Location');
  const state = location ? (new URL(location).searchParams.get('state') ?? '') : '';

  mockZaloFetch({
    id: zaloId,
    name: zaloName,
    picture: {
      data: {
        url: 'https://p.zalo/z.png',
      },
    },
  });

  const cbCookies: Record<string, string> = { ...startCookies };
  if (sid) {
    cbCookies.sid = sid;
  }
  const cb = await call(`/api/auth/zalo/callback?code=c&state=${encodeURIComponent(state)}`, {
    headers: {
      Cookie: cookieHeader(cbCookies),
    },
  });

  return { start, cb };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Merge request details and outgoing selection', () => {
  it('saves the other account name and the verified login on a new request', async () => {
    // Zalo case: user B 'u-b' named 'Noah Nguyen' owns zalo_sub z-9; A (memberSid('u-a','A')) runs linkZalo(sid,'z-9','link','/trips','Noah Zalo'); SELECT the account_merge_requests row (survivor u-a): other_name==='Noah Nguyen', identity_label==='Noah Zalo'.
    await env.DB.prepare(
      'INSERT INTO users (id, zalo_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b', 'z-9', 'Noah Nguyen', 0, '2026-10-12T00:00:00.000Z')
      .run();

    const sidA = await memberSid('u-a', 'A');
    const { cb: cbZalo } = await linkZalo(sidA, 'z-9', 'link', '/trips', 'Noah Zalo');
    expect(cbZalo.status).toBe(302);

    const zaloReq = await env.DB.prepare(
      'SELECT other_name, identity_label FROM account_merge_requests WHERE survivor_user_id = ?',
    )
      .bind('u-a')
      .first<{ other_name: string | null; identity_label: string | null }>();
    expect(zaloReq?.other_name).toBe('Noah Nguyen');
    expect(zaloReq?.identity_label).toBe('Noah Zalo');

    // Google case: user 'u-b2' with google_sub 'g-owned' named 'Gina Owner'; A2 (memberSid('u-a2','A2')) runs linkGoogle with claims {sub:'g-owned', email:'gina@example.com', name:'Gina G', email_verified:true}; row has other_name 'Gina Owner' and identity_label 'gina@example.com'.
    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b2', 'g-owned', 'Gina Owner', 0, '2026-10-12T00:00:00.000Z')
      .run();

    const sidA2 = await memberSid('u-a2', 'A2');
    const { cb: cbGoogle } = await linkGoogle(sidA2, {
      sub: 'g-owned',
      email: 'gina@example.com',
      name: 'Gina G',
      email_verified: true,
    });
    expect(cbGoogle.status).toBe(302);

    const googleReq = await env.DB.prepare(
      'SELECT other_name, identity_label FROM account_merge_requests WHERE survivor_user_id = ?',
    )
      .bind('u-a2')
      .first<{ other_name: string | null; identity_label: string | null }>();
    expect(googleReq?.other_name).toBe('Gina Owner');
    expect(googleReq?.identity_label).toBe('gina@example.com');
  });

  it('cancels the other pending requests for the same provider only', async () => {
    const sidA = await memberSid('u-a-t2', 'A');

    await env.DB.prepare(
      'INSERT INTO users (id, zalo_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b1-t2', 'z-b1-t2', 'B1', 0, '2026-10-12T00:00:00.000Z')
      .run();

    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b2-t2', 'g-b2-t2', 'B2', 0, '2026-10-12T00:00:00.000Z')
      .run();

    await env.DB.prepare(
      'INSERT INTO users (id, zalo_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b3-t2', 'z-b3', 'B3', 0, '2026-10-12T00:00:00.000Z')
      .run();

    const now = new Date().toISOString();
    const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString();

    // Pending Zalo request to B1
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-z-b1-t2',
        'u-a-t2',
        'u-b1-t2',
        'zalo',
        'z-b1-t2',
        'pending',
        now,
        in7Days,
        'B1',
        'Zalo B1',
        null,
      )
      .run();

    // Pending Google request to B2
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-g-b2-t2',
        'u-a-t2',
        'u-b2-t2',
        'google',
        'g-b2-t2',
        'pending',
        now,
        in7Days,
        'B2',
        'b2@example.com',
        null,
      )
      .run();

    const { cb } = await linkZalo(sidA, 'z-b3');
    expect(cb.status).toBe(302);

    // B1 request status 'cancelled'
    const b1Req = await env.DB.prepare('SELECT status FROM account_merge_requests WHERE id = ?')
      .bind('mr-z-b1-t2')
      .first<{ status: string }>();
    expect(b1Req?.status).toBe('cancelled');

    // B2 one still 'pending'
    const b2Req = await env.DB.prepare('SELECT status FROM account_merge_requests WHERE id = ?')
      .bind('mr-g-b2-t2')
      .first<{ status: string }>();
    expect(b2Req?.status).toBe('pending');

    // and exactly one new pending zalo request to B3
    const pendingZaloRequests = await env.DB.prepare(
      "SELECT id, merged_user_id, status FROM account_merge_requests WHERE survivor_user_id = ? AND provider = 'zalo' AND status = 'pending'",
    )
      .bind('u-a-t2')
      .all<{ id: string; merged_user_id: string; status: string }>();
    expect(pendingZaloRequests.results).toHaveLength(1);
    expect(pendingZaloRequests.results[0]?.merged_user_id).toBe('u-b3-t2');
  });

  it('returns the newest request per provider', async () => {
    const sidA = await memberSid('u-a-t3', 'A');

    await env.DB.prepare(
      'INSERT INTO users (id, zalo_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b-z-t3', 'z-b-t3', 'B Zalo', 0, '2026-10-12T00:00:00.000Z')
      .run();

    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b-g-t3', 'g-b-t3', 'B Google', 0, '2026-10-12T00:00:00.000Z')
      .run();

    const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString();

    // Zalo declined (created_at older)
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-z-declined-t3',
        'u-a-t3',
        'u-b-z-t3',
        'zalo',
        'z-b-t3',
        'declined',
        '2026-10-20T10:00:00.000Z',
        in7Days,
        'B Zalo',
        'Zalo Name',
        null,
      )
      .run();

    // Zalo pending (newer)
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-z-pending-t3',
        'u-a-t3',
        'u-b-z-t3',
        'zalo',
        'z-b-t3',
        'pending',
        '2026-10-20T11:00:00.000Z',
        in7Days,
        'B Zalo',
        'Zalo Name',
        null,
      )
      .run();

    // Google accepted
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-g-accepted-t3',
        'u-a-t3',
        'u-b-g-t3',
        'google',
        'g-b-t3',
        'accepted',
        '2026-10-20T12:00:00.000Z',
        in7Days,
        'B Google',
        'b@example.com',
        null,
      )
      .run();

    const res = await call('/api/me', { headers: { Cookie: `sid=${sidA}` } });
    expect(res.status).toBe(200);
    const body = await json<MeResponse>(res);

    expect(body.mergeRequests.outgoing).toHaveLength(2);
    const outgoingIds = body.mergeRequests.outgoing.map((r) => r.id);
    expect(outgoingIds).toContain('mr-z-pending-t3');
    expect(outgoingIds).toContain('mr-g-accepted-t3');
    expect(outgoingIds).not.toContain('mr-z-declined-t3');
  });

  it('leaves out dismissed and expired requests', async () => {
    const sidA = await memberSid('u-a-t4', 'A');

    await env.DB.prepare(
      'INSERT INTO users (id, google_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b-t4', 'g-b-t4', 'B4', 0, '2026-10-12T00:00:00.000Z')
      .run();

    const now = Date.now();
    const in7Days = new Date(now + 7 * 86_400_000).toISOString();
    const pastDate = new Date(now - 86_400_000).toISOString();
    const createdDate = new Date(now).toISOString();

    // One with dismissed_at set
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-dismissed-t4',
        'u-a-t4',
        'u-b-t4',
        'google',
        'g-b-t4',
        'declined',
        createdDate,
        in7Days,
        'B4',
        'b4@example.com',
        '2026-10-21T00:00:00.000Z',
      )
      .run();

    // One expired (expires_at in the past)
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-expired-t4',
        'u-a-t4',
        'u-b-t4',
        'google',
        'g-b-t4',
        'pending',
        createdDate,
        pastDate,
        'B4',
        'b4@example.com',
        null,
      )
      .run();

    // One valid google
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-valid-t4',
        'u-a-t4',
        'u-b-t4',
        'google',
        'g-b-t4',
        'pending',
        createdDate,
        in7Days,
        'B4',
        'b4@example.com',
        null,
      )
      .run();

    const res = await call('/api/me', { headers: { Cookie: `sid=${sidA}` } });
    expect(res.status).toBe(200);
    const body = await json<MeResponse>(res);

    expect(body.mergeRequests.outgoing).toHaveLength(1);
    expect(body.mergeRequests.outgoing[0]?.id).toBe('mr-valid-t4');
  });

  it('falls back for requests without saved details', async () => {
    const sidA = await memberSid('u-a-t5', 'A');

    await env.DB.prepare(
      'INSERT INTO users (id, zalo_sub, name, custom_profile, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind('u-b-t5', 'z-b-t5', 'Bee', 0, '2026-10-12T00:00:00.000Z')
      .run();

    const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await env.DB.prepare(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, other_name, identity_label, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'mr-fallback-t5',
        'u-a-t5',
        'u-b-t5',
        'zalo',
        'z-b-t5',
        'pending',
        new Date().toISOString(),
        in7Days,
        null,
        null,
        null,
      )
      .run();

    const res1 = await call('/api/me', { headers: { Cookie: `sid=${sidA}` } });
    expect(res1.status).toBe(200);
    const body1 = await json<MeResponse>(res1);

    expect(body1.mergeRequests.outgoing).toHaveLength(1);
    const req1 = body1.mergeRequests.outgoing[0];
    expect(req1?.otherName).toBe('Bee');
    expect(req1?.identityLabel).toBe('Zalo');
    expect(typeof req1?.otherName).toBe('string');
    expect(typeof req1?.identityLabel).toBe('string');

    await env.DB.prepare('PRAGMA foreign_keys = OFF').run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind('u-b-t5').run();

    const res2 = await call('/api/me', { headers: { Cookie: `sid=${sidA}` } });
    expect(res2.status).toBe(200);
    const body2 = await json<MeResponse>(res2);

    expect(body2.mergeRequests.outgoing).toHaveLength(1);
    const req2 = body2.mergeRequests.outgoing[0];
    expect(req2?.otherName).toBe('Zalo');
    expect(req2?.identityLabel).toBe('Zalo');
    expect(typeof req2?.otherName).toBe('string');
    expect(typeof req2?.identityLabel).toBe('string');
  });

  it('keeps mergeReview in the return address', () => {
    expect(safeReturnTo('/trips?mergeReview=mr-1')).toBe('/trips?mergeReview=mr-1');
  });
});
