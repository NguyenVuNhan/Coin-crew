import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { PeopleSummaryResponse } from '@cc/core';
import type { Env } from '@cc/api-db/env';
import { purgeDeletedGroups, PURGE_BATCH_LIMIT } from '../src/trips/purge';
import { call, json, memberSid, seedUser, U } from './helpers';

interface DbCounts {
  prepared: number;
  executed: number;
  batchCalls: number;
  maxBoundParams: number;
}

function withCountingDb(
  rawDb: D1Database,
  opts: { beforeBatch?: () => Promise<void> } = {},
): { db: D1Database; counts: DbCounts } {
  const counts: DbCounts = {
    prepared: 0,
    executed: 0,
    batchCalls: 0,
    maxBoundParams: 0,
  };
  const unwrap = new WeakMap<object, D1PreparedStatement>();

  function wrapStatement(stmt: D1PreparedStatement): D1PreparedStatement {
    const wrapped = {
      bind(...values: unknown[]) {
        counts.maxBoundParams = Math.max(counts.maxBoundParams, values.length);
        return wrapStatement(stmt.bind(...values));
      },
      first<T = unknown>(colName?: string) {
        counts.executed += 1;
        return colName !== undefined ? stmt.first<T>(colName) : stmt.first<T>();
      },
      run<T = Record<string, unknown>>() {
        counts.executed += 1;
        return stmt.run<T>();
      },
      all<T = Record<string, unknown>>() {
        counts.executed += 1;
        return stmt.all<T>();
      },
      raw<T = unknown[]>(options?: { columnNames?: boolean }) {
        counts.executed += 1;
        return options ? stmt.raw<T>(options as { columnNames: true }) : stmt.raw<T>();
      },
    } as unknown as D1PreparedStatement;
    unwrap.set(wrapped, stmt);
    return wrapped;
  }

  const db = {
    prepare(query: string) {
      counts.prepared += 1;
      return wrapStatement(rawDb.prepare(query));
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      if (opts.beforeBatch) await opts.beforeBatch();
      counts.batchCalls += 1;
      counts.executed += statements.length;
      const realStatements = statements.map((s) => unwrap.get(s) ?? s);
      return rawDb.batch<T>(realStatements);
    },
    exec(query: string) {
      return rawDb.exec(query);
    },
    withSession(constraintOrBookmark?: string) {
      return rawDb.withSession(constraintOrBookmark);
    },
    dump() {
      return rawDb.dump();
    },
  } as unknown as D1Database;

  return { db, counts };
}

async function execSql(query: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(query).bind(...binds).run();
}

async function countRows(table: string, column: string, values: string[]): Promise<number> {
  const placeholders = values.map(() => '?').join(', ');
  const row = await env.DB.prepare(`SELECT count(*) AS cnt FROM "${table}" WHERE "${column}" IN (${placeholders})`)
    .bind(...values)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

interface SeedTripFullOptions {
  tripId: string;
  deleteAfter: string | null;
  archivedAt?: string | null;
  preset?: 'trip' | 'sport' | 'direct';
  organiserUserId?: string;
  memberUserId?: string | null;
  tagId?: string;
  subscriptionId?: string;
}

/**
 * Seeds a trip plus rows in every one of the 27 trip-related tables and `account_merge_requests`
 * (pending + historical).
 */
async function seedTripAcrossAllTables(opts: SeedTripFullOptions): Promise<{
  tripId: string;
  organiserPid: string;
  guestPid: string;
  mergedPid: string;
  txId: string;
  mergeId: string;
  pendingMergeReqId: string;
  acceptedMergeReqId: string;
}> {
  const id = opts.tripId;
  const organiserUserId = opts.organiserUserId ?? U.minh;
  const memberUserId = opts.memberUserId ?? U.an;
  const tagId = opts.tagId ?? `tag-${id}`;
  const subId = opts.subscriptionId ?? `sub-${id}`;

  const organiserPid = `p-org-${id}`;
  const memberPid = `p-mem-${id}`;
  const guestPid = `p-guest-${id}`;
  const mergedPid = `p-merged-${id}`;
  const txId = `tx-${id}`;
  const mergeId = `pm-${id}`;
  const pendingMergeReqId = `amr-pending-${id}`;
  const acceptedMergeReqId = `amr-accepted-${id}`;
  const nowStr = '2026-11-10T00:00:00.000Z';

  await seedUser(organiserUserId, 'Minh');
  if (memberUserId) await seedUser(memberUserId, 'An');

  await execSql(
    `INSERT OR IGNORE INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)`,
    tagId,
    organiserUserId,
    `Tag-${id}`,
    nowStr,
  );
  await execSql(
    `INSERT OR IGNORE INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
     VALUES (?, ?, ?, 'p256dh', 'auth', ?, ?)`,
    subId,
    organiserUserId,
    `https://fcm.googleapis.com/fcm/send/${subId}`,
    nowStr,
    nowStr,
  );

  // 1. trips
  await execSql(
    `INSERT INTO trips (id, name, preset, currency, organiser_user_id, group_token, view_token, version, created_at, archived_at, delete_after)
     VALUES (?, ?, ?, 'VND', ?, ?, ?, 1, ?, ?, ?)`,
    id,
    `Trip ${id}`,
    opts.preset ?? 'trip',
    organiserUserId,
    `gtok-${id}`,
    `vtok-${id}`,
    nowStr,
    opts.archivedAt === undefined ? '2026-11-15T00:00:00.000Z' : opts.archivedAt,
    opts.deleteAfter,
  );

  // 2. participants
  await execSql(
    `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, is_admin, status, sort_order, created_at)
     VALUES (?, ?, 'Minh', 'minh', ?, 1, 'active', 0, ?),
            (?, ?, 'An', 'an', ?, 0, 'active', 1, ?),
            (?, ?, 'Khach', 'khach', NULL, 0, 'active', 2, ?),
            (?, ?, 'Merged', 'merged', NULL, 0, 'merged', 3, ?)`,
    organiserPid, id, organiserUserId, nowStr,
    memberPid, id, memberUserId, nowStr,
    guestPid, id, nowStr,
    mergedPid, id, nowStr,
  );
  await execSql(`UPDATE participants SET merged_into = ? WHERE id = ?`, guestPid, mergedPid);

  // 3. personal_group_links & 4. personal_group_link_tags
  await execSql(
    `INSERT INTO personal_group_links (user_id, root_id, trip_id, intent, exclude_from_reports, created_at, updated_at, sync_version)
     VALUES (?, ?, ?, 'shared', 0, ?, ?, 1)`,
    organiserUserId,
    txId,
    id,
    nowStr,
    nowStr,
  );
  await execSql(
    `INSERT INTO personal_group_link_tags (user_id, root_id, tag_id) VALUES (?, ?, ?)`,
    organiserUserId,
    txId,
    tagId,
  );

  // 5. participant_merges & 6. participant_merge_rows
  await execSql(
    `INSERT INTO participant_merges (id, trip_id, from_id, into_id, actor_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    mergeId,
    id,
    mergedPid,
    guestPid,
    organiserUserId,
    nowStr,
  );
  await execSql(
    `INSERT INTO participant_merge_rows (merge_id, table_name, row_key, before_json)
     VALUES (?, 'participants', ?, '{}')`,
    mergeId,
    mergedPid,
  );

  // 7. transactions & 8. transaction_shares
  await execSql(
    `INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at)
     VALUES (?, ?, NULL, 1, ?, 'expense', 'Dinner', 200000, 'VND', '2026-11-10', ?, 'equal', 'approved', ?, ?, ?)`,
    txId,
    txId,
    id,
    organiserPid,
    organiserPid,
    nowStr,
    nowStr,
  );
  await execSql(
    `INSERT INTO transaction_shares (transaction_id, participant_id, input_value, input_auto, amount)
     VALUES (?, ?, 1, 0, 100000), (?, ?, 1, 0, 100000)`,
    txId,
    organiserPid,
    txId,
    guestPid,
  );

  // 9. guest bank_details (user_id IS NULL)
  await execSql(
    `INSERT INTO bank_details (id, user_id, participant_id, bin, account_number, holder_name, status, consent_at, created_at)
     VALUES (?, NULL, ?, '970407', '19039999888877', 'KHACH', 'approved', ?, ?)`,
    `bd-${id}`,
    guestPid,
    nowStr,
    nowStr,
  );

  // 10. person_links
  await execSql(
    `INSERT INTO person_links (owner_user_id, participant_id, person_pid, kind, created_at)
     VALUES (?, ?, ?, 'merge', ?)`,
    organiserUserId,
    guestPid,
    `ledger-p-${id}`,
    nowStr,
  );

  // account_merge_requests (1 pending, 1 accepted)
  await execSql(
    `INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at, initiated_by, claim_trip_id, claim_participant_id)
     VALUES (?, ?, ?, 'zalo', ?, 'pending', ?, '2099-01-01T00:00:00.000Z', NULL, 'survivor', ?, ?),
            (?, ?, ?, 'google', ?, 'accepted', ?, '2099-01-01T00:00:00.000Z', ?, 'survivor', ?, ?)`,
    pendingMergeReqId, organiserUserId, `u-claim-p-${id}`, `z-${id}`, nowStr, id, guestPid,
    acceptedMergeReqId, organiserUserId, `u-claim-a-${id}`, `g-${id}`, nowStr, '2026-11-12T00:00:00.000Z', id, organiserPid,
  );

  // 11. notification_logs (FK to trips.id)
  await execSql(
    `INSERT INTO notification_logs (id, user_id, trip_id, type, reference_id, sent_at)
     VALUES (?, ?, ?, 'transaction_crud', ?, ?)`,
    `nlog-${id}`,
    organiserUserId,
    id,
    txId,
    nowStr,
  );

  // 12..26 remaining trip-scoped tables
  await execSql(
    `INSERT INTO trip_views (trip_id, version, json, updated_at) VALUES (?, 1, '{}', ?)`,
    id,
    nowStr,
  );
  await execSql(
    `INSERT INTO activity (id, trip_id, actor_participant_id, actor_user_id, action, details_json, created_at)
     VALUES (?, ?, ?, ?, 'trip_created', '{}', ?)`,
    `act-${id}`,
    id,
    organiserPid,
    organiserUserId,
    nowStr,
  );
  await execSql(
    `INSERT INTO payment_refs (code, trip_id, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    `REF${id.slice(0, 6)}`,
    id,
    guestPid,
    organiserPid,
    nowStr,
  );
  await execSql(
    `INSERT INTO player_ratings (trip_id, rater_participant_id, target_participant_id, stars, updated_at)
     VALUES (?, ?, ?, 5, ?)`,
    id,
    organiserPid,
    guestPid,
    nowStr,
  );
  await execSql(
    `INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at)
     VALUES (?, ?, ?, ?, 'rejected', ?)`,
    `mr-${id}`,
    id,
    guestPid,
    memberUserId ?? 'u-req-other',
    nowStr,
  );
  await execSql(
    `INSERT INTO merge_proposals (id, trip_id, guest_pid, into_pid, requested_by_user_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'declined', ?)`,
    `mp-${id}`,
    id,
    guestPid,
    organiserPid,
    organiserUserId,
    nowStr,
  );
  await execSql(
    `INSERT INTO zalo_chat_links (chat_id, trip_id, linked_by_user_id, created_at)
     VALUES (?, ?, ?, ?)`,
    `zchat-${id}`,
    id,
    organiserUserId,
    nowStr,
  );
  await execSql(
    `INSERT INTO device_participants (device_hash, trip_id, participant_id, last_used_at)
     VALUES (?, ?, ?, ?)`,
    `dev-${id}`,
    id,
    guestPid,
    nowStr,
  );
  await execSql(
    `INSERT INTO device_expense_grants (device_hash, trip_id, expense_root_id, participant_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    `dev-${id}`,
    id,
    txId,
    guestPid,
    nowStr,
  );
  await execSql(
    `INSERT INTO payment_keys (key, trip_id, payment_id, created_at)
     VALUES (?, ?, ?, ?)`,
    `pkey-${id}`,
    id,
    `pay-${id}`,
    nowStr,
  );
  await execSql(
    `INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at, sent_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    `prem-${id}`,
    subId,
    txId,
    id,
    nowStr,
  );
  await execSql(
    `INSERT INTO trip_locations (id, trip_id, name, address, created_at, updated_at)
     VALUES (?, ?, 'San', '123 Duong', ?, ?)`,
    `loc-${id}`,
    id,
    nowStr,
    nowStr,
  );
  await execSql(
    `INSERT INTO attendance_scores (trip_id, participant_id, presence, reliability, guest, updated_at)
     VALUES (?, ?, 1, 1, 0, ?)`,
    id,
    organiserPid,
    nowStr,
  );
  await execSql(
    `INSERT INTO attendance_counted (root_id, trip_id, counted_at) VALUES (?, ?, ?)`,
    txId,
    id,
    nowStr,
  );
  await execSql(
    `INSERT INTO attendance_state (trip_id, version) VALUES (?, 1)`,
    id,
  );

  return {
    tripId: id,
    organiserPid,
    guestPid,
    mergedPid,
    txId,
    mergeId,
    pendingMergeReqId,
    acceptedMergeReqId,
  };
}

describe('purgeDeletedGroups', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fast path prepares 1 statement when zero trips are due and skips delete_after > now', async () => {
    const now = new Date('2026-12-22T00:30:00.000Z');
    await seedUser(U.minh, 'Minh');

    // Active, archived (null delete_after), and future pending-delete (> now)
    await execSql(
      `INSERT INTO trips (id, name, preset, organiser_user_id, group_token, view_token, version, created_at, archived_at, delete_after)
       VALUES ('t-active', 'Active', 'trip', ?, 'gt-a', 'vt-a', 0, '2026-11-01T00:00:00.000Z', NULL, NULL),
              ('t-arch', 'Archived', 'trip', ?, 'gt-ar', 'vt-ar', 0, '2026-11-01T00:00:00.000Z', '2026-11-10T00:00:00.000Z', NULL),
              ('t-future', 'Future', 'trip', ?, 'gt-f', 'vt-f', 0, '2026-11-01T00:00:00.000Z', '2026-11-22T00:00:00.000Z', '2026-12-22T00:30:01.000Z')`,
      U.minh,
      U.minh,
      U.minh,
    );

    const { db, counts } = withCountingDb(env.DB);
    await purgeDeletedGroups({ ...env, DB: db } as Env, now);

    expect(counts.prepared).toBe(1);
    expect(counts.executed).toBe(1);
    expect(counts.batchCalls).toBe(0);
    expect(await countRows('trips', 'id', ['t-active', 't-arch', 't-future'])).toBe(3);
  });

  it('completely wipes all 27 tables, cancels pending account merge claims, and updates HTTP/People views', async () => {
    const now = new Date('2026-12-22T00:30:00.000Z');
    const sid = await memberSid(U.minh, 'Minh');
    const seeded = await seedTripAcrossAllTables({
      tripId: 't-wipe',
      deleteAfter: '2026-12-22T00:30:00.000Z',
    });

    // Unrelated account merge request must stay untouched
    await execSql(
      `INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at, initiated_by, claim_trip_id, claim_participant_id)
       VALUES ('amr-other', ?, 'u-other', 'google', 'g-other', 'pending', '2026-11-10T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL, 'survivor', 't-unrelated', 'p-unrelated')`,
      U.minh,
    );

    // Confirm data is live via HTTP before purge
    const preTrip = await call(`/api/trips/${seeded.tripId}`, { headers: { Cookie: `sid=${sid}` } });
    expect(preTrip.status).toBe(200);
    const preLink = await call(`/api/links/gtok-${seeded.tripId}`);
    expect(preLink.status).toBe(200);
    const prePeople = await json<PeopleSummaryResponse>(
      call('/api/me/people/summary', { headers: { Cookie: `sid=${sid}` } }),
    );
    expect(prePeople.people.some((p) => p.total === 100_000)).toBe(true);

    await purgeDeletedGroups(env, now);

    // Every trip-scoped table is wiped
    const tripScopedTables = [
      'personal_group_links',
      'participant_merges',
      'transactions',
      'notification_logs',
      'trip_views',
      'activity',
      'payment_refs',
      'player_ratings',
      'membership_requests',
      'merge_proposals',
      'zalo_chat_links',
      'device_participants',
      'device_expense_grants',
      'payment_keys',
      'push_reminders',
      'trip_locations',
      'attendance_scores',
      'attendance_counted',
      'attendance_state',
      'participants',
    ];
    for (const table of tripScopedTables) {
      expect(await countRows(table, 'trip_id', [seeded.tripId]), `${table} should be empty`).toBe(0);
    }
    expect(await countRows('trips', 'id', [seeded.tripId])).toBe(0);
    expect(await countRows('personal_group_link_tags', 'root_id', [seeded.txId])).toBe(0);
    expect(await countRows('participant_merge_rows', 'merge_id', [seeded.mergeId])).toBe(0);
    expect(await countRows('transaction_shares', 'transaction_id', [seeded.txId])).toBe(0);
    expect(await countRows('bank_details', 'participant_id', [seeded.guestPid])).toBe(0);
    expect(await countRows('person_links', 'participant_id', [seeded.guestPid])).toBe(0);

    // account_merge_requests: pending -> cancelled with decided_at = now, all claims nullified
    const pendingClaim = await env.DB.prepare(
      'SELECT status, decided_at, claim_trip_id, claim_participant_id FROM account_merge_requests WHERE id = ?',
    )
      .bind(seeded.pendingMergeReqId)
      .first<{ status: string; decided_at: string | null; claim_trip_id: string | null; claim_participant_id: string | null }>();
    expect(pendingClaim).toEqual({
      status: 'cancelled',
      decided_at: now.toISOString(),
      claim_trip_id: null,
      claim_participant_id: null,
    });

    const acceptedClaim = await env.DB.prepare(
      'SELECT status, decided_at, claim_trip_id, claim_participant_id FROM account_merge_requests WHERE id = ?',
    )
      .bind(seeded.acceptedMergeReqId)
      .first<{ status: string; decided_at: string | null; claim_trip_id: string | null; claim_participant_id: string | null }>();
    expect(acceptedClaim).toEqual({
      status: 'accepted',
      decided_at: '2026-11-12T00:00:00.000Z',
      claim_trip_id: null,
      claim_participant_id: null,
    });

    const otherClaim = await env.DB.prepare(
      'SELECT status, claim_trip_id FROM account_merge_requests WHERE id = ?',
    )
      .bind('amr-other')
      .first<{ status: string; claim_trip_id: string | null }>();
    expect(otherClaim).toEqual({ status: 'pending', claim_trip_id: 't-unrelated' });

    // HTTP + People summary checks after purge
    expect((await call(`/api/trips/${seeded.tripId}`, { headers: { Cookie: `sid=${sid}` } })).status).toBe(404);

    const deadGroupLink = await call(`/api/links/gtok-${seeded.tripId}`);
    expect(deadGroupLink.status).toBe(410);
    expect((await json<{ error: { code: string } }>(deadGroupLink)).error.code).toBe('LINK_DEAD');

    const deadViewLink = await call(`/api/links/vtok-${seeded.tripId}`);
    expect(deadViewLink.status).toBe(410);
    expect((await json<{ error: { code: string } }>(deadViewLink)).error.code).toBe('LINK_DEAD');

    const postPeople = await json<PeopleSummaryResponse>(
      call('/api/me/people/summary', { headers: { Cookie: `sid=${sid}` } }),
    );
    expect(postPeople.people).toEqual([]);
  });

  it('Review Focus 3: preserves account bank_details, personal direct ledger (even if corrupted), and other groups', async () => {
    const now = new Date('2026-12-22T00:30:00.000Z');
    await seedTripAcrossAllTables({
      tripId: 't-due-pres',
      deleteAfter: '2026-12-20T00:00:00.000Z',
      tagId: 'tag-shared-minh',
      subscriptionId: 'sub-shared-minh',
    });

    // Signed-in member's account-level bank_details (user_id IS NOT NULL)
    await execSql(
      `INSERT INTO bank_details (id, user_id, participant_id, bin, account_number, holder_name, status, consent_at, created_at)
       VALUES ('bd-account-minh', ?, NULL, '970407', '19031234565678', 'NGUYEN VAN MINH', 'approved', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')`,
      U.minh,
    );

    // Personal direct ledger — even corrupted in SQL with archived_at + delete_after <= now
    await seedTripAcrossAllTables({
      tripId: 't-direct-minh',
      preset: 'direct',
      deleteAfter: '2026-12-20T00:00:00.000Z',
      memberUserId: null,
      tagId: 'tag-shared-minh',
      subscriptionId: 'sub-shared-minh',
    });

    // Second active group with expenses, personal_group_links, guest bank_details, and person_links
    const active = await seedTripAcrossAllTables({
      tripId: 't-active-keep',
      archivedAt: null,
      deleteAfter: null,
      tagId: 'tag-shared-minh',
      subscriptionId: 'sub-shared-minh',
    });

    await purgeDeletedGroups(env, now);

    // Due trip is gone
    expect(await countRows('trips', 'id', ['t-due-pres'])).toBe(0);
    expect(await countRows('bank_details', 'id', ['bd-t-due-pres'])).toBe(0);

    // Account bank_details preserved
    expect(await countRows('bank_details', 'id', ['bd-account-minh'])).toBe(1);

    // Personal direct ledger preserved intact
    expect(await countRows('trips', 'id', ['t-direct-minh'])).toBe(1);
    expect(await countRows('participants', 'trip_id', ['t-direct-minh'])).toBe(4);
    expect(await countRows('transactions', 'trip_id', ['t-direct-minh'])).toBe(1);
    expect(await countRows('bank_details', 'id', ['bd-t-direct-minh'])).toBe(1);

    // Active group and all its rows preserved intact
    expect(await countRows('trips', 'id', [active.tripId])).toBe(1);
    expect(await countRows('participants', 'trip_id', [active.tripId])).toBe(4);
    expect(await countRows('transactions', 'trip_id', [active.tripId])).toBe(1);
    expect(await countRows('transaction_shares', 'transaction_id', [active.txId])).toBe(2);
    expect(await countRows('personal_group_links', 'trip_id', [active.tripId])).toBe(1);
    expect(await countRows('personal_group_link_tags', 'root_id', [active.txId])).toBe(1);
    expect(await countRows('bank_details', 'id', ['bd-t-active-keep'])).toBe(1);
    expect(await countRows('person_links', 'participant_id', [active.guestPid])).toBe(1);
    expect(await countRows('notification_logs', 'trip_id', [active.tripId])).toBe(1);
  });

  it('Review Focus 1: purges max PURGE_BATCH_LIMIT (10) of 12 due trips in <= 35 statements and <= 100 bound params, then remaining 2 on next tick', async () => {
    expect(PURGE_BATCH_LIMIT).toBe(10);
    const now = new Date('2026-12-22T00:30:00.000Z');

    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const id = `t-batch-${String(i).padStart(2, '0')}`;
      ids.push(id);
      const minute = String(i).padStart(2, '0');
      await seedTripAcrossAllTables({
        tripId: id,
        deleteAfter: `2026-12-22T00:${minute}:00.000Z`,
        tagId: 'tag-batch-shared',
        subscriptionId: 'sub-batch-shared',
      });
    }

    const firstIds = ids.slice(0, 10);
    const remainingIds = ids.slice(10);

    // Tick 1: 10 oldest purged, 2 remain
    const tick1 = withCountingDb(env.DB);
    await purgeDeletedGroups({ ...env, DB: tick1.db } as Env, now);

    expect(tick1.counts.batchCalls).toBe(1);
    expect(tick1.counts.prepared).toBeLessThanOrEqual(35);
    expect(tick1.counts.executed).toBeLessThanOrEqual(35);
    expect(tick1.counts.maxBoundParams).toBeLessThanOrEqual(100);

    expect(await countRows('trips', 'id', firstIds)).toBe(0);
    expect(await countRows('participants', 'trip_id', firstIds)).toBe(0);
    expect(await countRows('transactions', 'trip_id', firstIds)).toBe(0);
    expect(await countRows('personal_group_links', 'trip_id', firstIds)).toBe(0);
    expect(await countRows('notification_logs', 'trip_id', firstIds)).toBe(0);

    expect(await countRows('trips', 'id', remainingIds)).toBe(2);
    expect(await countRows('transactions', 'trip_id', remainingIds)).toBe(2);
    expect(await countRows('personal_group_links', 'trip_id', remainingIds)).toBe(2);

    // Tick 2: remaining 2 purged
    const tick2 = withCountingDb(env.DB);
    await purgeDeletedGroups({ ...env, DB: tick2.db } as Env, now);

    expect(tick2.counts.batchCalls).toBe(1);
    expect(tick2.counts.prepared).toBeLessThanOrEqual(35);
    expect(tick2.counts.executed).toBeLessThanOrEqual(35);
    expect(await countRows('trips', 'id', ids)).toBe(0);
    expect(await countRows('participants', 'trip_id', ids)).toBe(0);

    // Tick 3: fast path 1 statement
    const tick3 = withCountingDb(env.DB);
    await purgeDeletedGroups({ ...env, DB: tick3.db } as Env, now);
    expect(tick3.counts.prepared).toBe(1);
    expect(tick3.counts.executed).toBe(1);
  });

  it('Review Focus 2 (trigger): BEFORE UPDATE trigger clearing delete_after rolls back batch atomically with zero partial deletes', async () => {
    const now = new Date('2026-12-22T00:30:00.000Z');
    const t1 = await seedTripAcrossAllTables({
      tripId: 't-race-1',
      deleteAfter: '2026-12-22T00:01:00.000Z',
      tagId: 'tag-race-shared',
      subscriptionId: 'sub-race-shared',
    });
    const t2 = await seedTripAcrossAllTables({
      tripId: 't-race-2',
      deleteAfter: '2026-12-22T00:02:00.000Z',
      tagId: 'tag-race-shared',
      subscriptionId: 'sub-race-shared',
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Simulate concurrent cancel-delete hitting t-race-2 (the second trip in ids) during guard check
    await execSql(
      `CREATE TRIGGER sneak_cancel_purge BEFORE UPDATE OF delete_after ON trips
       WHEN OLD.id = 't-race-2' AND OLD.delete_after IS NOT NULL
       BEGIN
         UPDATE trips SET delete_after = NULL WHERE id = NEW.id;
         SELECT RAISE(IGNORE);
       END`,
    );

    try {
      await expect(purgeDeletedGroups(env, now)).resolves.toBeUndefined();
      expect(errSpy).not.toHaveBeenCalled();

      // Zero partial deletes across BOTH trips and all dependent tables
      expect(await countRows('trips', 'id', ['t-race-1', 't-race-2'])).toBe(2);
      expect(await countRows('participants', 'trip_id', ['t-race-1', 't-race-2'])).toBe(8);
      expect(await countRows('transactions', 'trip_id', ['t-race-1', 't-race-2'])).toBe(2);
      expect(await countRows('transaction_shares', 'transaction_id', [t1.txId, t2.txId])).toBe(4);
      expect(await countRows('personal_group_links', 'trip_id', ['t-race-1', 't-race-2'])).toBe(2);
      expect(await countRows('personal_group_link_tags', 'root_id', [t1.txId, t2.txId])).toBe(2);
      expect(await countRows('participant_merges', 'trip_id', ['t-race-1', 't-race-2'])).toBe(2);
      expect(await countRows('participant_merge_rows', 'merge_id', [t1.mergeId, t2.mergeId])).toBe(2);
      expect(await countRows('bank_details', 'participant_id', [t1.guestPid, t2.guestPid])).toBe(2);
      expect(await countRows('person_links', 'participant_id', [t1.guestPid, t2.guestPid])).toBe(2);
      expect(await countRows('notification_logs', 'trip_id', ['t-race-1', 't-race-2'])).toBe(2);

      const amr1 = await env.DB.prepare('SELECT status, claim_trip_id FROM account_merge_requests WHERE id = ?')
        .bind(t1.pendingMergeReqId)
        .first<{ status: string; claim_trip_id: string | null }>();
      expect(amr1).toEqual({ status: 'pending', claim_trip_id: 't-race-1' });
    } finally {
      await execSql('DROP TRIGGER sneak_cancel_purge');
    }
  });

  it('Review Focus 2 + Guard 2 ruling: concurrent delete of ids[0] + cancel-delete of ids[1] between SELECT and batch still rolls back batch', async () => {
    const now = new Date('2026-12-22T00:30:00.000Z');
    const sid = await memberSid(U.minh, 'Minh');
    await seedTripAcrossAllTables({
      tripId: 't-guard-1',
      deleteAfter: '2026-12-22T00:01:00.000Z',
      tagId: 'tag-guard-shared',
      subscriptionId: 'sub-guard-shared',
    });
    const t2 = await seedTripAcrossAllTables({
      tripId: 't-guard-2',
      deleteAfter: '2026-12-22T00:02:00.000Z',
      tagId: 'tag-guard-shared',
      subscriptionId: 'sub-guard-shared',
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = withCountingDb(env.DB, {
      async beforeBatch() {
        // Simulate ids[0] already removed while ids[1] is concurrently cancelled before batch lands
        await execSql(`DELETE FROM notification_logs WHERE trip_id = 't-guard-1'`);
        await execSql(`DELETE FROM trips WHERE id = 't-guard-1'`);
        const res = await call('/api/trips/t-guard-2/cancel-delete', {
          method: 'POST',
          headers: { Cookie: `sid=${sid}` },
        });
        expect(res.status).toBe(204);
      },
    });

    await expect(purgeDeletedGroups({ ...env, DB: db } as Env, now)).resolves.toBeUndefined();
    expect(errSpy).not.toHaveBeenCalled();

    // t-guard-2 and all its dependent rows must remain intact with delete_after = NULL
    const row2 = await env.DB.prepare('SELECT delete_after FROM trips WHERE id = ?')
      .bind('t-guard-2')
      .first<{ delete_after: string | null }>();
    expect(row2).toEqual({ delete_after: null });
    expect(await countRows('participants', 'trip_id', ['t-guard-2'])).toBe(4);
    expect(await countRows('transactions', 'trip_id', ['t-guard-2'])).toBe(1);
    expect(await countRows('transaction_shares', 'transaction_id', [t2.txId])).toBe(2);
    expect(await countRows('personal_group_links', 'trip_id', ['t-guard-2'])).toBe(1);
    expect(await countRows('notification_logs', 'trip_id', ['t-guard-2'])).toBe(1);
  });

  it('logs unexpected errors without throwing', async () => {
    const now = new Date('2026-12-22T00:30:00.000Z');
    await seedTripAcrossAllTables({
      tripId: 't-err-1',
      deleteAfter: '2026-12-22T00:01:00.000Z',
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = withCountingDb(env.DB, {
      async beforeBatch() {
        throw new Error('simulated D1 outage');
      },
    });

    await expect(purgeDeletedGroups({ ...env, DB: db } as Env, now)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('Failed to purge deleted groups');
  });
});
