import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import type { MeResponse } from '@fsl/core';
import { app, call, json } from './helpers';
import { sha256Hex } from '../src/lib/ids';
import { getDb } from '../src/db/client';
import { accountMergeRequests } from '../src/db/schema';
import { upsertIdentity } from '../src/auth/identity';
import { mergeUsers } from '../src/auth/mergeUsers';

const CREATED = '2026-10-12T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addSession(sid: string, userId: string): Promise<void> {
  await run(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
    await sha256Hex(sid),
    userId,
    '2099-01-01T00:00:00.000Z',
  );
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function row<T>(query: string, ...binds: unknown[]): Promise<T | null> {
  return env.DB.prepare(query).bind(...binds).first<T>();
}

function post(path: string, sid?: string): Promise<Response> {
  return call(path, { method: 'POST', headers: sid ? { Cookie: `sid=${sid}` } : {} });
}

const accept = (id: string, sid?: string) => post(`/api/me/merge-requests/${id}/accept`, sid);
const decline = (id: string, sid?: string) => post(`/api/me/merge-requests/${id}/decline`, sid);
const cancel = (id: string, sid?: string) => post(`/api/me/merge-requests/${id}/cancel`, sid);

/**
 * A D1 binding whose per-invocation query budget runs out right after the merge's phase-1 batch
 * (the batch that deletes the merged user): every later prepare or batch throws, as D1 does past its limit.
 */
function budgetSpentAfterPhase1(real: D1Database): D1Database {
  let deletesUser = false;
  let spent = false;
  const guard = (): void => {
    if (spent) throw new Error('Too many API requests by single worker invocation.');
  };
  const wrapped = {
    prepare(query: string): D1PreparedStatement {
      guard();
      if (/^delete from "users"/i.test(query)) deletesUser = true;
      return real.prepare(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      guard();
      const results = await real.batch<T>(statements);
      if (deletesUser) spent = true;
      return results;
    },
  };
  return wrapped as unknown as D1Database;
}

async function readRow<T>(table: string, id: string, columns: string): Promise<T> {
  return (await row<T>(`SELECT ${columns} FROM ${table} WHERE id = ?`, id))!;
}

/** A's identity columns; by default Google `g-a` with `a@x.com` and consent given. */
interface AIdentity {
  googleSub: string | null;
  zaloSub: string | null;
  email: string | null;
  consentAt: string | null;
}

async function seedMergeCase(
  opts: {
    aCustom?: 0 | 1;
    bGoogleSub?: string | null;
    aBank?: boolean;
    a?: Partial<AIdentity>;
    request?: { provider: 'google' | 'zalo'; providerSub: string };
  } = {},
): Promise<void> {
  const a: AIdentity = {
    googleSub: 'g-a',
    zaloSub: null,
    email: 'a@x.com',
    consentAt: '2026-10-12T00:00:00.000Z',
    ...opts.a,
  };
  const request = opts.request ?? { provider: 'zalo', providerSub: 'z-b' };
  await run(
    'INSERT INTO users (id, google_sub, zalo_sub, email, name, gender, avatar_url, custom_profile, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'u-a',
    a.googleSub,
    a.zaloSub,
    a.email,
    'Anh A',
    'M',
    'https://p/a.png',
    opts.aCustom ?? 0,
    a.consentAt,
    CREATED,
  );
  await run(
    'INSERT INTO users (id, google_sub, zalo_sub, email, name, gender, avatar_url, custom_profile, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'u-b',
    opts.bGoogleSub ?? null,
    'z-b',
    opts.bGoogleSub ? 'b@x.com' : null,
    'Bé Chi',
    'F',
    'https://p/b.png',
    1,
    '2026-10-01T00:00:00.000Z',
    CREATED,
  );
  await run(
    'INSERT INTO users (id, google_sub, zalo_sub, email, name, gender, avatar_url, custom_profile, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'u-c',
    'g-c',
    null,
    'c@x.com',
    'Cường',
    null,
    null,
    0,
    null,
    CREATED,
  );

  await addSession('sid-a', 'u-a');
  await addSession('sid-b1', 'u-b');
  await addSession('sid-b2', 'u-b');
  await addSession('sid-c', 'u-c');

  await run(
    'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    't-1',
    'Trip 1',
    'u-a',
    'gt-1',
    'vt-1',
    0,
    CREATED,
  );
  await run(
    'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    't-2',
    'Trip 2',
    'u-b',
    'gt-2',
    'vt-2',
    0,
    CREATED,
  );
  await run(
    'INSERT INTO trips (id, name, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    't-3',
    'Trip 3',
    'u-c',
    'gt-3',
    'vt-3',
    0,
    CREATED,
  );

  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'p-anh',
    't-1',
    'Anh',
    'anh',
    'u-a',
    0,
    'active',
    0,
    CREATED,
  );
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'p-chi',
    't-1',
    'Chi',
    'chi',
    'u-b',
    1,
    'active',
    1,
    CREATED,
  );
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'p-dung',
    't-1',
    'Dũng',
    'dung',
    null,
    0,
    'active',
    2,
    CREATED,
  );
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'p-b2',
    't-2',
    'Bé Chi',
    'be chi',
    'u-b',
    0,
    'active',
    0,
    CREATED,
  );
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'p-c3',
    't-3',
    'Cường',
    'cuong',
    'u-c',
    0,
    'active',
    0,
    CREATED,
  );
  await run(
    'INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'p-slot3',
    't-3',
    'Chi',
    'chi',
    null,
    0,
    'active',
    1,
    CREATED,
  );

  await run(
    'INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    'mreq-1',
    't-3',
    'p-slot3',
    'u-b',
    'pending',
    CREATED,
  );

  // B's other footprints: an expense B disabled, and B's own activity line (both in t-2, which only B is in).
  await run(
    "INSERT INTO transactions (id, root_id, trip_id, type, description, amount, spent_on, payer_id, status, disabled_by_user_id, created_by_participant_id, created_at, updated_at) VALUES ('e-dis', 'e-dis', 't-2', 'expense', 'Nước', 1000, '2026-10-10', 'p-b2', 'disabled', 'u-b', 'p-b2', ?, ?)",
    CREATED,
    CREATED,
  );
  await run(
    "INSERT INTO activity (id, trip_id, actor_participant_id, actor_user_id, actor_device, action, details_json, created_at) VALUES ('act-b', 't-2', 'p-b2', 'u-b', NULL, 'expense_disabled', '{}', ?)",
    CREATED,
  );

  if (opts.aBank !== false) {
    await run(
      'INSERT INTO bank_details (id, user_id, participant_id, bin, account_number, holder_name, status, approved_by_user_id, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'bank-a',
      'u-a',
      null,
      '970407',
      '111',
      'ANH A',
      'approved',
      'u-a',
      CREATED,
      CREATED,
    );
  }
  await run(
    'INSERT INTO bank_details (id, user_id, participant_id, bin, account_number, holder_name, status, approved_by_user_id, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'bank-b',
    'u-b',
    null,
    '970436',
    '222',
    'BE CHI',
    'approved',
    'u-b',
    CREATED,
    CREATED,
  );

  const now = new Date().toISOString();
  await run(
    'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'mr-1',
    'u-a',
    'u-b',
    request.provider,
    request.providerSub,
    'pending',
    now,
    inDays(7),
    null,
  );
  await run(
    'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'mr-other',
    'u-c',
    'u-b',
    'google',
    'g-other',
    'pending',
    now,
    inDays(7),
    null,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('account merge', () => {
  it('accept moves everything to A and deletes B', async () => {
    await seedMergeCase();
    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(200);
    const body = await json<{ user: { id: string; providers: string[] } }>(res);
    expect(body.user.id).toBe('u-a');
    expect(body.user.providers).toEqual(['google', 'zalo']);

    expect(await row<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u-b')).toBeNull();

    const ua = (await row<{ zalo_sub: string | null; google_sub: string | null; email: string | null }>(
      'SELECT zalo_sub, google_sub, email FROM users WHERE id = ?',
      'u-a',
    ))!;
    expect(ua.zalo_sub).toBe('z-b');
    expect(ua.google_sub).toBe('g-a');
    expect(ua.email).toBe('a@x.com');

    const t2 = (await row<{ organiser_user_id: string; version: number }>(
      'SELECT organiser_user_id, version FROM trips WHERE id = ?',
      't-2',
    ))!;
    expect(t2.organiser_user_id).toBe('u-a');

    const pb2 = (await row<{ user_id: string | null }>(
      'SELECT user_id FROM participants WHERE id = ?',
      'p-b2',
    ))!;
    expect(pb2.user_id).toBe('u-a');

    const mreq = (await row<{ user_id: string }>(
      'SELECT user_id FROM membership_requests WHERE id = ?',
      'mreq-1',
    ))!;
    expect(mreq.user_id).toBe('u-a');

    const meB1 = await call('/api/me', { headers: { Cookie: 'sid=sid-b1' } });
    const meB1Body = await json<MeResponse>(meB1);
    expect(meB1Body.user?.id).toBe('u-a');

    const meB2 = await call('/api/me', { headers: { Cookie: 'sid=sid-b2' } });
    const meB2Body = await json<MeResponse>(meB2);
    expect(meB2Body.user?.id).toBe('u-a');

    const sess = (await row<{ n: number }>(
      'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?',
      'u-b',
    ))!;
    expect(sess.n).toBe(0);

    const bankB = (await row<{ status: string; user_id: string | null; approved_by_user_id: string | null }>(
      'SELECT status, user_id, approved_by_user_id FROM bank_details WHERE id = ?',
      'bank-b',
    ))!;
    expect(bankB.status).toBe('replaced');
    expect(bankB.user_id).toBe('u-a');
    expect(bankB.approved_by_user_id).toBe('u-a');

    const bankA = (await row<{ status: string; user_id: string | null }>(
      'SELECT status, user_id FROM bank_details WHERE id = ?',
      'bank-a',
    ))!;
    expect(bankA.status).toBe('approved');
    expect(bankA.user_id).toBe('u-a');

    const mr1 = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      'mr-1',
    ))!;
    expect(mr1.status).toBe('accepted');
    expect(mr1.decided_at).not.toBeNull();

    const mrOther = (await row<{ status: string }>(
      'SELECT status FROM account_merge_requests WHERE id = ?',
      'mr-other',
    ))!;
    expect(mrOther.status).toBe('cancelled');

    const t1 = (await row<{ version: number }>(
      'SELECT version FROM trips WHERE id = ?',
      't-1',
    ))!;
    expect(t1.version).toBeGreaterThan(0);
    expect(t2.version).toBeGreaterThan(0);

    expect((await readRow<{ disabled_by_user_id: string | null }>('transactions', 'e-dis', 'disabled_by_user_id')).disabled_by_user_id).toBe('u-a');
    expect((await readRow<{ actor_user_id: string | null }>('activity', 'act-b', 'actor_user_id')).actor_user_id).toBe('u-a');
  });

  it('A proves B\'s Google: A takes it with its email, keeps its own Zalo, and takes B\'s consent', async () => {
    // A: Zalo only, never consented. B: Google g-b (b@x.com) + Zalo z-b. A proved g-b.
    await seedMergeCase({
      a: { googleSub: null, zaloSub: 'z-a', email: null, consentAt: null },
      bGoogleSub: 'g-b',
      request: { provider: 'google', providerSub: 'g-b' },
    });

    // B's confirm screen lists the Zalo it will lose (A keeps its own Zalo).
    const meB = await json<MeResponse>(call('/api/me', { headers: { Cookie: 'sid=sid-b1' } }));
    expect(meB.mergeRequests.incoming.find((r) => r.id === 'mr-1')?.released).toEqual([{ provider: 'zalo', email: null }]);

    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(200);
    const body = await json<{ user: { id: string; email: string | null; providers: string[]; consentAt: string | null } }>(res);
    expect(body.user).toMatchObject({ id: 'u-a', email: 'b@x.com', providers: ['google', 'zalo'], consentAt: '2026-10-01T00:00:00.000Z' });

    const ua = await readRow<{ google_sub: string | null; zalo_sub: string | null; email: string | null; consent_at: string | null }>(
      'users', 'u-a', 'google_sub, zalo_sub, email, consent_at',
    );
    expect(ua).toEqual({ google_sub: 'g-b', zalo_sub: 'z-a', email: 'b@x.com', consent_at: '2026-10-01T00:00:00.000Z' });
    expect((await row<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE zalo_sub = 'z-b'"))!.n).toBe(0);
  });

  it('A without the other identity takes B\'s, with its email', async () => {
    // A: Zalo z-a only. B: Google g-b (b@x.com) + Zalo z-b. A proved z-b, so A's own z-a goes and B's Google comes along.
    await seedMergeCase({
      a: { googleSub: null, zaloSub: 'z-a', email: null },
      bGoogleSub: 'g-b',
      request: { provider: 'zalo', providerSub: 'z-b' },
    });

    // B keeps both of its identities in A, so nothing is listed as released.
    const meB = await json<MeResponse>(call('/api/me', { headers: { Cookie: 'sid=sid-b1' } }));
    expect(meB.mergeRequests.incoming.find((r) => r.id === 'mr-1')?.released).toEqual([]);

    expect((await accept('mr-1', 'sid-b1')).status).toBe(200);

    const ua = await readRow<{ google_sub: string | null; zalo_sub: string | null; email: string | null; consent_at: string | null }>(
      'users', 'u-a', 'google_sub, zalo_sub, email, consent_at',
    );
    expect(ua).toEqual({ google_sub: 'g-b', zalo_sub: 'z-b', email: 'b@x.com', consent_at: '2026-10-12T00:00:00.000Z' });
    expect((await row<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE zalo_sub = 'z-a'"))!.n).toBe(0);
  });

  it('a group both were in ends with one name, admin kept', async () => {
    await seedMergeCase();
    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(200);

    const pChi = (await row<{ status: string; merged_into: string | null }>(
      'SELECT status, merged_into FROM participants WHERE id = ?',
      'p-chi',
    ))!;
    expect(pChi.status).toBe('merged');
    expect(pChi.merged_into).toBe('p-anh');

    const pAnh = (await row<{ is_admin: number; user_id: string | null; status: string }>(
      'SELECT is_admin, user_id, status FROM participants WHERE id = ?',
      'p-anh',
    ))!;
    expect(pAnh.is_admin).toBe(1);
    expect(pAnh.user_id).toBe('u-a');
    expect(pAnh.status).toBe('active');

    const partCount = (await row<{ n: number }>(
      "SELECT COUNT(*) AS n FROM participants WHERE trip_id = 't-1' AND user_id = 'u-a' AND status = 'active'",
    ))!;
    expect(partCount.n).toBe(1);

    const actCount = (await row<{ n: number }>(
      "SELECT COUNT(*) AS n FROM activity WHERE trip_id = 't-1' AND action = 'name_merged'",
    ))!;
    expect(actCount.n).toBe(1);
  });

  it('profile carries over from a customised B to an uncustomised A', async () => {
    await seedMergeCase({ aCustom: 0 });
    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(200);
    const body = await json<{ user: { name: string } }>(res);
    expect(body.user.name).toBe('Bé Chi');

    const ua = (await row<{
      name: string;
      avatar_url: string | null;
      gender: string | null;
      custom_profile: number;
      consent_at: string | null;
    }>('SELECT name, avatar_url, gender, custom_profile, consent_at FROM users WHERE id = ?', 'u-a'))!;
    expect(ua.name).toBe('Bé Chi');
    expect(ua.avatar_url).toBe('https://p/b.png');
    expect(ua.gender).toBe('F');
    expect(ua.custom_profile).toBe(1);
    expect(ua.consent_at).toBe('2026-10-12T00:00:00.000Z');
  });

  it('profile stays when A is customised', async () => {
    await seedMergeCase({ aCustom: 1 });
    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(200);

    const ua = (await row<{
      name: string;
      avatar_url: string | null;
      gender: string | null;
      custom_profile: number;
    }>('SELECT name, avatar_url, gender, custom_profile FROM users WHERE id = ?', 'u-a'))!;
    expect(ua.name).toBe('Anh A');
    expect(ua.avatar_url).toBe('https://p/a.png');
    expect(ua.gender).toBe('M');
    expect(ua.custom_profile).toBe(1);
  });

  it('a released identity is dropped', async () => {
    await seedMergeCase({ bGoogleSub: 'g-b' });
    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(200);

    const dropped = (await row<{ n: number }>(
      "SELECT COUNT(*) AS n FROM users WHERE google_sub = 'g-b'",
    ))!;
    expect(dropped.n).toBe(0);

    const ua = (await row<{ google_sub: string | null; email: string | null; zalo_sub: string | null }>(
      'SELECT google_sub, email, zalo_sub FROM users WHERE id = ?',
      'u-a',
    ))!;
    expect(ua.google_sub).toBe('g-a');
    expect(ua.email).toBe('a@x.com');
    expect(ua.zalo_sub).toBe('z-b');

    const newId = await upsertIdentity(getDb(env), 'google', {
      sub: 'g-b',
      name: 'B again',
      avatarUrl: null,
      email: 'b@x.com',
    });
    expect(newId).not.toBe('u-a');
    expect(newId).not.toBe('u-b');

    const newUser = (await row<{ google_sub: string | null }>(
      'SELECT google_sub FROM users WHERE id = ?',
      newId,
    ))!;
    expect(newUser.google_sub).toBe('g-b');
  });

  it("B's bank carries over when A has none", async () => {
    await seedMergeCase({ aBank: false });
    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(200);

    const bankB = (await row<{ status: string; user_id: string | null }>(
      'SELECT status, user_id FROM bank_details WHERE id = ?',
      'bank-b',
    ))!;
    expect(bankB.status).toBe('approved');
    expect(bankB.user_id).toBe('u-a');
  });

  it('only B can accept, while pending and unexpired', async () => {
    await seedMergeCase();

    expect((await accept('mr-1', 'sid-a')).status).toBe(404);
    expect((await accept('nope', 'sid-b1')).status).toBe(404);

    await run("UPDATE account_merge_requests SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = 'mr-1'");
    expect((await accept('mr-1', 'sid-b1')).status).toBe(404);

    await run(
      "UPDATE account_merge_requests SET expires_at = '2099-01-01T00:00:00.000Z', status = 'declined' WHERE id = 'mr-1'",
    );
    expect((await accept('mr-1', 'sid-b1')).status).toBe(404);

    const ub = await row<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u-b');
    expect(ub).not.toBeNull();

    const ua = (await row<{ zalo_sub: string | null }>('SELECT zalo_sub FROM users WHERE id = ?', 'u-a'))!;
    expect(ua.zalo_sub).toBeNull();
  });

  it('stale when B no longer holds the identity', async () => {
    await seedMergeCase({ bGoogleSub: 'g-b' });

    const delRes = await call('/api/me/identities/zalo', {
      method: 'DELETE',
      headers: { Cookie: 'sid=sid-b1' },
    });
    expect(delRes.status).toBe(200);

    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(409);
    const body = await json<{ error: { code: string; message: string } }>(res);
    expect(body.error.code).toBe('MERGE_STALE');

    const mr1 = (await row<{ status: string }>(
      'SELECT status FROM account_merge_requests WHERE id = ?',
      'mr-1',
    ))!;
    expect(mr1.status).toBe('cancelled');

    const ub = await row<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u-b');
    expect(ub).not.toBeNull();

    const ua = (await row<{ zalo_sub: string | null }>('SELECT zalo_sub FROM users WHERE id = ?', 'u-a'))!;
    expect(ua.zalo_sub).toBeNull();

    const t2 = (await row<{ organiser_user_id: string }>(
      'SELECT organiser_user_id FROM trips WHERE id = ?',
      't-2',
    ))!;
    expect(t2.organiser_user_id).toBe('u-b');

    const pChi = (await row<{ user_id: string | null; status: string }>(
      'SELECT user_id, status FROM participants WHERE id = ?',
      'p-chi',
    ))!;
    expect(pChi.user_id).toBe('u-b');
    expect(pChi.status).toBe('active');

    const bankB = (await row<{ status: string; user_id: string | null }>(
      'SELECT status, user_id FROM bank_details WHERE id = ?',
      'bank-b',
    ))!;
    expect(bankB.status).toBe('approved');
    expect(bankB.user_id).toBe('u-b');

    expect((await readRow<{ disabled_by_user_id: string | null }>('transactions', 'e-dis', 'disabled_by_user_id')).disabled_by_user_id).toBe('u-b');
    expect((await readRow<{ actor_user_id: string | null }>('activity', 'act-b', 'actor_user_id')).actor_user_id).toBe('u-b');
  });

  it('stale when A no longer exists', async () => {
    await seedMergeCase();
    await run("DELETE FROM users WHERE id = 'u-a'");

    const res = await accept('mr-1', 'sid-b1');
    expect(res.status).toBe(409);
    const body = await json<{ error: { code: string; message: string } }>(res);
    expect(body.error.code).toBe('MERGE_STALE');

    const mr1 = (await row<{ status: string }>(
      'SELECT status FROM account_merge_requests WHERE id = ?',
      'mr-1',
    ))!;
    expect(mr1.status).toBe('cancelled');

    const ub = await row<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u-b');
    expect(ub).not.toBeNull();

    const pb2 = (await row<{ user_id: string | null }>(
      'SELECT user_id FROM participants WHERE id = ?',
      'p-b2',
    ))!;
    expect(pb2.user_id).toBe('u-b');
  });

  it('decline and cancel', async () => {
    await seedMergeCase();
    const now = new Date().toISOString();
    await run(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'mr-2',
      'u-a',
      'u-c',
      'google',
      'g-c',
      'pending',
      now,
      inDays(7),
      null,
    );

    const resDecline = await decline('mr-1', 'sid-b1');
    expect(resDecline.status).toBe(204);

    const mr1 = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      'mr-1',
    ))!;
    expect(mr1.status).toBe('declined');
    expect(mr1.decided_at).not.toBeNull();

    const meA = await call('/api/me', { headers: { Cookie: 'sid=sid-a' } });
    const meABody = await json<MeResponse>(meA);
    expect(meABody.mergeRequests.outgoing.find((r) => r.id === 'mr-1')?.status).toBe('declined');

    expect((await decline('mr-1', 'sid-b1')).status).toBe(404);
    expect((await decline('mr-2', 'sid-a')).status).toBe(404);
    expect((await cancel('mr-other', 'sid-a')).status).toBe(404);

    const resCancel = await cancel('mr-2', 'sid-a');
    expect(resCancel.status).toBe(204);

    const mr2 = (await row<{ status: string; decided_at: string | null }>(
      'SELECT status, decided_at FROM account_merge_requests WHERE id = ?',
      'mr-2',
    ))!;
    expect(mr2.status).toBe('cancelled');
    expect(mr2.decided_at).not.toBeNull();

    const ub = await row<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u-b');
    expect(ub).not.toBeNull();
  });

  it('decline and cancel refuse the wrong side and expired requests', async () => {
    await seedMergeCase();

    expect((await cancel('mr-1', 'sid-b1')).status).toBe(404);

    await run("UPDATE account_merge_requests SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = 'mr-1'");
    expect((await decline('mr-1', 'sid-b1')).status).toBe(404);
    expect((await cancel('mr-1', 'sid-a')).status).toBe(404);

    expect((await readRow<{ status: string; decided_at: string | null }>('account_merge_requests', 'mr-1', 'status, decided_at'))).toEqual({
      status: 'pending',
      decided_at: null,
    });
  });

  it('merge-request endpoints need a session', async () => {
    await seedMergeCase();

    expect((await accept('mr-1')).status).toBe(401);
    expect((await decline('mr-1')).status).toBe(401);
    expect((await cancel('mr-1')).status).toBe(401);
  });

  it('a failed group merge still completes the account merge', async () => {
    await seedMergeCase();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = getDb(env);
    const request = (await db.select().from(accountMergeRequests).where(eq(accountMergeRequests.id, 'mr-1')).get())!;

    const merged = await mergeUsers(db, request, 'dev', {
      mergeParticipants: async () => {
        throw new Error('boom');
      },
    });

    // The returned row is A as phase 1 committed it.
    expect(merged).toMatchObject({ id: 'u-a', googleSub: 'g-a', zaloSub: 'z-b', name: 'Bé Chi', customProfile: 1 });

    expect(await row<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u-b')).toBeNull();

    const partCount = (await row<{ n: number }>(
      "SELECT COUNT(*) AS n FROM participants WHERE trip_id = 't-1' AND user_id = 'u-a' AND status = 'active'",
    ))!;
    expect(partCount.n).toBe(2);

    const mr1 = (await row<{ status: string }>(
      'SELECT status FROM account_merge_requests WHERE id = ?',
      'mr-1',
    ))!;
    expect(mr1.status).toBe('accepted');
    expect(errSpy).toHaveBeenCalled();
  });

  it('accept still answers when the query budget runs out after phase 1', async () => {
    await seedMergeCase();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await app.request(
      '/api/me/merge-requests/mr-1/accept',
      { method: 'POST', headers: { Cookie: 'sid=sid-b1' } },
      { ...env, DB: budgetSpentAfterPhase1(env.DB) },
    );

    expect(res.status).toBe(200);
    const body = await json<{ user: { id: string; providers: string[] } }>(res);
    expect(body.user).toMatchObject({ id: 'u-a', providers: ['google', 'zalo'] });
    // The group merge in t-1 could not run: logged, and both names stay with A.
    expect(errSpy).toHaveBeenCalled();
    expect((await row<{ n: number }>("SELECT COUNT(*) AS n FROM participants WHERE trip_id = 't-1' AND user_id = 'u-a' AND status = 'active'"))!.n).toBe(2);
    expect(await row<{ id: string }>('SELECT id FROM users WHERE id = ?', 'u-b')).toBeNull();
  });
});
