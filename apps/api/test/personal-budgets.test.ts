import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  MAX_AMOUNT,
  budgetSpent,
  firstBudgetPeriod,
  type BudgetResponse,
  type BudgetsProgressResponse,
  type BudgetsResponse,
  type CategoriesResponse,
  type CategoryView,
  type ReportData,
  type WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const listBudgets = (sid: string | null) =>
  call('/api/me/personal/budgets', sid ? as(sid) : {});

const getBudget = (sid: string | null, id: string) =>
  call(`/api/me/personal/budgets/${encodeURIComponent(id)}`, sid ? as(sid) : {});

const createBudget = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/budgets', sid, body);

const patchBudget = (sid: string | null, id: string, body: unknown) =>
  postJson(`/api/me/personal/budgets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteBudget = (sid: string | null, id: string) =>
  call(`/api/me/personal/budgets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ...(sid ? as(sid) : {}),
  });

const getProgress = (sid: string | null, query = '') =>
  call(`/api/me/personal/budgets/progress${query}`, sid ? as(sid) : {});

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const createCategory = (sid: string, body: unknown) =>
  postJson('/api/me/personal/categories', sid, body);
const deleteCategory = (sid: string, id: string) =>
  call(`/api/me/personal/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ...as(sid),
  });
const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);
const getReport = (sid: string, query = '') => call(`/api/me/personal/report${query}`, as(sid));

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_budget_excluded_wallets').run();
  await env.DB.prepare('DELETE FROM personal_budget_limits').run();
  await env.DB.prepare('DELETE FROM personal_budgets').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('personal budgets routes', () => {
  it('1. auth & Phase 2 guards: 401 signed out, 403 with switch off for every budget route', async () => {
    // Signed out -> 401
    expect((await listBudgets(null)).status).toBe(401);
    expect((await getBudget(null, 'b-1')).status).toBe(401);
    expect((await createBudget(null, {})).status).toBe(401);
    expect((await patchBudget(null, 'b-1', {})).status).toBe(401);
    expect((await deleteBudget(null, 'b-1')).status).toBe(401);
    expect((await getProgress(null, '?today=2026-11-26')).status).toBe(401);

    // Switch off -> 403 for every budget route
    const sid = await memberSid('u-bgt-guard', 'GuardUser');
    expect((await listBudgets(sid)).status).toBe(403);
    expect((await getBudget(sid, 'b-1')).status).toBe(403);
    expect((await createBudget(sid, {})).status).toBe(403);
    expect((await patchBudget(sid, 'b-1', {})).status).toBe(403);
    expect((await deleteBudget(sid, 'b-1')).status).toBe(403);
    expect((await getProgress(sid, '?today=2026-11-26')).status).toBe(403);
  });

  it('2. create -> list round-trip, default name, excluded wallets, and tag budget', async () => {
    const userId = 'u-bgt-crud';
    const sid = await memberSid(userId, 'CrudUser');
    await switchOn(userId);

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 5_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Savings', startAmount: 10_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    // Create category budget (omitting name defaults to category name)
    const createRes = await createBudget(sid, {
      target: { kind: 'category', categoryId: food.id },
      currency: 'VND',
      amount: 3_000_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: [w2.id],
      today: '2026-11-15',
    });
    expect(createRes.status).toBe(201);
    const created = (await json<BudgetResponse>(createRes)).budget;

    expect(created.name).toBe(food.name);
    expect(created.target).toEqual({ kind: 'category', categoryId: food.id });
    expect(created.currency).toBe('VND');
    expect(created.periodKind).toBe('month');
    expect(created.monthStartDay).toBe(1);
    expect(created.from).toBeNull();
    expect(created.to).toBeNull();
    expect(created.excludedWalletIds).toEqual([w2.id]);
    expect(created.limits).toEqual([{ effectiveFrom: '2026-11-01', amount: 3_000_000 }]);
    expect(created.suggestionDismissedUntil).toBeNull();
    expect(created.createdOn).toBe('2026-11-15');

    // Create tag & once-budget
    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-trip', ?, 'Đà Lạt', '2026-11-01T00:00:00.000Z')",
    )
      .bind(userId)
      .run();

    const tagRes = await createBudget(sid, {
      name: 'Chuyến Đà Lạt',
      target: { kind: 'tag', tagId: 'tag-trip' },
      currency: 'VND',
      amount: 5_000_000,
      periodKind: 'once',
      from: '2026-11-20',
      to: '2026-11-25',
      excludedWalletIds: [],
      today: '2026-11-15',
    });
    expect(tagRes.status).toBe(201);
    const tagBudget = (await json<BudgetResponse>(tagRes)).budget;
    expect(tagBudget.name).toBe('Chuyến Đà Lạt');
    expect(tagBudget.limits).toEqual([{ effectiveFrom: '2026-11-20', amount: 5_000_000 }]);

    // List round-trip
    const listRes = await listBudgets(sid);
    expect(listRes.status).toBe(200);
    const listed = (await json<BudgetsResponse>(listRes)).budgets;
    expect(listed).toHaveLength(2);
    expect(listed.map((b) => b.id)).toEqual([created.id, tagBudget.id]);
    expect(listed[0]).toEqual(created);
    expect(listed[1]).toEqual(tagBudget);

    // Unused w1 check
    expect(w1.id).toBeTruthy();

    // Delete budget
    const delRes = await deleteBudget(sid, created.id);
    expect(delRes.status).toBe(200);
    expect(await json<{ ok: boolean }>(delRes)).toEqual({ ok: true });

    const listAfter = (await json<BudgetsResponse>(await listBudgets(sid))).budgets;
    expect(listAfter.map((b) => b.id)).toEqual([tagBudget.id]);
  });

  it('3. validation -> 422 for every invalid input and 409 DUPLICATE on duplicate target+period', async () => {
    const sidA = await memberSid('u-bgt-val-a', 'ValA');
    const sidB = await memberSid('u-bgt-val-b', 'ValB');
    await switchOn('u-bgt-val-a');
    await switchOn('u-bgt-val-b');

    const wB = (
      await json<WalletDetailResponse>(
        await addWallet(sidB, { name: 'B Wallet', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const catsA = (await json<CategoriesResponse>(await getCategories(sidA))).categories;
    const foodA = catsA.find((c) => c.type === 'expense')!;
    const incomeA = catsA.find((c) => c.type === 'income')!;

    const catsB = (await json<CategoriesResponse>(await getCategories(sidB))).categories;
    const foodB = catsB.find((c) => c.type === 'expense')!;

    const validBase = {
      target: { kind: 'category', categoryId: foodA.id },
      currency: 'VND',
      amount: 1_000_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: [] as string[],
      today: '2026-11-26',
    };

    // Income category -> 422
    expect(
      (await createBudget(sidA, { ...validBase, target: { kind: 'category', categoryId: incomeA.id } })).status,
    ).toBe(422);

    // Foreign category -> 422
    expect(
      (await createBudget(sidA, { ...validBase, target: { kind: 'category', categoryId: foodB.id } })).status,
    ).toBe(422);

    // Missing category -> 422
    expect(
      (await createBudget(sidA, { ...validBase, target: { kind: 'category', categoryId: 'cat-nope' } })).status,
    ).toBe(422);

    // Missing tag -> 422
    expect(
      (await createBudget(sidA, { ...validBase, target: { kind: 'tag', tagId: 'tag-nope' } })).status,
    ).toBe(422);

    // Invalid currency -> 422
    expect((await createBudget(sidA, { ...validBase, currency: 'FAKE' })).status).toBe(422);

    // Invalid amount: 0, negative, float, > MAX_AMOUNT -> 422
    expect((await createBudget(sidA, { ...validBase, amount: 0 })).status).toBe(422);
    expect((await createBudget(sidA, { ...validBase, amount: -500 })).status).toBe(422);
    expect((await createBudget(sidA, { ...validBase, amount: 100.5 })).status).toBe(422);
    expect((await createBudget(sidA, { ...validBase, amount: MAX_AMOUNT + 1 })).status).toBe(422);

    // Invalid monthStartDay: 0, 32, float -> 422
    expect((await createBudget(sidA, { ...validBase, monthStartDay: 0 })).status).toBe(422);
    expect((await createBudget(sidA, { ...validBase, monthStartDay: 32 })).status).toBe(422);
    expect((await createBudget(sidA, { ...validBase, monthStartDay: 1.5 })).status).toBe(422);

    // Once without from/to or from > to -> 422
    expect(
      (await createBudget(sidA, { ...validBase, periodKind: 'once', monthStartDay: undefined })).status,
    ).toBe(422);
    expect(
      (
        await createBudget(sidA, {
          ...validBase,
          periodKind: 'once',
          monthStartDay: undefined,
          from: '2026-11-25',
          to: '2026-11-20',
        })
      ).status,
    ).toBe(422);

    // Foreign excluded wallet -> 422
    expect((await createBudget(sidA, { ...validBase, excludedWalletIds: [wB.id] })).status).toBe(422);

    // Invalid today -> 422
    expect((await createBudget(sidA, { ...validBase, today: '2026-02-31' })).status).toBe(422);

    // Valid create succeeds
    const okRes = await createBudget(sidA, validBase);
    expect(okRes.status).toBe(201);

    // Duplicate target + period -> 409 DUPLICATE
    const dupRes = await createBudget(sidA, validBase);
    expect(dupRes.status).toBe(409);
    const dupBody = await json<{ error: { code: string } }>(dupRes);
    expect(dupBody.error.code).toBe('DUPLICATE');
  });

  it('4. PATCH amount adds limit effective at current period start and keeps old one; immutable fields -> 422', async () => {
    const userId = 'u-bgt-patch';
    const sid = await memberSid(userId, 'PatchUser');
    await switchOn(userId);

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 5_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Extra', startAmount: 5_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    // Created in October 2026 -> first limit effective 2026-10-01
    const created = (
      await json<BudgetResponse>(
        await createBudget(sid, {
          target: { kind: 'category', categoryId: food.id },
          currency: 'VND',
          amount: 2_000_000,
          periodKind: 'month',
          monthStartDay: 1,
          excludedWalletIds: [],
          today: '2026-10-10',
        }),
      )
    ).budget;
    expect(created.limits).toEqual([{ effectiveFrom: '2026-10-01', amount: 2_000_000 }]);

    // PATCH amount on 2026-11-26 -> adds limit effective 2026-11-01 and keeps 2026-10-01
    const patchRes = await patchBudget(sid, created.id, {
      name: 'Ăn uống mới',
      amount: 2_500_000,
      excludedWalletIds: [w2.id],
      dismissSuggestion: true,
      today: '2026-11-26',
    });
    expect(patchRes.status).toBe(200);
    const updated = (await json<BudgetResponse>(patchRes)).budget;

    expect(updated.name).toBe('Ăn uống mới');
    expect(updated.limits).toEqual([
      { effectiveFrom: '2026-10-01', amount: 2_000_000 },
      { effectiveFrom: '2026-11-01', amount: 2_500_000 },
    ]);
    expect(updated.excludedWalletIds).toEqual([w2.id]);
    expect(updated.suggestionDismissedUntil).toBe('2026-11-01');

    // PATCH amount again in same period upserts 2026-11-01 in place
    const patchAgain = await patchBudget(sid, created.id, {
      amount: 2_800_000,
      today: '2026-11-28',
    });
    expect(patchAgain.status).toBe(200);
    expect((await json<BudgetResponse>(patchAgain)).budget.limits).toEqual([
      { effectiveFrom: '2026-10-01', amount: 2_000_000 },
      { effectiveFrom: '2026-11-01', amount: 2_800_000 },
    ]);

    // Immutable fields -> 422
    expect((await patchBudget(sid, created.id, { periodKind: 'week', today: '2026-11-26' })).status).toBe(422);
    expect((await patchBudget(sid, created.id, { monthStartDay: 15, today: '2026-11-26' })).status).toBe(422);
    expect(
      (await patchBudget(sid, created.id, { target: { kind: 'category', categoryId: food.id }, today: '2026-11-26' }))
        .status,
    ).toBe(422);
    expect((await patchBudget(sid, created.id, { currency: 'USD', today: '2026-11-26' })).status).toBe(422);

    expect(w1.id).toBeTruthy();
  });

  it('5. cross-account isolation (rule 6): second account gets 404 on GET/PATCH/DELETE and sees none in list', async () => {
    const sidA = await memberSid('u-bgt-iso-a', 'IsoA');
    const sidB = await memberSid('u-bgt-iso-b', 'IsoB');
    await switchOn('u-bgt-iso-a');
    await switchOn('u-bgt-iso-b');

    const catsA = (await json<CategoriesResponse>(await getCategories(sidA))).categories;
    const foodA = catsA.find((c) => c.type === 'expense')!;

    const createdA = (
      await json<BudgetResponse>(
        await createBudget(sidA, {
          target: { kind: 'category', categoryId: foodA.id },
          currency: 'VND',
          amount: 1_500_000,
          periodKind: 'month',
          monthStartDay: 1,
          excludedWalletIds: [],
          today: '2026-11-26',
        }),
      )
    ).budget;

    // Account B sees none in list
    const listB = await listBudgets(sidB);
    expect(listB.status).toBe(200);
    expect((await json<BudgetsResponse>(listB)).budgets).toEqual([]);

    // Account B gets 404 on GET / PATCH / DELETE of Account A's budget
    expect((await getBudget(sidB, createdA.id)).status).toBe(404);
    expect((await patchBudget(sidB, createdA.id, { name: 'Hacked', today: '2026-11-26' })).status).toBe(404);
    expect((await deleteBudget(sidB, createdA.id)).status).toBe(404);

    // Account A still owns it intact
    const getA = await getBudget(sidA, createdA.id);
    expect(getA.status).toBe(200);
    expect((await json<BudgetResponse>(getA)).budget.id).toBe(createdA.id);
  });

  it('6. deleting the target category removes the budget from the list (Review Focus 4)', async () => {
    const userId = 'u-bgt-orphan';
    const sid = await memberSid(userId, 'OrphanUser');
    await switchOn(userId);

    // Create a custom expense category so it can be deleted
    const catRes = await createCategory(sid, {
      type: 'expense',
      name: 'Hobby',
      icon: 'star',
    });
    expect(catRes.status).toBe(201);
    const hobby = (await json<{ category: CategoryView }>(catRes)).category;

    const created = (
      await json<BudgetResponse>(
        await createBudget(sid, {
          target: { kind: 'category', categoryId: hobby.id },
          currency: 'VND',
          amount: 500_000,
          periodKind: 'month',
          monthStartDay: 1,
          excludedWalletIds: [],
          today: '2026-11-26',
        }),
      )
    ).budget;

    expect((await json<BudgetsResponse>(await listBudgets(sid))).budgets).toHaveLength(1);

    // Delete the target category
    expect((await deleteCategory(sid, hobby.id)).status).toBe(200);

    // GET /me/personal/budgets deletes the orphaned budget and leaves it out
    const listAfter = await listBudgets(sid);
    expect(listAfter.status).toBe(200);
    expect((await json<BudgetsResponse>(listAfter)).budgets).toEqual([]);

    // Verify it is actually deleted from D1
    const dbRow = await env.DB.prepare('SELECT count(*) AS n FROM personal_budgets WHERE id = ?')
      .bind(created.id)
      .first<{ n: number }>();
    expect(dbRow?.n).toBe(0);
  });

  it('7. progress route agrees with report category total and stays <= 50 queries per route', async () => {
    const userId = 'u-bgt-agree';
    const sid = await memberSid(userId, 'AgreeUser');
    await switchOn(userId);

    const wMain = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 10_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

    // Sub-category under Food
    const coffee = (
      await json<{ category: CategoryView }>(
        await createCategory(sid, { parentId: food.id, type: 'expense', name: 'Cà phê', icon: 'coffee' }),
      )
    ).category;

    // Seed expenses in Oct (before budget first period) and Nov (inside budget period)
    await createEntry(sid, {
      type: 'expense',
      walletId: wMain.id,
      amount: 90_000,
      categoryId: food.id,
      date: '2026-10-15',
      note: 'Oct food',
    });
    await createEntry(sid, {
      type: 'expense',
      walletId: wMain.id,
      amount: 120_000,
      categoryId: food.id,
      date: '2026-11-10',
      note: 'Nov lunch',
    });
    await createEntry(sid, {
      type: 'expense',
      walletId: wMain.id,
      amount: 55_000,
      categoryId: coffee.id,
      date: '2026-11-12',
      note: 'Nov coffee',
    });
    // Excluded expense should not count
    await createEntry(sid, {
      type: 'expense',
      walletId: wMain.id,
      amount: 500_000,
      categoryId: food.id,
      date: '2026-11-14',
      note: 'Excluded',
      excludeFromReports: true,
    });

    // Spy on env.DB to verify <= 50 queries for every route
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

    // Create budget in November
    const { result: createRes, queries: createQ } = await countQueries(() =>
      createBudget(sid, {
        target: { kind: 'category', categoryId: food.id },
        currency: 'VND',
        amount: 1_000_000,
        periodKind: 'month',
        monthStartDay: 1,
        excludedWalletIds: [],
        today: '2026-11-26',
      }),
    );
    expect(createRes.status).toBe(201);
    expect(createQ).toBeLessThanOrEqual(50);
    const budget = (await json<BudgetResponse>(createRes)).budget;

    // List budgets
    const { result: listRes, queries: listQ } = await countQueries(() => listBudgets(sid));
    expect(listRes.status).toBe(200);
    expect(listQ).toBeLessThanOrEqual(50);

    // Progress route
    const { result: progRes, queries: progQ } = await countQueries(() =>
      getProgress(sid, '?today=2026-11-26'),
    );
    expect(progRes.status).toBe(200);
    expect(progQ).toBeLessThanOrEqual(50);
    const { rows } = await json<BudgetsProgressResponse>(progRes);

    // October row is filtered out because earliest budget's first period is 2026-11-01
    expect(rows.every((r) => r.date >= '2026-11-01')).toBe(true);

    // Agreement with GET /me/personal/report?mode=month&month=2026-11&walletId=...
    const repRes = await getReport(
      sid,
      `?mode=month&month=2026-11&walletId=${encodeURIComponent(wMain.id)}&today=2026-11-26`,
    );
    expect(repRes.status).toBe(200);
    const report = await json<ReportData>(repRes);
    const reportFood = report.spendingByCategory.find((c) => c.categoryId === food.id);
    expect(reportFood).toBeDefined();

    const allCats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const spent = budgetSpent(budget, rows, firstBudgetPeriod(budget), allCats);
    expect(spent).toBe(175_000);
    expect(spent).toBe(reportFood!.amount);

    // PATCH + DELETE query budgets
    const { result: patchRes, queries: patchQ } = await countQueries(() =>
      patchBudget(sid, budget.id, { amount: 1_200_000, today: '2026-11-26' }),
    );
    expect(patchRes.status).toBe(200);
    expect(patchQ).toBeLessThanOrEqual(50);

    const { result: delRes, queries: delQ } = await countQueries(() => deleteBudget(sid, budget.id));
    expect(delRes.status).toBe(200);
    expect(delQ).toBeLessThanOrEqual(50);
  });
});
