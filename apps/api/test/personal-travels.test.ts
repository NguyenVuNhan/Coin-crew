import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  BudgetResponse,
  CategoriesResponse,
  EntryView,
  TagView,
  TravelSavedResponse,
  TravelsResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const listTravels = (sid: string | null) =>
  call('/api/me/personal/travels', sid ? as(sid) : {});

const createTravel = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/travels', sid, body);

const patchTravel = (sid: string | null, id: string, body: unknown) =>
  postJson(`/api/me/personal/travels/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteTravel = (sid: string | null, id: string) =>
  call(`/api/me/personal/travels/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ...(sid ? as(sid) : {}),
  });

const applyExisting = (sid: string | null, id: string, body: unknown) =>
  postJson(`/api/me/personal/travels/${encodeURIComponent(id)}/existing`, sid, body);

const getBudget = (sid: string, id: string) =>
  call(`/api/me/personal/budgets/${encodeURIComponent(id)}`, as(sid));

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const getTags = (sid: string) => call('/api/me/personal/tags', as(sid));
const deleteTag = (sid: string, id: string) =>
  call(`/api/me/personal/tags/${encodeURIComponent(id)}`, { method: 'DELETE', ...as(sid) });
const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);
const putGroupLink = (sid: string, rootId: string, body: unknown) =>
  postJson(`/api/me/personal/group-links/${encodeURIComponent(rootId)}`, sid, body, 'PUT');

async function seedGroupWithExpenses(
  tripId: string,
  userId: string,
  expenses: { id: string; description: string; amount: number; myShare: number; spentOn: string }[],
): Promise<void> {
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
    await env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
    )
      .bind(exp.id, otherPid, exp.amount - exp.myShare, exp.amount - exp.myShare)
      .run();
  }
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
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('personal travels routes', () => {
  it('guards every route: 401 signed out, 403 with switch off', async () => {
    expect((await listTravels(null)).status).toBe(401);
    expect((await createTravel(null, {})).status).toBe(401);
    expect((await patchTravel(null, 'tr-1', {})).status).toBe(401);
    expect((await deleteTravel(null, 'tr-1')).status).toBe(401);
    expect((await applyExisting(null, 'tr-1', { tag: true })).status).toBe(401);

    const sid = await memberSid('u-trv-guard', 'Guard');
    expect((await listTravels(sid)).status).toBe(403);
    expect((await createTravel(sid, {})).status).toBe(403);
    expect((await patchTravel(sid, 'tr-1', {})).status).toBe(403);
    expect((await deleteTravel(sid, 'tr-1')).status).toBe(403);
    expect((await applyExisting(sid, 'tr-1', { tag: true })).status).toBe(403);
  });

  it('creates a trip with a new tag, reuses an existing tag case-insensitively, and lists newest start first', async () => {
    const userId = 'u-trv-tags';
    const sid = await memberSid(userId, 'TagsUser');
    await switchOn(userId);

    const res1 = await createTravel(sid, {
      name: 'Đà Lạt',
      start: '2026-12-10',
      end: '2026-12-12',
      groupIds: [],
      today: '2026-11-27',
    });
    expect(res1.status).toBe(201);
    const body1 = await json<TravelSavedResponse>(res1);
    expect(body1.travel.name).toBe('Đà Lạt');
    expect(body1.travel.start).toBe('2026-12-10');
    expect(body1.travel.end).toBe('2026-12-12');
    expect(body1.travel.countsFrom).toBe('2026-11-27');
    expect(body1.travel.groupIds).toEqual([]);
    expect(body1.travel.budgetId).toBeNull();
    expect(body1.existing).toEqual({
      own: { count: 0, totals: [] },
      shares: { count: 0, total: 0 },
    });

    // Reuse existing tag case-insensitively on a later non-overlapping trip
    const res2 = await createTravel(sid, {
      name: 'đà lạt',
      start: '2027-01-05',
      end: '2027-01-08',
      groupIds: [],
      today: '2026-11-27',
    });
    expect(res2.status).toBe(201);
    const body2 = await json<TravelSavedResponse>(res2);
    expect(body2.travel.tagId).toBe(body1.travel.tagId);
    expect(body2.travel.name).toBe('Đà Lạt');

    // List returns newest start first
    const listRes = await listTravels(sid);
    expect(listRes.status).toBe(200);
    const listed = (await json<TravelsResponse>(listRes)).travels;
    expect(listed.map((t) => t.id)).toEqual([body2.travel.id, body1.travel.id]);
  });

  it('rejects start after end and countsFrom after start (422)', async () => {
    const userId = 'u-trv-val';
    const sid = await memberSid(userId, 'ValUser');
    await switchOn(userId);

    const res1 = await createTravel(sid, {
      name: 'Bad Dates',
      start: '2026-12-15',
      end: '2026-12-10',
      groupIds: [],
      today: '2026-11-27',
    });
    expect(res1.status).toBe(422);

    const res2 = await createTravel(sid, {
      name: 'Bad CountsFrom',
      start: '2026-12-10',
      end: '2026-12-15',
      countsFrom: '2026-12-11',
      groupIds: [],
      today: '2026-11-27',
    });
    expect(res2.status).toBe(422);
  });

  it('rejects an overlapping trip (409 TRAVEL_OVERLAP with the other trip) and allows a lead-up overlapping another trip', async () => {
    const userId = 'u-trv-overlap';
    const sid = await memberSid(userId, 'OverlapUser');
    await switchOn(userId);

    const first = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Huế',
          start: '2026-12-20',
          end: '2026-12-23',
          groupIds: [],
          today: '2026-11-27',
        }),
      )
    ).travel;

    const overlapRes = await createTravel(sid, {
      name: 'Đà Nẵng',
      start: '2026-12-23',
      end: '2026-12-26',
      groupIds: [],
      today: '2026-11-27',
    });
    expect(overlapRes.status).toBe(409);
    const errBody = await json<{
      error: {
        code: string;
        details: { travelId: string; name: string; start: string; end: string };
      };
    }>(overlapRes);
    expect(errBody.error.code).toBe('TRAVEL_OVERLAP');
    expect(errBody.error.details).toEqual({
      travelId: first.id,
      name: 'Huế',
      start: '2026-12-20',
      end: '2026-12-23',
    });

    // Lead-up overlapping Huế is allowed because start..end (Dec 24..27) does not overlap Dec 20..23
    const leadupRes = await createTravel(sid, {
      name: 'Đà Nẵng',
      start: '2026-12-24',
      end: '2026-12-27',
      countsFrom: '2026-12-01',
      groupIds: [],
      today: '2026-11-27',
    });
    expect(leadupRes.status).toBe(201);
  });

  it('creates a one-off budget over countsFrom..end when limit is given, moves it on date change and endNow, and deletes it on limit null', async () => {
    const userId = 'u-trv-budget';
    const sid = await memberSid(userId, 'BudgetUser');
    await switchOn(userId);

    const wIncluded = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 5_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const wExcluded = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Hidden',
          startAmount: 1_000_000,
          startDate: '2026-11-01',
          excludeFromReports: true,
        }),
      )
    ).wallet;
    expect(wIncluded.id).toBeTruthy();

    const createRes = await createTravel(sid, {
      name: 'Phú Quốc',
      start: '2026-12-10',
      end: '2026-12-15',
      countsFrom: '2026-12-01',
      groupIds: [],
      limit: { amount: 6_000_000, currency: 'VND' },
      today: '2026-11-27',
    });
    expect(createRes.status).toBe(201);
    const created = (await json<TravelSavedResponse>(createRes)).travel;
    expect(created.budgetId).toBeTruthy();

    const b1 = (await json<BudgetResponse>(await getBudget(sid, created.budgetId!))).budget;
    expect(b1.name).toBe('Phú Quốc');
    expect(b1.periodKind).toBe('once');
    expect(b1.target).toEqual({ kind: 'tag', tagId: created.tagId });
    expect(b1.from).toBe('2026-12-01');
    expect(b1.to).toBe('2026-12-15');
    expect(b1.currency).toBe('VND');
    expect(b1.limits).toEqual([{ effectiveFrom: '2026-12-01', amount: 6_000_000 }]);
    expect(b1.excludedWalletIds).toEqual([wExcluded.id]);

    // Moving dates moves the budget range and its limit's effective_from
    const moveRes = await patchTravel(sid, created.id, {
      countsFrom: '2026-11-28',
      start: '2026-12-08',
      end: '2026-12-14',
      today: '2026-12-09',
    });
    expect(moveRes.status).toBe(200);
    const b2 = (await json<BudgetResponse>(await getBudget(sid, created.budgetId!))).budget;
    expect(b2.from).toBe('2026-11-28');
    expect(b2.to).toBe('2026-12-14');
    expect(b2.limits).toEqual([{ effectiveFrom: '2026-11-28', amount: 6_000_000 }]);

    // Updating limit amount replaces the single limit row
    const amtRes = await patchTravel(sid, created.id, {
      limit: { amount: 7_500_000, currency: 'VND' },
      today: '2026-12-09',
    });
    expect(amtRes.status).toBe(200);
    const b2b = (await json<BudgetResponse>(await getBudget(sid, created.budgetId!))).budget;
    expect(b2b.limits).toEqual([{ effectiveFrom: '2026-11-28', amount: 7_500_000 }]);

    // endNow ends today and moves the budget
    const endNowRes = await patchTravel(sid, created.id, {
      endNow: true,
      today: '2026-12-10',
    });
    expect(endNowRes.status).toBe(200);
    const ended = (await json<TravelSavedResponse>(endNowRes)).travel;
    expect(ended.end).toBe('2026-12-10');
    const b3 = (await json<BudgetResponse>(await getBudget(sid, created.budgetId!))).budget;
    expect(b3.from).toBe('2026-11-28');
    expect(b3.to).toBe('2026-12-10');
    expect(b3.limits).toEqual([{ effectiveFrom: '2026-11-28', amount: 7_500_000 }]);

    // limit: null deletes the budget
    const removeLimitRes = await patchTravel(sid, created.id, {
      limit: null,
      today: '2026-12-10',
    });
    expect(removeLimitRes.status).toBe(200);
    const noLimit = (await json<TravelSavedResponse>(removeLimitRes)).travel;
    expect(noLimit.budgetId).toBeNull();
    expect((await getBudget(sid, created.budgetId!)).status).toBe(404);
  });

  it('delete removes the trip and its budget but keeps the tag and tagged entries', async () => {
    const userId = 'u-trv-del';
    const sid = await memberSid(userId, 'DelUser');
    await switchOn(userId);

    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 2_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Nha Trang',
          start: '2026-11-10',
          end: '2026-11-12',
          groupIds: [],
          limit: { amount: 3_000_000, currency: 'VND' },
          today: '2026-11-10',
        }),
      )
    ).travel;

    const entryRes = await createEntry(sid, {
      type: 'expense',
      walletId: w.id,
      amount: 150_000,
      categoryId: food.id,
      date: '2026-11-11',
      tags: ['Nha Trang'],
    });
    expect(entryRes.status).toBe(201);
    const entry = (await json<{ entries: EntryView[] }>(entryRes)).entries[0]!;

    const delRes = await deleteTravel(sid, created.id);
    expect(delRes.status).toBe(204);

    // Trip and budget are gone
    const listed = (await json<TravelsResponse>(await listTravels(sid))).travels;
    expect(listed).toHaveLength(0);
    expect((await getBudget(sid, created.budgetId!)).status).toBe(404);

    // Tag and transaction-tag link stay
    const tags = (await json<{ tags: TagView[] }>(await getTags(sid))).tags;
    expect(tags.find((t) => t.id === created.tagId)?.useCount).toBe(1);
    const txTag = await env.DB.prepare(
      'SELECT tag_id FROM personal_transaction_tags WHERE transaction_id = ?',
    )
      .bind(entry.id)
      .first<{ tag_id: string }>();
    expect(txTag?.tag_id).toBe(created.tagId);
  });

  it('creates a past trip, marks existing shares skipped, and existing tag:true tags own expenses start..end only and skipped shares', async () => {
    const userId = 'u-trv-existing';
    const sid = await memberSid(userId, 'ExistingUser');
    await switchOn(userId);

    const wVnd = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'VND', startAmount: 10_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const wUsd = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'USD',
          currency: 'USD',
          startAmount: 100_00,
          startCostVnd: 2_500_000,
          startDate: '2026-10-01',
        }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;
    const salary = cats.find((c) => c.type === 'income')!;

    // Own lead-up expense (Nov 5: in countsFrom..start-1 -> MUST NOT be counted or tagged)
    const leadupEntry = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wVnd.id,
          amount: 200_000,
          categoryId: food.id,
          date: '2026-11-05',
          note: 'Bus ticket',
        }),
      )
    ).entries[0]!;

    // Own expenses inside start..end (Nov 10..12)
    const ownVnd = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wVnd.id,
          amount: 350_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Dinner',
        }),
      )
    ).entries[0]!;
    const ownUsd = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wUsd.id,
          amount: 25_00,
          categoryId: food.id,
          date: '2026-11-11',
          note: 'Souvenir',
        }),
      )
    ).entries[0]!;

    // Own income inside start..end -> MUST NOT be counted or tagged
    const ownIncome = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'income',
          walletId: wVnd.id,
          amount: 1_000_000,
          categoryId: salary.id,
          date: '2026-11-11',
          note: 'Refund',
        }),
      )
    ).entries[0]!;

    // Seed group with expenses: one in lead-up (Nov 5), one in trip (Nov 11), one outside (Nov 20)
    await seedGroupWithExpenses('g-dalat', userId, [
      { id: 'ge-leadup', description: 'Hotel deposit', amount: 1_000_000, myShare: 500_000, spentOn: '2026-11-05' },
      { id: 'ge-trip', description: 'BBQ', amount: 800_000, myShare: 400_000, spentOn: '2026-11-11' },
      { id: 'ge-outside', description: 'Later', amount: 300_000, myShare: 150_000, spentOn: '2026-11-20' },
    ]);

    // Pre-existing group link on ge-trip with custom walletId so we verify upsert preserves it
    const linkRes = await putGroupLink(sid, 'ge-trip', { walletId: wVnd.id });
    expect(linkRes.status).toBe(200);

    // Create past trip
    const { result: createRes, queries: createQ } = await countQueries(() =>
      createTravel(sid, {
        name: 'Đà Lạt Nov',
        start: '2026-11-10',
        end: '2026-11-12',
        countsFrom: '2026-11-01',
        groupIds: ['g-dalat'],
        today: '2026-11-27',
      }),
    );
    expect(createRes.status).toBe(201);
    expect(createQ).toBeLessThanOrEqual(50);

    const saved = await json<TravelSavedResponse>(createRes);
    expect(saved.existing.own.count).toBe(2);
    expect(saved.existing.own.totals).toEqual(
      expect.arrayContaining([
        { currency: 'VND', amount: 350_000 },
        { currency: 'USD', amount: 25_00 },
      ]),
    );
    expect(saved.existing.shares).toEqual({ count: 2, total: 900_000 });

    // Marks in DB are 'skipped' for ge-leadup and ge-trip (not ge-outside)
    const marksBefore = await env.DB.prepare(
      'SELECT root_id, state FROM personal_travel_share_marks WHERE travel_id = ? ORDER BY root_id',
    )
      .bind(saved.travel.id)
      .all<{ root_id: string; state: string }>();
    expect(marksBefore.results).toEqual([
      { root_id: 'ge-leadup', state: 'skipped' },
      { root_id: 'ge-trip', state: 'skipped' },
    ]);

    // tag: false does nothing
    const skipRes = await applyExisting(sid, saved.travel.id, { tag: false });
    expect(skipRes.status).toBe(200);
    expect(await json<{ tagged: number }>(skipRes)).toEqual({ tagged: 0 });

    // tag: true tags own expenses start..end only and the skipped shares
    const { result: applyRes, queries: applyQ } = await countQueries(() =>
      applyExisting(sid, saved.travel.id, { tag: true }),
    );
    expect(applyRes.status).toBe(200);
    expect(applyQ).toBeLessThanOrEqual(50);
    expect(await json<{ tagged: number }>(applyRes)).toEqual({ tagged: 4 });

    // Verify own transaction tags
    const txTags = await env.DB.prepare(
      'SELECT transaction_id FROM personal_transaction_tags WHERE tag_id = ? ORDER BY transaction_id',
    )
      .bind(saved.travel.tagId)
      .all<{ transaction_id: string }>();
    const taggedTxIds = txTags.results.map((r) => r.transaction_id);
    expect(taggedTxIds).toContain(ownVnd.id);
    expect(taggedTxIds).toContain(ownUsd.id);
    expect(taggedTxIds).not.toContain(leadupEntry.id);
    expect(taggedTxIds).not.toContain(ownIncome.id);

    // Verify share marks turned into 'tagged'
    const marksAfter = await env.DB.prepare(
      'SELECT root_id, state FROM personal_travel_share_marks WHERE travel_id = ? ORDER BY root_id',
    )
      .bind(saved.travel.id)
      .all<{ root_id: string; state: string }>();
    expect(marksAfter.results).toEqual([
      { root_id: 'ge-leadup', state: 'tagged' },
      { root_id: 'ge-trip', state: 'tagged' },
    ]);

    // Verify group link tags inserted and existing walletId preserved on ge-trip
    const linkTags = await env.DB.prepare(
      'SELECT root_id FROM personal_group_link_tags WHERE user_id = ? AND tag_id = ? ORDER BY root_id',
    )
      .bind(userId, saved.travel.tagId)
      .all<{ root_id: string }>();
    expect(linkTags.results.map((r) => r.root_id)).toEqual(['ge-leadup', 'ge-trip']);

    const preservedLink = await env.DB.prepare(
      'SELECT wallet_id FROM personal_group_links WHERE user_id = ? AND root_id = ?',
    )
      .bind(userId, 'ge-trip')
      .first<{ wallet_id: string | null }>();
    expect(preservedLink?.wallet_id).toBe(wVnd.id);
  });

  it('renaming the trip renames the tag; 409 TAG_TAKEN when the name is taken', async () => {
    const userId = 'u-trv-rename';
    const sid = await memberSid(userId, 'RenameUser');
    await switchOn(userId);

    // Seed another tag
    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-taken', ?, 'Sapa', '2026-11-01T00:00:00.000Z')",
    )
      .bind(userId)
      .run();

    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Hội An',
          start: '2026-12-01',
          end: '2026-12-03',
          groupIds: [],
          today: '2026-11-27',
        }),
      )
    ).travel;

    // 409 TAG_TAKEN when name belongs to another tag (case-insensitive)
    const takenRes = await patchTravel(sid, created.id, {
      name: 'sapa',
      today: '2026-11-27',
    });
    expect(takenRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(takenRes)).error.code).toBe('TAG_TAKEN');

    // Valid rename renames the tag
    const okRes = await patchTravel(sid, created.id, {
      name: 'Hội An 2026',
      today: '2026-11-27',
    });
    expect(okRes.status).toBe(200);
    const updated = (await json<TravelSavedResponse>(okRes)).travel;
    expect(updated.name).toBe('Hội An 2026');
    expect(updated.tagId).toBe(created.tagId);

    const tags = (await json<{ tags: TagView[] }>(await getTags(sid))).tags;
    expect(tags.find((t) => t.id === created.tagId)?.name).toBe('Hội An 2026');
  });

  it('deleting the tag deletes the trip', async () => {
    const userId = 'u-trv-deltag';
    const sid = await memberSid(userId, 'DelTagUser');
    await switchOn(userId);

    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Cần Thơ',
          start: '2026-12-01',
          end: '2026-12-02',
          groupIds: [],
          today: '2026-11-27',
        }),
      )
    ).travel;

    const delTagRes = await deleteTag(sid, created.tagId);
    expect(delTagRes.status).toBe(200);

    const listed = (await json<TravelsResponse>(await listTravels(sid))).travels;
    expect(listed).toHaveLength(0);
  });

  it("foreign user's trip is 404", async () => {
    const sidA = await memberSid('u-trv-a', 'UserA');
    const sidB = await memberSid('u-trv-b', 'UserB');
    await switchOn('u-trv-a');
    await switchOn('u-trv-b');

    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sidA, {
          name: 'Private Trip',
          start: '2026-12-01',
          end: '2026-12-03',
          groupIds: [],
          today: '2026-11-27',
        }),
      )
    ).travel;

    expect((await patchTravel(sidB, created.id, { name: 'Stolen', today: '2026-11-27' })).status).toBe(404);
    expect((await deleteTravel(sidB, created.id)).status).toBe(404);
    expect((await applyExisting(sidB, created.id, { tag: true })).status).toBe(404);
  });
});
