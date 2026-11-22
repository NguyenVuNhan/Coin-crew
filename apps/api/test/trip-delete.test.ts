import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { ActivityItem, TripListItem, TripView } from '@cc/core';
import { getDb } from '@cc/api-db/client';
import { rebuildSessionReminders, rebuildRemindersForSubscription } from '../src/notifications/push/reminders';
import { call, json, seedTrip, linkMember, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(path, {
    method: 'POST',
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const view = (headers: Record<string, string>, tripId: string = T.tripId) =>
  json<TripView>(call(`/api/trips/${tripId}`, { headers }));

async function seedPushSub(id: string, userId: string, endpoint: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, new_session, session_reminder, reminder_lead_minutes, expense_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 30, 1, ?, ?)',
  )
    .bind(id, userId, endpoint, 'p256dh-test', 'auth-test', '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z')
    .run();
}

async function seedFuturePlannedSession(rootId: string, tripId: string, participantIds: string[]): Promise<void> {
  const metaJson = JSON.stringify({
    sport: {
      planning: true,
      location: { name: 'Sân Phú Thọ', address: '219 Lý Thường Kiệt' },
      courtSlots: [{ courtName: 'Sân 5', timeRange: '05:00 - 07:00' }],
      court: 100000,
      shuttlecocks: [],
      extra: 0,
      rule: { kind: 'equal' },
      entries: participantIds.map((participantId) => ({ participantId, maleSlots: 1, femaleSlots: 0 })),
      maleSlotRate: 0,
      femaleSlotRate: 0,
    },
  });

  await env.DB.prepare(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description,
      amount, currency, spent_on, payer_id, split_mode, status,
      created_by_participant_id, meta_json, created_at, updated_at
    ) VALUES (?, ?, NULL, 1, ?, 'expense', 'Cầu lông T5', 0, 'VND', '2099-11-14', ?, 'amounts', 'approved', ?, ?, '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z')`,
  )
    .bind(rootId, rootId, tripId, participantIds[0], participantIds[0], metaJson)
    .run();
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await seedTrip();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('delete archived group routes', () => {
  it('only the organiser can schedule or cancel deletion (member, admin, guest, viewer get 403)', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    const binhSid = await linkMember(PID.B, 'u-binh', 'Bình');
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.B).run();

    const mHeaders = await minh();
    expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

    const callers = [
      { Cookie: `sid=${anSid}` },
      { Cookie: `sid=${binhSid}` },
      await guestHeaders(PID.C),
      await guestHeaders(undefined, T.viewToken),
    ];

    for (const headers of callers) {
      expect((await post(`${base}/delete`, headers)).status).toBe(403);
      expect((await post(`${base}/cancel-delete`, headers)).status).toBe(403);
    }

    // Even when pending delete, non-organisers cannot cancel deletion
    expect((await post(`${base}/delete`, mHeaders)).status).toBe(200);
    for (const headers of callers) {
      expect((await post(`${base}/cancel-delete`, headers)).status).toBe(403);
    }
  });

  it('refuses delete on an active group (409 CONFLICT) and on a personal direct ledger (403 FORBIDDEN)', async () => {
    const mHeaders = await minh();

    const activeRes = await post(`${base}/delete`, mHeaders);
    expect(activeRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(activeRes)).error.code).toBe('CONFLICT');

    // Create personal direct ledger
    const ledgerRes = await call('/api/me/ledger', { headers: mHeaders });
    expect(ledgerRes.status).toBe(200);
    const { tripId: directId } = await json<{ tripId: string }>(ledgerRes);

    // Reject both before and even if archived_at were somehow set
    expect((await post(`/api/trips/${directId}/delete`, mHeaders)).status).toBe(403);
    expect((await post(`/api/trips/${directId}/cancel-delete`, mHeaders)).status).toBe(403);

    await env.DB.prepare('UPDATE trips SET archived_at = ? WHERE id = ?')
      .bind('2026-11-01T00:00:00.000Z', directId)
      .run();
    expect((await post(`/api/trips/${directId}/delete`, mHeaders)).status).toBe(403);
    expect((await post(`/api/trips/${directId}/cancel-delete`, mHeaders)).status).toBe(403);
  });

  it('organiser archives then schedules deletion: sets ~30d deleteAfter, exposes on TripView/TripListItem, logs activity', async () => {
    const mHeaders = await minh();

    // Create a second group so GET /api/trips verifies non-pending trips omit deleteAfter
    const createRes = await post('/api/trips', mHeaders, { name: 'Active Group', myName: 'Minh', people: ['An'] });
    expect(createRes.status).toBe(201);
    const { tripId: otherId } = await json<{ tripId: string }>(createRes);

    expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

    const beforeMs = Date.now();
    const delRes = await post(`${base}/delete`, mHeaders);
    const afterMs = Date.now();
    expect(delRes.status).toBe(200);
    const { deleteAfter } = await json<{ deleteAfter: string }>(delRes);

    const thirtyDaysMs = 30 * 86_400_000;
    const targetMs = Date.parse(deleteAfter);
    expect(targetMs).toBeGreaterThanOrEqual(beforeMs + thirtyDaysMs - 1000);
    expect(targetMs).toBeLessThanOrEqual(afterMs + thirtyDaysMs + 1000);

    const v = await view(mHeaders);
    expect(v.trip.archived).toBe(true);
    expect(v.trip.deleteAfter).toBe(deleteAfter);

    const list = await json<TripListItem[]>(call('/api/trips', { headers: mHeaders }));
    const pendingItem = list.find((t) => t.id === T.tripId)!;
    const otherItem = list.find((t) => t.id === otherId)!;
    expect(pendingItem.archived).toBe(true);
    expect(pendingItem.deleteAfter).toBe(deleteAfter);
    expect(otherItem.archived).toBe(false);
    expect('deleteAfter' in otherItem).toBe(false);

    const acts = await json<ActivityItem[]>(call(`${base}/activity`, { headers: mHeaders }));
    expect(acts[0]).toMatchObject({
      action: 'trip_delete_scheduled',
      actorName: 'Minh',
      details: { deleteAfter },
    });
  });

  it('scheduling deletion twice is idempotent without bumping version or duplicating activity', async () => {
    const mHeaders = await minh();
    expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

    const first = await json<{ deleteAfter: string }>(post(`${base}/delete`, mHeaders));
    const versionAfterFirst = (await view(mHeaders)).trip.version;
    const actsAfterFirst = await json<ActivityItem[]>(call(`${base}/activity`, { headers: mHeaders }));

    const secondRes = await post(`${base}/delete`, mHeaders);
    expect(secondRes.status).toBe(200);
    const second = await json<{ deleteAfter: string }>(secondRes);
    expect(second.deleteAfter).toBe(first.deleteAfter);

    expect((await view(mHeaders)).trip.version).toBe(versionAfterFirst);
    const actsAfterSecond = await json<ActivityItem[]>(call(`${base}/activity`, { headers: mHeaders }));
    expect(actsAfterSecond).toHaveLength(actsAfterFirst.length);
    expect(actsAfterSecond.filter((a) => a.action === 'trip_delete_scheduled')).toHaveLength(1);
  });

  it('while pending delete: unarchive returns 409 CONFLICT, writes/leave return 409 TRIP_ARCHIVED, links remain readable', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    const mHeaders = await minh();
    expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);
    const { deleteAfter } = await json<{ deleteAfter: string }>(post(`${base}/delete`, mHeaders));

    const unarchiveRes = await post(`${base}/unarchive`, mHeaders);
    expect(unarchiveRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(unarchiveRes)).error.code).toBe('CONFLICT');

    const patchRes = await call(base, {
      method: 'PATCH',
      headers: { ...mHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fewestTransfers: false }),
    });
    expect(patchRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(patchRes)).error.code).toBe('TRIP_ARCHIVED');

    const leaveRes = await post(`${base}/leave`, { Cookie: `sid=${anSid}` });
    expect(leaveRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(leaveRes)).error.code).toBe('TRIP_ARCHIVED');

    const guestRes = await call(base, { headers: await guestHeaders(PID.C) });
    expect(guestRes.status).toBe(200);
    expect((await json<TripView>(guestRes)).trip.deleteAfter).toBe(deleteAfter);

    const viewerRes = await call(base, { headers: await guestHeaders(undefined, T.viewToken) });
    expect(viewerRes.status).toBe(200);
    expect((await json<TripView>(viewerRes)).trip.deleteAfter).toBe(deleteAfter);
  });

  it('cancel-delete returns group to archived, logs activity, is idempotent, and allows unarchive again', async () => {
    const mHeaders = await minh();
    expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);
    expect((await post(`${base}/delete`, mHeaders)).status).toBe(200);

    const cancelRes = await post(`${base}/cancel-delete`, mHeaders);
    expect(cancelRes.status).toBe(204);

    const afterCancel = await view(mHeaders);
    expect(afterCancel.trip.archived).toBe(true);
    expect(afterCancel.trip.deleteAfter).toBeNull();

    const listAfterCancel = await json<TripListItem[]>(call('/api/trips', { headers: mHeaders }));
    expect('deleteAfter' in listAfterCancel.find((t) => t.id === T.tripId)!).toBe(false);

    const actsAfterCancel = await json<ActivityItem[]>(call(`${base}/activity`, { headers: mHeaders }));
    expect(actsAfterCancel[0]).toMatchObject({ action: 'trip_delete_cancelled', actorName: 'Minh' });

    // Second cancel-delete is idempotent with no version bump or extra activity row
    const versionAfterCancel = afterCancel.trip.version;
    expect((await post(`${base}/cancel-delete`, mHeaders)).status).toBe(204);
    expect((await view(mHeaders)).trip.version).toBe(versionAfterCancel);
    const actsAfterSecond = await json<ActivityItem[]>(call(`${base}/activity`, { headers: mHeaders }));
    expect(actsAfterSecond).toHaveLength(actsAfterCancel.length);

    // Now unarchive succeeds
    expect((await post(`${base}/unarchive`, mHeaders)).status).toBe(204);
    const afterUnarchive = await view(mHeaders);
    expect(afterUnarchive.trip.archived).toBe(false);
    expect(afterUnarchive.trip.deleteAfter).toBeNull();
  });

  describe('Review Focus 2: concurrent delete vs unarchive race', () => {
    it('BEFORE UPDATE trigger simulating concurrent unarchive makes delete return 409 CONFLICT with delete_after NULL', async () => {
      const mHeaders = await minh();
      expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

      await env.DB.prepare(
        `CREATE TRIGGER sneak_unarchive BEFORE UPDATE OF delete_after ON trips
         WHEN NEW.delete_after IS NOT NULL AND OLD.archived_at IS NOT NULL
         BEGIN
           UPDATE trips SET archived_at = NULL WHERE id = NEW.id;
           SELECT RAISE(IGNORE);
         END`,
      ).run();

      try {
        const res = await post(`${base}/delete`, mHeaders);
        expect(res.status).toBe(409);
        expect((await json<{ error: { code: string } }>(res)).error.code).toBe('CONFLICT');

        const row = await env.DB.prepare('SELECT delete_after FROM trips WHERE id = ?')
          .bind(T.tripId)
          .first<{ delete_after: string | null }>();
        expect(row?.delete_after).toBeNull();
      } finally {
        await env.DB.prepare('DROP TRIGGER sneak_unarchive').run();
      }
    });

    it('BEFORE UPDATE trigger simulating concurrent delete makes unarchive return 409 CONFLICT', async () => {
      const mHeaders = await minh();
      expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

      await env.DB.prepare(
        `CREATE TRIGGER sneak_delete BEFORE UPDATE OF archived_at ON trips
         WHEN NEW.archived_at IS NULL AND OLD.delete_after IS NULL
         BEGIN
           UPDATE trips SET delete_after = '2099-01-01T00:00:00.000Z' WHERE id = NEW.id;
           SELECT RAISE(IGNORE);
         END`,
      ).run();

      try {
        const res = await post(`${base}/unarchive`, mHeaders);
        expect(res.status).toBe(409);
        expect((await json<{ error: { code: string } }>(res)).error.code).toBe('CONFLICT');
      } finally {
        await env.DB.prepare('DROP TRIGGER sneak_delete').run();
      }
    });

    it('concurrent delete vs unarchive lets only one win and returns 409 CONFLICT to the loser', async () => {
      const mHeaders = await minh();
      expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

      const [delRes, unarchRes] = await Promise.all([
        post(`${base}/delete`, mHeaders),
        post(`${base}/unarchive`, mHeaders),
      ]);

      const statuses = [delRes.status, unarchRes.status].sort();
      expect([200, 204]).toContain(statuses[0]);
      expect(statuses[1]).toBe(409);

      const row = await env.DB.prepare('SELECT archived_at, delete_after FROM trips WHERE id = ?')
        .bind(T.tripId)
        .first<{ archived_at: string | null; delete_after: string | null }>();
      // Invariant: delete_after is NEVER set when archived_at is NULL
      if (row?.archived_at === null) {
        expect(row.delete_after).toBeNull();
      } else {
        expect(row?.delete_after).toBeTruthy();
      }
    });

    it('concurrent unarchive vs delete lets only one win and returns 409 CONFLICT to the loser', async () => {
      const mHeaders = await minh();
      expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

      const [unarchRes, delRes] = await Promise.all([
        post(`${base}/unarchive`, mHeaders),
        post(`${base}/delete`, mHeaders),
      ]);

      const statuses = [unarchRes.status, delRes.status].sort();
      expect([200, 204]).toContain(statuses[0]);
      expect(statuses[1]).toBe(409);

      const row = await env.DB.prepare('SELECT archived_at, delete_after FROM trips WHERE id = ?')
        .bind(T.tripId)
        .first<{ archived_at: string | null; delete_after: string | null }>();
      // Invariant: delete_after is NEVER set when archived_at is NULL
      if (unarchRes.status === 204) {
        expect(delRes.status).toBe(409);
        expect(row?.archived_at).toBeNull();
        expect(row?.delete_after).toBeNull();
      } else {
        expect(delRes.status).toBe(200);
        expect(unarchRes.status).toBe(409);
        expect(row?.archived_at).toBeTruthy();
        expect(row?.delete_after).toBeTruthy();
      }
    });

    it('cancel-delete returns 204 without bumping version or logging activity when GuardMissError fires and trip still exists', async () => {
      const mHeaders = await minh();
      expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);
      const { deleteAfter } = await json<{ deleteAfter: string }>(post(`${base}/delete`, mHeaders));
      const versionBefore = (await view(mHeaders)).trip.version;
      const actsBefore = await json<ActivityItem[]>(call(`${base}/activity`, { headers: mHeaders }));

      await env.DB.prepare(
        `CREATE TRIGGER sneak_concurrent_cancel BEFORE UPDATE OF delete_after ON trips
         WHEN NEW.delete_after IS NULL AND OLD.delete_after IS NOT NULL
         BEGIN
           UPDATE trips SET delete_after = NULL WHERE id = NEW.id;
           SELECT RAISE(IGNORE);
         END`,
      ).run();

      try {
        expect((await post(`${base}/cancel-delete`, mHeaders)).status).toBe(204);
      } finally {
        await env.DB.prepare('DROP TRIGGER sneak_concurrent_cancel').run();
      }

      const after = await view(mHeaders);
      expect(after.trip.deleteAfter).toBe(deleteAfter);
      expect(after.trip.version).toBe(versionBefore);
      const actsAfter = await json<ActivityItem[]>(call(`${base}/activity`, { headers: mHeaders }));
      expect(actsAfter).toHaveLength(actsBefore.length);
    });
  });

  describe('push reminders exclusion', () => {
    it('archiving deletes unsent push_reminders for the trip while preserving already-sent rows', async () => {
      await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
      await linkMember(PID.A, U.an, 'An');
      await seedPushSub('sub-an', U.an, 'https://fcm.googleapis.com/fcm/send/an');
      await seedPushSub('sub-minh', U.minh, 'https://fcm.googleapis.com/fcm/send/minh');

      await env.DB.prepare(
        "INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at, sent_at) VALUES ('r-unsent', 'sub-an', 'sess-1', ?, '2099-11-14T10:00:00.000Z', NULL)",
      )
        .bind(T.tripId)
        .run();
      await env.DB.prepare(
        "INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at, sent_at) VALUES ('r-sent', 'sub-minh', 'sess-1', ?, '2026-11-10T10:00:00.000Z', '2026-11-10T10:00:00.000Z')",
      )
        .bind(T.tripId)
        .run();

      expect((await post(`${base}/archive`, await minh())).status).toBe(204);

      const remaining = await env.DB.prepare('SELECT id FROM push_reminders WHERE trip_id = ?')
        .bind(T.tripId)
        .all<{ id: string }>();
      expect(remaining.results.map((r) => r.id)).toEqual(['r-sent']);
    });

    it('scheduling deletion clears any unsent push_reminders for the trip', async () => {
      await env.DB.prepare("UPDATE trips SET preset = 'sport', archived_at = '2026-11-01T00:00:00.000Z' WHERE id = ?")
        .bind(T.tripId)
        .run();
      await linkMember(PID.A, U.an, 'An');
      await seedPushSub('sub-an', U.an, 'https://fcm.googleapis.com/fcm/send/an');

      await env.DB.prepare(
        "INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at, sent_at) VALUES ('r-unsent-2', 'sub-an', 'sess-2', ?, '2099-11-14T10:00:00.000Z', NULL)",
      )
        .bind(T.tripId)
        .run();
      await env.DB.prepare(
        "INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at, sent_at) VALUES ('r-sent-2', 'sub-an', 'sess-3', ?, '2026-11-10T10:00:00.000Z', '2026-11-10T10:00:00.000Z')",
      )
        .bind(T.tripId)
        .run();

      expect((await post(`${base}/delete`, await minh())).status).toBe(200);

      const remaining = await env.DB.prepare('SELECT id FROM push_reminders WHERE trip_id = ?')
        .bind(T.tripId)
        .all<{ id: string }>();
      expect(remaining.results.map((r) => r.id)).toEqual(['r-sent-2']);
    });

    it('rebuildSessionReminders and rebuildRemindersForSubscription skip archived trips', async () => {
      const mHeaders = await minh();
      await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
      await linkMember(PID.A, U.an, 'An');
      await seedPushSub('sub-an', U.an, 'https://fcm.googleapis.com/fcm/send/an');

      // Seed a second active sport group with An as member
      const createRes = await post('/api/trips', mHeaders, {
        name: 'Active Sport',
        preset: 'sport',
        myName: 'Minh',
        people: [{ name: 'An', userId: U.an }],
      });
      expect(createRes.status).toBe(201);
      const { tripId: activeSportId } = await json<{ tripId: string }>(createRes);
      const activeAn = await env.DB.prepare('SELECT id FROM participants WHERE trip_id = ? AND user_id = ?')
        .bind(activeSportId, U.an)
        .first<{ id: string }>();

      await seedFuturePlannedSession('sess-archived', T.tripId, [PID.M, PID.A]);
      await seedFuturePlannedSession('sess-active', activeSportId, [activeAn!.id]);

      // Archive T.tripId
      expect((await post(`${base}/archive`, mHeaders)).status).toBe(204);

      const db = getDb(env);
      const now = new Date('2026-11-13T00:00:00.000Z');

      // rebuildSessionReminders skips archived trip
      await rebuildSessionReminders(db, 'sess-archived', now);
      const archivedAfterSessionRebuild = await env.DB.prepare(
        'SELECT id FROM push_reminders WHERE trip_id = ?',
      )
        .bind(T.tripId)
        .all<{ id: string }>();
      expect(archivedAfterSessionRebuild.results).toEqual([]);

      // rebuildRemindersForSubscription skips archived trip, still builds for active trip
      await rebuildRemindersForSubscription(db, 'sub-an', now);
      const allReminders = await env.DB.prepare(
        'SELECT trip_id, transaction_root_id FROM push_reminders WHERE subscription_id = ?',
      )
        .bind('sub-an')
        .all<{ trip_id: string; transaction_root_id: string }>();
      expect(allReminders.results).toEqual([
        { trip_id: activeSportId, transaction_root_id: 'sess-active' },
      ]);
    });
  });
});
