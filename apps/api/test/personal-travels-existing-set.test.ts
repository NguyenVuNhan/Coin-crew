import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  BudgetResponse,
  CategoriesResponse,
  EntryView,
  TravelSavedResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const createTravel = (sid: string, body: unknown) =>
  postJson('/api/me/personal/travels', sid, body);

const patchTravel = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/travels/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const applyExisting = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/travels/${encodeURIComponent(id)}/existing`, sid, body);

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const getBudget = (sid: string, id: string) =>
  call(`/api/me/personal/budgets/${encodeURIComponent(id)}`, as(sid));
const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);
const updateEntry = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/transactions/${encodeURIComponent(id)}`, sid, body, 'PATCH');

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

describe('personal travels existing-items exact set', () => {
  it('own expense whose tag was removed by hand on day 2 is NOT offered or re-tagged after endNow', async () => {
    const userId = 'u-ex-endnow';
    const sid = await memberSid(userId, 'EndNowUser');
    await switchOn(userId);

    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 5_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Đà Nẵng',
          start: '2026-11-10',
          end: '2026-11-15',
          groupIds: [],
          today: '2026-11-10',
        }),
      )
    ).travel;

    // Day 2 expense: tagged with trip, then tag removed by hand
    const day2 = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w.id,
          amount: 120_000,
          categoryId: food.id,
          date: '2026-11-11',
          tags: ['Đà Nẵng'],
        }),
      )
    ).entries[0]!;
    expect(
      (
        await updateEntry(sid, day2.id, {
          type: 'expense',
          walletId: w.id,
          amount: 120_000,
          categoryId: food.id,
          date: '2026-11-11',
          tags: [],
        })
      ).status,
    ).toBe(200);

    // End early on day 3
    const endRes = await patchTravel(sid, created.id, {
      endNow: true,
      today: '2026-11-12',
    });
    expect(endRes.status).toBe(200);
    const ended = await json<TravelSavedResponse>(endRes);
    expect(ended.existing).toEqual({
      own: { count: 0, totals: [] },
      shares: { count: 0, total: 0 },
      ownIds: [],
      shareRootIds: [],
    });

    // Even calling /existing with no ids tags nothing
    const applyRes = await applyExisting(sid, created.id, {
      tag: true,
      ownIds: ended.existing.ownIds,
      shareRootIds: ended.existing.shareRootIds,
    });
    expect(applyRes.status).toBe(200);
    expect(await json<{ tagged: number }>(applyRes)).toEqual({ tagged: 0 });

    const tags = await env.DB.prepare(
      'SELECT tag_id FROM personal_transaction_tags WHERE transaction_id = ?',
    )
      .bind(day2.id)
      .all<{ tag_id: string }>();
    expect(tags.results).toEqual([]);
  });

  it('share declined on an earlier save is NOT tagged by a later Yes, and Yes tags exactly n items', async () => {
    const userId = 'u-ex-decline';
    const sid = await memberSid(userId, 'DeclineUser');
    await switchOn(userId);

    await seedGroupWithExpenses('g-a', userId, [
      { id: 'ge-old', description: 'Old share', amount: 400_000, myShare: 200_000, spentOn: '2026-11-11' },
    ]);
    await seedGroupWithExpenses('g-b', userId, [
      { id: 'ge-new', description: 'New share', amount: 600_000, myShare: 300_000, spentOn: '2026-11-11' },
    ]);

    // First save with g-a: ge-old is offered; user declines ("Chỉ từ giờ trở đi")
    const first = await json<TravelSavedResponse>(
      await createTravel(sid, {
        name: 'Sapa',
        start: '2026-11-10',
        end: '2026-11-12',
        countsFrom: '2026-11-10',
        groupIds: ['g-a'],
        today: '2026-11-27',
      }),
    );
    expect(first.existing.shareRootIds).toEqual(['ge-old']);
    expect(
      await json<{ tagged: number }>(await applyExisting(sid, first.travel.id, { tag: false })),
    ).toEqual({ tagged: 0 });

    // Later PATCH adds g-b: only ge-new is offered (not ge-old)
    const second = await json<TravelSavedResponse>(
      await patchTravel(sid, first.travel.id, {
        groupIds: ['g-a', 'g-b'],
        today: '2026-11-27',
      }),
    );
    expect(second.existing.shares).toEqual({ count: 1, total: 300_000 });
    expect(second.existing.shareRootIds).toEqual(['ge-new']);
    expect(second.existing.ownIds).toEqual([]);

    // User clicks Yes with the returned ids + a bogus id (invalid ids are ignored)
    const applyRes = await applyExisting(sid, first.travel.id, {
      tag: true,
      ownIds: ['nonexistent-own'],
      shareRootIds: [...(second.existing.shareRootIds ?? []), 'nonexistent-share'],
    });
    expect(applyRes.status).toBe(200);
    expect(await json<{ tagged: number }>(applyRes)).toEqual({ tagged: 1 });

    // Only ge-new has the tag; ge-old remains skipped and untagged
    const linkTags = await env.DB.prepare(
      'SELECT root_id FROM personal_group_link_tags WHERE user_id = ? AND tag_id = ? ORDER BY root_id',
    )
      .bind(userId, first.travel.tagId)
      .all<{ root_id: string }>();
    expect(linkTags.results.map((r) => r.root_id)).toEqual(['ge-new']);

    const marks = await env.DB.prepare(
      'SELECT root_id, state FROM personal_travel_share_marks WHERE travel_id = ? ORDER BY root_id',
    )
      .bind(first.travel.id)
      .all<{ root_id: string; state: string }>();
    expect(marks.results).toEqual([
      { root_id: 'ge-new', state: 'tagged' },
      { root_id: 'ge-old', state: 'skipped' },
    ]);
  });

  it('PATCH extending end by 2 days offers only those 2 days entries, and no-ids POST /existing tags 0', async () => {
    const userId = 'u-ex-extend';
    const sid = await memberSid(userId, 'ExtendUser');
    await switchOn(userId);

    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 5_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    // Entry inside original range (Nov 11) — user will NOT tag it on create
    const origEntry = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w.id,
          amount: 100_000,
          categoryId: food.id,
          date: '2026-11-11',
        }),
      )
    ).entries[0]!;

    // Entries in the 2-day extension (Nov 13 & Nov 14)
    const ext1 = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w.id,
          amount: 200_000,
          categoryId: food.id,
          date: '2026-11-13',
        }),
      )
    ).entries[0]!;
    const ext2 = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w.id,
          amount: 300_000,
          categoryId: food.id,
          date: '2026-11-14',
        }),
      )
    ).entries[0]!;

    const created = await json<TravelSavedResponse>(
      await createTravel(sid, {
        name: 'Huế',
        start: '2026-11-10',
        end: '2026-11-12',
        groupIds: [],
        today: '2026-11-27',
      }),
    );
    expect(created.existing.ownIds).toEqual([origEntry.id]);

    // Calling /existing with tag: true and NO ids tags nothing
    expect(
      await json<{ tagged: number }>(await applyExisting(sid, created.travel.id, { tag: true })),
    ).toEqual({ tagged: 0 });

    // Extend end by 2 days (Nov 12 -> Nov 14): only ext1 and ext2 are offered
    const patched = await json<TravelSavedResponse>(
      await patchTravel(sid, created.travel.id, {
        end: '2026-11-14',
        today: '2026-11-27',
      }),
    );
    expect(patched.existing.own.count).toBe(2);
    expect(patched.existing.own.totals).toEqual([{ currency: 'VND', amount: 500_000 }]);
    expect(new Set(patched.existing.ownIds)).toEqual(new Set([ext1.id, ext2.id]));

    // Tagging those 2 ids tags only ext1 and ext2 (not origEntry)
    const applyRes = await applyExisting(sid, created.travel.id, {
      tag: true,
      ownIds: patched.existing.ownIds,
      shareRootIds: patched.existing.shareRootIds,
    });
    expect(applyRes.status).toBe(200);
    expect(await json<{ tagged: number }>(applyRes)).toEqual({ tagged: 2 });

    const txTags = await env.DB.prepare(
      'SELECT transaction_id FROM personal_transaction_tags WHERE tag_id = ? ORDER BY transaction_id',
    )
      .bind(created.travel.tagId)
      .all<{ transaction_id: string }>();
    expect(new Set(txTags.results.map((r) => r.transaction_id))).toEqual(new Set([ext1.id, ext2.id]));
  });

  it('PATCH changing limit currency recomputes budget excluded wallets for the new currency', async () => {
    const userId = 'u-ex-cur';
    const sid = await memberSid(userId, 'CurUser');
    await switchOn(userId);

    const wVndExcl = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'VND Hidden',
          startAmount: 1_000_000,
          startDate: '2026-11-01',
          excludeFromReports: true,
        }),
      )
    ).wallet;
    const wUsdExcl = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'USD Hidden',
          currency: 'USD',
          startAmount: 50_00,
          startCostVnd: 1_250_000,
          startDate: '2026-11-01',
          excludeFromReports: true,
        }),
      )
    ).wallet;

    const created = (
      await json<TravelSavedResponse>(
        await createTravel(sid, {
          name: 'Tokyo',
          start: '2026-12-01',
          end: '2026-12-05',
          groupIds: [],
          limit: { amount: 10_000_000, currency: 'VND' },
          today: '2026-11-27',
        }),
      )
    ).travel;

    const bBefore = (await json<BudgetResponse>(await getBudget(sid, created.budgetId!))).budget;
    expect(bBefore.excludedWalletIds).toEqual([wVndExcl.id]);

    const patchRes = await patchTravel(sid, created.id, {
      limit: { amount: 500_00, currency: 'USD' },
      today: '2026-11-27',
    });
    expect(patchRes.status).toBe(200);

    const bAfter = (await json<BudgetResponse>(await getBudget(sid, created.budgetId!))).budget;
    expect(bAfter.currency).toBe('USD');
    expect(bAfter.excludedWalletIds).toEqual([wUsdExcl.id]);
  });
});
