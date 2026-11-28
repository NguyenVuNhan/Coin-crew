import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EventRowsResponse,
  EventSavedResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const createEvent = (sid: string, body: unknown) =>
  postJson('/api/me/personal/events', sid, body);

const stopEvent = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}/stop`, sid, body);

const tagShares = (sid: string, body: unknown) =>
  postJson('/api/me/personal/events/tag-shares', sid, body);

const putGroupLink = (sid: string, rootId: string, body: unknown) =>
  postJson(`/api/me/personal/group-links/${encodeURIComponent(rootId)}`, sid, body, 'PUT');

const getEventRows = (sid: string, id: string) =>
  call(`/api/me/personal/events/${encodeURIComponent(id)}/rows`, as(sid));

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function ensureGroup(
  tripId: string,
  userId: string,
): Promise<{ myPid: string; otherPid: string }> {
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
  }[],
): Promise<void> {
  const now = '2026-10-01T00:00:00.000Z';
  const { myPid, otherPid } = await ensureGroup(tripId, userId);

  for (const exp of expenses) {
    await env.DB.prepare(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, 'VND', ?, ?, 'exact', 'approved', ?, ?, ?)",
    )
      .bind(exp.id, exp.id, tripId, exp.description, exp.amount, exp.spentOn, otherPid, myPid, now, now)
      .run();
    await env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
    )
      .bind(exp.id, myPid, exp.myShare, exp.myShare)
      .run();
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

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_event_share_marks').run();
  await env.DB.prepare('DELETE FROM personal_event_groups').run();
  await env.DB.prepare('DELETE FROM personal_events').run();
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

describe('multi-event shares and rows', () => {
  it("a share in two events' groups gets both tags", async () => {
    const userId = 'u-multi-both';
    const sid = await memberSid(userId, 'MultiBothUser');
    await switchOn(userId);

    await ensureGroup('g-shared', userId);
    const eventA = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-10',
          end: '2026-12-15',
          countsFrom: '2026-12-01',
          groupIds: ['g-shared'],
          today: '2026-12-01',
        }),
      )
    ).event;
    const eventB = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Tết',
          start: '2026-12-11',
          end: null,
          countsFrom: '2026-12-05',
          groupIds: ['g-shared'],
          today: '2026-12-01',
        }),
      )
    ).event;

    await seedGroupExpenses('g-shared', userId, [
      { id: 'ge-both', description: 'Shared meal', amount: 600_000, myShare: 300_000, spentOn: '2026-12-12' },
    ]);

    const res = await tagShares(sid, { today: '2026-12-12' });
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 1 });

    expect(await getLinkTagIds(userId, 'ge-both')).toEqual([eventA.tagId!, eventB.tagId!].sort());

    const marks = await env.DB.prepare(
      'SELECT event_id, state FROM personal_event_share_marks WHERE user_id = ? AND root_id = ? ORDER BY event_id',
    )
      .bind(userId, 'ge-both')
      .all<{ event_id: string; state: string }>();
    expect(marks.results).toEqual(
      [
        { event_id: eventA.id, state: 'tagged' },
        { event_id: eventB.id, state: 'tagged' },
      ].sort((a, b) => a.event_id.localeCompare(b.event_id)),
    );
  });

  it("skipping one event leaves the other's tag", async () => {
    const userId = 'u-multi-skip';
    const sid = await memberSid(userId, 'MultiSkipUser');
    await switchOn(userId);

    await ensureGroup('g-skip-one', userId);
    const eventA = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Event A',
          start: '2026-12-10',
          end: '2026-12-15',
          countsFrom: '2026-12-01',
          groupIds: ['g-skip-one'],
          today: '2026-12-01',
        }),
      )
    ).event;
    const eventB = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Event B',
          start: '2026-12-10',
          end: '2026-12-15',
          countsFrom: '2026-12-01',
          groupIds: ['g-skip-one'],
          today: '2026-12-01',
        }),
      )
    ).event;

    await seedGroupExpenses('g-skip-one', userId, [
      { id: 'ge-keep-b', description: 'Dinner', amount: 400_000, myShare: 200_000, spentOn: '2026-12-12' },
    ]);

    expect((await tagShares(sid, { today: '2026-12-12' })).status).toBe(200);
    expect(await getLinkTagIds(userId, 'ge-keep-b')).toEqual([eventA.tagId!, eventB.tagId!].sort());

    // Remove event A's tag by hand, keeping event B's tag
    const putRes = await putGroupLink(sid, 'ge-keep-b', { tagIds: [eventB.tagId!] });
    expect(putRes.status).toBe(200);

    // Re-running tag-shares leaves only B's tag and marks A skipped
    const res2 = await tagShares(sid, { today: '2026-12-12' });
    expect(res2.status).toBe(200);
    expect(await json<{ tagged: number }>(res2)).toEqual({ tagged: 0 });
    expect(await getLinkTagIds(userId, 'ge-keep-b')).toEqual([eventB.tagId!]);

    const marks = await env.DB.prepare(
      'SELECT event_id, state FROM personal_event_share_marks WHERE user_id = ? AND root_id = ? ORDER BY event_id',
    )
      .bind(userId, 'ge-keep-b')
      .all<{ event_id: string; state: string }>();
    expect(marks.results).toEqual(
      [
        { event_id: eventA.id, state: 'skipped' },
        { event_id: eventB.id, state: 'tagged' },
      ].sort((a, b) => a.event_id.localeCompare(b.event_id)),
    );
  });

  it('stopped event no longer tags shares dated on its stop day', async () => {
    const userId = 'u-multi-stop';
    const sid = await memberSid(userId, 'MultiStopUser');
    await switchOn(userId);

    const now = new Date();
    const stopDay = localYmd(now);
    const dayBefore = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const startDay = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2));

    await ensureGroup('g-stop', userId);
    const ev = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Stopped Event',
          start: startDay,
          end: null,
          countsFrom: startDay,
          groupIds: ['g-stop'],
          today: startDay,
        }),
      )
    ).event;

    const stopRes = await stopEvent(sid, ev.id, { today: stopDay });
    expect(stopRes.status).toBe(200);

    await seedGroupExpenses('g-stop', userId, [
      { id: 'ge-before-stop', description: 'Yesterday', amount: 200_000, myShare: 100_000, spentOn: dayBefore },
      { id: 'ge-on-stop', description: 'Today', amount: 300_000, myShare: 150_000, spentOn: stopDay },
    ]);

    const res = await tagShares(sid, { today: stopDay });
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 1 });

    expect(await getLinkTagIds(userId, 'ge-before-stop')).toEqual([ev.tagId!]);
    expect(await getLinkTagIds(userId, 'ge-on-stop')).toEqual([]);
  });

  it('rows include a hand-tagged item dated before countsFrom', async () => {
    const userId = 'u-multi-rows-early';
    const sid = await memberSid(userId, 'MultiRowsUser');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', currency: 'VND', startAmount: 5_000_000 }),
      )
    ).wallet;
    const { categories } = await json<CategoriesResponse>(await getCategories(sid));
    const foodCat = categories.find((c) => c.type === 'expense')!;

    const ev = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Hokkaido',
          start: '2026-12-20',
          end: '2026-12-25',
          countsFrom: '2026-12-10',
          groupIds: [],
          today: '2026-12-10',
        }),
      )
    ).event;

    const entryRes = await createEntry(sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 1_200_000,
      categoryId: foodCat.id,
      date: '2026-11-01',
      time: '09:00',
      note: 'Early flight booking',
      tags: [ev.tagName!],
    });
    expect(entryRes.status).toBe(201);

    const rowsRes = await getEventRows(sid, ev.id);
    expect(rowsRes.status).toBe(200);
    const body = await json<EventRowsResponse>(rowsRes);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      kind: 'entry',
      amount: 1_200_000,
      date: '2026-11-01',
    });
    expect(body.rows[0]!.tagIds).toContain(ev.tagId!);
  });

  it('tag-shares with 100 shares and two events stays <= 50 queries', async () => {
    const userId = 'u-multi-cap';
    const sid = await memberSid(userId, 'MultiCapUser');
    await switchOn(userId);

    await ensureGroup('g-multi-cap', userId);
    const eventA = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Event One',
          start: '2026-12-10',
          end: '2026-12-15',
          countsFrom: '2026-12-01',
          groupIds: ['g-multi-cap'],
          today: '2026-12-01',
        }),
      )
    ).event;
    const eventB = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Event Two',
          start: '2026-12-10',
          end: '2026-12-15',
          countsFrom: '2026-12-01',
          groupIds: ['g-multi-cap'],
          today: '2026-12-01',
        }),
      )
    ).event;

    const expenses = Array.from({ length: 100 }, (_, i) => ({
      id: `ge-mc-${String(i).padStart(3, '0')}`,
      description: `Expense ${i}`,
      amount: 100_000,
      myShare: 50_000,
      spentOn: '2026-12-12',
    }));
    await seedGroupExpenses('g-multi-cap', userId, expenses);

    // Force a cold trip cache to test the worst-case query budget
    await env.DB.prepare('DELETE FROM personal_trip_cache WHERE user_id = ?').bind(userId).run();

    const { result: res, queries } = await countQueries(() =>
      tagShares(sid, { today: '2026-12-12' }),
    );
    expect(res.status).toBe(200);
    expect(await json<{ tagged: number }>(res)).toEqual({ tagged: 100 });
    expect(queries).toBeLessThanOrEqual(50);

    expect(await getLinkTagIds(userId, 'ge-mc-000')).toEqual([eventA.tagId!, eventB.tagId!].sort());
    expect(await getLinkTagIds(userId, 'ge-mc-099')).toEqual([eventA.tagId!, eventB.tagId!].sort());

    const totalMarks = await env.DB.prepare(
      'SELECT count(*) AS cnt FROM personal_event_share_marks WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(totalMarks?.cnt).toBe(200);
  }, 30_000);
});
