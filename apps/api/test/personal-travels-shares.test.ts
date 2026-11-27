import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { TravelSavedResponse } from '@cc/core';
import { json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const createTravel = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/travels', sid, body);

const tagShares = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/travels/tag-shares', sid, body);

const putGroupLink = (sid: string, rootId: string, body: unknown) =>
  postJson(`/api/me/personal/group-links/${encodeURIComponent(rootId)}`, sid, body, 'PUT');

async function ensureGroup(tripId: string, userId: string): Promise<{ myPid: string; otherPid: string }> {
  const now = '2026-10-01T00:00:00.000Z';
  const myPid = `p-me-${tripId}`;
  const otherPid = `p-other-${tripId}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, 'VND', 1, ?, ?, ?, 1, ?)",
  )
    .bind(tripId, `Group ${tripId}`, userId, `gtok-${tripId}`, `vtok-${tripId}`, now)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, 'Me', 'me', ?, 'active', 0, ?)",
  )
    .bind(myPid, tripId, userId, now)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, 'Friend', 'friend', NULL, 'active', 1, ?)",
  )
    .bind(otherPid, tripId, now)
    .run();
  return { myPid, otherPid };
}

async function seedGroupExpenses(
  tripId: string,
  userId: string,
  expenses: {
    id: string;
    description: string;
    amount: number;
    myShare: number;
    spentOn: string;
    status?: 'approved' | 'pending';
  }[],
): Promise<void> {
  const now = '2026-10-01T00:00:00.000Z';
  const { myPid, otherPid } = await ensureGroup(tripId, userId);

  for (const exp of expenses) {
    const status = exp.status ?? 'approved';
    await env.DB.prepare(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, 'VND', ?, ?, 'exact', ?, ?, ?, ?)",
    )
      .bind(exp.id, exp.id, tripId, exp.description, exp.amount, exp.spentOn, otherPid, status, myPid, now, now)
      .run();
    if (exp.myShare > 0) {
      await env.DB.prepare(
        'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
      )
        .bind(exp.id, myPid, exp.myShare, exp.myShare)
        .run();
    }
    const otherShare = exp.amount - exp.myShare;
    if (otherShare > 0) {
      await env.DB.prepare(
        'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
      )
        .bind(exp.id, otherPid, otherShare, otherShare)
        .run();
    }
  }

  await env.DB.prepare('UPDATE trips SET version = version + 1 WHERE id = ?').bind(tripId).run();
}

const countQueries = async <T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> => {
  let prepareCount = 0;
  let batchCount = 0;
  const origPrepare = env.DB.prepare.bind(env.DB);
  const origBatch = env.DB.batch.bind(env.DB);
  env.DB.prepare = ((q: string) => {
    prepareCount++;
    return origPrepare(q);
  }) as typeof env.DB.prepare;
  env.DB.batch = ((stmts: D1PreparedStatement[]) => {
    batchCount++;
    return origBatch(stmts);
  }) as typeof env.DB.batch;
  try {
    const result = await fn();
    return { result, queries: prepareCount + batchCount };
  } finally {
    env.DB.prepare = origPrepare;
    env.DB.batch = origBatch;
  }
};

async function getLinkTagIds(userId: string, rootId: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    'SELECT tag_id FROM personal_group_link_tags WHERE user_id = ? AND root_id = ? ORDER BY tag_id',
  )
    .bind(userId, rootId)
    .all<{ tag_id: string }>();
  return rows.results.map((r) => r.tag_id);
}

async function getSyncVersion(userId: string): Promise<number | null> {
  const row = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
    .bind(userId)
    .first<{ version: number }>();
  return row?.version ?? null;
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_travel_share_marks').run();
  await env.DB.prepare('DELETE FROM personal_travel_groups').run();
  await env.DB.prepare('DELETE FROM personal_travels').run();
  await env.DB.prepare('DELETE FROM personal_budget_excluded_wallets').run();
  await env.DB.prepare('DELETE FROM personal_budget_limits').run();
  await env.DB.prepare('DELETE FROM personal_budgets').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_trip_cache').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('POST /me/personal/travels/tag-shares', () => {
  it('guards the route: 401 signed out, 403 with switch off, 422 on invalid today', async () => {
    expect((await tagShares(null, { today: '2026-12-10' })).status).toBe(401);

    const userId = 'u-ts-guard';
    const sid = await memberSid(userId, 'Guard');
    expect((await tagShares(sid, { today: '2026-12-10' })).status).toBe(403);

    await switchOn(userId);
    expect((await tagShares(sid, {})).status).toBe(422);
    expect((await tagShares(sid, { today: 'not-a-date' })).status).toBe(422);
  });

  it('tags a new share in a trip group dated in the lead-up and during the trip', async () => {
    const userId = 'u-ts-basic';
    const sid = await memberSid(userId, 'BasicUser');
    await switchOn(userId);

    const wRes = await addWallet(sid, { name: 'Main', startAmount: 5_000_000, startDate: '2026-10-01' });
    const walletId = (await json<{ wallet: { id: string } }>(wRes)).wallet.id;

    await ensureGroup('g-dalat', userId);
    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Đà Lạt',
          start: '2026-12-10',
          end: '2026-12-12',
          countsFrom: '2026-12-01',
          groupIds: ['g-dalat'],
          today: '2026-12-01',
        }),
      )
    ).travel;

    // Seed new shares after the trip exists
    await seedGroupExpenses('g-dalat', userId, [
      { id: 'ge-leadup', description: 'Hotel deposit', amount: 1_000_000, myShare: 500_000, spentOn: '2026-12-03' },
      { id: 'ge-during', description: 'BBQ dinner', amount: 800_000, myShare: 400_000, spentOn: '2026-12-11' },
      { id: 'ge-outside', description: 'After trip', amount: 300_000, myShare: 150_000, spentOn: '2026-12-15' },
      { id: 'ge-pending', description: 'Pending meal', amount: 400_000, myShare: 200_000, spentOn: '2026-12-11', status: 'pending' },
      { id: 'ge-zero', description: 'Not my share', amount: 400_000, myShare: 0, spentOn: '2026-12-11' },
    ]);

    // Pre-existing link on ge-during with walletId should be preserved by upsert
    expect((await putGroupLink(sid, 'ge-during', { walletId })).status).toBe(200);

    const res = await tagShares(sid, { today: '2026-12-11' });
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 2 });

    expect(await getLinkTagIds(userId, 'ge-leadup')).toEqual([created.tagId]);
    expect(await getLinkTagIds(userId, 'ge-during')).toEqual([created.tagId]);
    expect(await getLinkTagIds(userId, 'ge-outside')).toEqual([]);
    expect(await getLinkTagIds(userId, 'ge-pending')).toEqual([]);
    expect(await getLinkTagIds(userId, 'ge-zero')).toEqual([]);

    const preserved = await env.DB.prepare(
      'SELECT wallet_id FROM personal_group_links WHERE user_id = ? AND root_id = ?',
    )
      .bind(userId, 'ge-during')
      .first<{ wallet_id: string | null }>();
    expect(preserved?.wallet_id).toBe(walletId);

    const marks = await env.DB.prepare(
      'SELECT root_id, travel_id, state FROM personal_travel_share_marks WHERE user_id = ? ORDER BY root_id',
    )
      .bind(userId)
      .all<{ root_id: string; travel_id: string; state: string }>();
    expect(marks.results).toEqual([
      { root_id: 'ge-during', travel_id: created.id, state: 'tagged' },
      { root_id: 'ge-leadup', travel_id: created.id, state: 'tagged' },
    ]);
  });

  it('ignores shares from other groups', async () => {
    const userId = 'u-ts-other';
    const sid = await memberSid(userId, 'OtherUser');
    await switchOn(userId);

    await ensureGroup('g-trip', userId);
    await ensureGroup('g-household', userId);

    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Huế',
          start: '2026-12-10',
          end: '2026-12-12',
          countsFrom: '2026-12-01',
          groupIds: ['g-trip'],
          today: '2026-12-01',
        }),
      )
    ).travel;

    await seedGroupExpenses('g-household', userId, [
      { id: 'ge-home', description: 'Electricity bill', amount: 600_000, myShare: 300_000, spentOn: '2026-12-11' },
    ]);

    const res = await tagShares(sid, { today: '2026-12-11' });
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 0 });
    expect(await getLinkTagIds(userId, 'ge-home')).toEqual([]);
    expect(created.id).toBeTruthy();
  });

  it('a share removed by hand is not re-tagged', async () => {
    const userId = 'u-ts-untag';
    const sid = await memberSid(userId, 'UntagUser');
    await switchOn(userId);

    await ensureGroup('g-untag', userId);
    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Phú Quốc',
          start: '2026-12-10',
          end: '2026-12-12',
          countsFrom: '2026-12-01',
          groupIds: ['g-untag'],
          today: '2026-12-01',
        }),
      )
    ).travel;

    await seedGroupExpenses('g-untag', userId, [
      { id: 'ge-rm', description: 'Shared snack', amount: 200_000, myShare: 100_000, spentOn: '2026-12-11' },
    ]);

    // First run tags the share
    const res1 = await tagShares(sid, { today: '2026-12-11' });
    expect(res1.status).toBe(200);
    expect(await json<{ tagged: number }>(res1)).toEqual({ tagged: 1 });
    expect(await getLinkTagIds(userId, 'ge-rm')).toEqual([created.tagId]);

    // Remove the tag by hand
    const putRes = await putGroupLink(sid, 'ge-rm', { tagIds: [] });
    expect(putRes.status).toBe(200);
    expect(await getLinkTagIds(userId, 'ge-rm')).toEqual([]);

    // Second run does not re-tag
    const res2 = await tagShares(sid, { today: '2026-12-11' });
    expect(res2.status).toBe(200);
    expect(await json<{ tagged: number }>(res2)).toEqual({ tagged: 0 });
    expect(await getLinkTagIds(userId, 'ge-rm')).toEqual([]);
  });

  it('skipped shares stay untagged', async () => {
    const userId = 'u-ts-skipped';
    const sid = await memberSid(userId, 'SkippedUser');
    await switchOn(userId);

    // Seed share BEFORE creating the trip so Task 4 marks it skipped
    await seedGroupExpenses('g-skip', userId, [
      { id: 'ge-old', description: 'Old booking', amount: 500_000, myShare: 250_000, spentOn: '2026-12-05' },
    ]);

    const saved = await json<TravelSavedResponse>(
      await createTravel(sid, {
        name: 'Sapa',
        start: '2026-12-10',
        end: '2026-12-12',
        countsFrom: '2026-12-01',
        groupIds: ['g-skip'],
        today: '2026-12-06',
      }),
    );
    expect(saved.existing.shares.count).toBe(1);

    const res = await tagShares(sid, { today: '2026-12-06' });
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 0 });
    expect(await getLinkTagIds(userId, 'ge-old')).toEqual([]);
  });

  it('second run with nothing new writes nothing', async () => {
    const userId = 'u-ts-noop';
    const sid = await memberSid(userId, 'NoopUser');
    await switchOn(userId);

    await ensureGroup('g-noop', userId);
    await createTravel(sid, {
      name: 'Nha Trang',
      start: '2026-12-10',
      end: '2026-12-12',
      countsFrom: '2026-12-01',
      groupIds: ['g-noop'],
      today: '2026-12-01',
    });

    await seedGroupExpenses('g-noop', userId, [
      { id: 'ge-one', description: 'Coffee', amount: 100_000, myShare: 50_000, spentOn: '2026-12-10' },
    ]);

    const res1 = await tagShares(sid, { today: '2026-12-10' });
    expect(res1.status).toBe(200);
    expect(await json<{ tagged: number }>(res1)).toEqual({ tagged: 1 });

    const versionAfterFirst = await getSyncVersion(userId);
    expect(versionAfterFirst).not.toBeNull();

    const res2 = await tagShares(sid, { today: '2026-12-10' });
    expect(res2.status).toBe(200);
    expect(await json<{ tagged: number }>(res2)).toEqual({ tagged: 0 });

    const versionAfterSecond = await getSyncVersion(userId);
    expect(versionAfterSecond).toBe(versionAfterFirst);
  });

  it('a share later re-dated out of range keeps its tag; a mark whose group row is gone is ignored', async () => {
    const userId = 'u-ts-redate';
    const sid = await memberSid(userId, 'RedateUser');
    await switchOn(userId);

    await ensureGroup('g-redate', userId);
    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Hội An',
          start: '2026-12-10',
          end: '2026-12-12',
          countsFrom: '2026-12-01',
          groupIds: ['g-redate'],
          today: '2026-12-01',
        }),
      )
    ).travel;

    await seedGroupExpenses('g-redate', userId, [
      { id: 'ge-move', description: 'Lantern boat', amount: 400_000, myShare: 200_000, spentOn: '2026-12-11' },
      { id: 'ge-gone', description: 'Deleted item', amount: 300_000, myShare: 150_000, spentOn: '2026-12-11' },
    ]);

    const res1 = await tagShares(sid, { today: '2026-12-11' });
    expect(res1.status).toBe(200);
    expect(await json<{ tagged: number }>(res1)).toEqual({ tagged: 2 });

    // Re-date ge-move out of range and remove ge-gone from the group
    await env.DB.prepare("UPDATE transactions SET spent_on = '2026-12-25' WHERE root_id = 'ge-move'").run();
    await env.DB.prepare("DELETE FROM transaction_shares WHERE transaction_id = 'ge-gone'").run();
    await env.DB.prepare("DELETE FROM transactions WHERE root_id = 'ge-gone'").run();
    await env.DB.prepare("UPDATE trips SET version = version + 1 WHERE id = 'g-redate'").run();

    const versionBefore = await getSyncVersion(userId);
    const res2 = await tagShares(sid, { today: '2026-12-12' });
    expect(res2.status).toBe(200);
    expect(await json<{ tagged: number }>(res2)).toEqual({ tagged: 0 });
    expect(await getSyncVersion(userId)).toBe(versionBefore);

    // ge-move keeps its tag
    expect(await getLinkTagIds(userId, 'ge-move')).toEqual([created.tagId]);

    // Leftover mark for ge-gone is still present
    const goneMark = await env.DB.prepare(
      'SELECT travel_id, state FROM personal_travel_share_marks WHERE user_id = ? AND root_id = ?',
    )
      .bind(userId, 'ge-gone')
      .first<{ travel_id: string; state: string }>();
    expect(goneMark).toEqual({ travel_id: created.id, state: 'tagged' });
  });

  it("tie-break: share in two trips' ranges goes to the on trip", async () => {
    const userId = 'u-ts-tie';
    const sid = await memberSid(userId, 'TieUser');
    await switchOn(userId);

    await ensureGroup('g-tie', userId);
    const tripA = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Trip On',
          start: '2026-12-10',
          end: '2026-12-12',
          countsFrom: '2026-12-01',
          groupIds: ['g-tie'],
          today: '2026-12-01',
        }),
      )
    ).travel;

    const tripB = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Trip Leadup',
          start: '2026-12-15',
          end: '2026-12-18',
          countsFrom: '2026-12-05',
          groupIds: ['g-tie'],
          today: '2026-12-01',
        }),
      )
    ).travel;

    // 2026-12-11 is inside Trip A's [start..end] and Trip B's [countsFrom..end]
    await seedGroupExpenses('g-tie', userId, [
      { id: 'ge-tie', description: 'Overlap dinner', amount: 600_000, myShare: 300_000, spentOn: '2026-12-11' },
    ]);

    const res = await tagShares(sid, { today: '2026-12-11' });
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 1 });

    expect(await getLinkTagIds(userId, 'ge-tie')).toEqual([tripA.tagId]);
    expect(await getLinkTagIds(userId, 'ge-tie')).not.toContain(tripB.tagId);

    const mark = await env.DB.prepare(
      'SELECT travel_id, state FROM personal_travel_share_marks WHERE user_id = ? AND root_id = ?',
    )
      .bind(userId, 'ge-tie')
      .first<{ travel_id: string; state: string }>();
    expect(mark).toEqual({ travel_id: tripA.id, state: 'tagged' });
  });

  it('stays within 50 queries', async () => {
    const userId = 'u-ts-q';
    const sid = await memberSid(userId, 'QueryUser');
    await switchOn(userId);

    await ensureGroup('g-q', userId);
    await createTravel(sid, {
      name: 'Vũng Tàu',
      start: '2026-12-10',
      end: '2026-12-12',
      countsFrom: '2026-12-01',
      groupIds: ['g-q'],
      today: '2026-12-01',
    });

    const expenses = Array.from({ length: 15 }, (_, i) => ({
      id: `ge-q-${i}`,
      description: `Meal ${i}`,
      amount: 200_000,
      myShare: 100_000,
      spentOn: '2026-12-11',
    }));
    await seedGroupExpenses('g-q', userId, expenses);

    const { result: res, queries } = await countQueries(() =>
      tagShares(sid, { today: '2026-12-11' }),
    );
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 15 });
    expect(queries).toBeLessThanOrEqual(50);

    // Warm no-op run also stays well within 50 queries
    const { result: res2, queries: queries2 } = await countQueries(() =>
      tagShares(sid, { today: '2026-12-11' }),
    );
    expect(res2.status).toBe(200);
    expect(await json<{ tagged: number }>(res2)).toEqual({ tagged: 0 });
    expect(queries2).toBeLessThanOrEqual(50);
  });

  it('caps work at 100 shares per call within 50 queries on a cold trip cache, then tags the remainder', async () => {
    const userId = 'u-ts-cap';
    const sid = await memberSid(userId, 'CapUser');
    await switchOn(userId);

    await ensureGroup('g-cap', userId);
    await createTravel(sid, {
      name: 'Big Trip',
      start: '2026-12-10',
      end: '2026-12-12',
      countsFrom: '2026-12-01',
      groupIds: ['g-cap'],
      today: '2026-12-01',
    });

    const expenses = Array.from({ length: 105 }, (_, i) => ({
      id: `ge-cap-${String(i).padStart(3, '0')}`,
      description: `Item ${i}`,
      amount: 100_000,
      myShare: 50_000,
      spentOn: '2026-12-11',
    }));
    await seedGroupExpenses('g-cap', userId, expenses);

    // Force a cold trip cache
    await env.DB.prepare('DELETE FROM personal_trip_cache WHERE user_id = ?').bind(userId).run();

    const { result: res1, queries: q1 } = await countQueries(() =>
      tagShares(sid, { today: '2026-12-11' }),
    );
    expect(res1.status).toBe(200);
    expect(await json<{ tagged: number }>(res1)).toEqual({ tagged: 100 });
    expect(q1).toBeLessThanOrEqual(50);

    // Second call tags the remaining 5
    const { result: res2, queries: q2 } = await countQueries(() =>
      tagShares(sid, { today: '2026-12-11' }),
    );
    expect(res2.status).toBe(200);
    expect(await json<{ tagged: number }>(res2)).toEqual({ tagged: 5 });
    expect(q2).toBeLessThanOrEqual(50);
  });

  it('skips a share already manually tagged with another trip tag (one trip per share)', async () => {
    const userId = 'u-ts-onetrip';
    const sid = await memberSid(userId, 'OneTripUser');
    await switchOn(userId);

    await ensureGroup('g-one', userId);
    const tripA = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Trip A',
          start: '2026-12-10',
          end: '2026-12-12',
          countsFrom: '2026-12-01',
          groupIds: ['g-one'],
          today: '2026-12-01',
        }),
      )
    ).travel;

    const tripB = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Trip B',
          start: '2026-12-20',
          end: '2026-12-22',
          countsFrom: '2026-12-15',
          groupIds: [],
          today: '2026-12-01',
        }),
      )
    ).travel;

    await seedGroupExpenses('g-one', userId, [
      { id: 'ge-manual-b', description: 'Tagged B by hand', amount: 400_000, myShare: 200_000, spentOn: '2026-12-11' },
    ]);

    expect((await putGroupLink(sid, 'ge-manual-b', { tagIds: [tripB.tagId] })).status).toBe(200);

    const res = await tagShares(sid, { today: '2026-12-11' });
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 0 });
    expect(await getLinkTagIds(userId, 'ge-manual-b')).toEqual([tripB.tagId]);
    expect(await getLinkTagIds(userId, 'ge-manual-b')).not.toContain(tripA.tagId);
  });
});
