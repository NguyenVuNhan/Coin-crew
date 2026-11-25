import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  CategoryView,
  EntriesResponse,
  ListResponse,
  ReportCategoryDrilldown,
  ReportData,
  TagView,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getReport = (sid: string | null, query = '') =>
  call(`/api/me/personal/report${query}`, sid ? as(sid) : {});

const getCategoryDrilldown = (sid: string | null, categoryId: string, query = '') =>
  call(`/api/me/personal/report/category/${encodeURIComponent(categoryId)}${query}`, sid ? as(sid) : {});

const getList = (sid: string | null, query = '') =>
  call(`/api/me/personal/transactions${query}`, sid ? as(sid) : {});

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const getTags = (sid: string) => call('/api/me/personal/tags', as(sid));

const createCategory = (sid: string, body: unknown) =>
  postJson('/api/me/personal/categories', sid, body);

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const patchWallet = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/wallets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

afterEach(async () => {
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

describe('personal reports and category drilldown routes', () => {
  it('1. auth & Phase 2 guards: signed out returns 401, personalArea switch off returns 403', async () => {
    // Signed out
    const resNoAuth = await getReport(null);
    expect(resNoAuth.status).toBe(401);

    const resDrillNoAuth = await getCategoryDrilldown(null, 'cat-1');
    expect(resDrillNoAuth.status).toBe(401);

    // Switch off
    const sid = await memberSid('u-rep-guard', 'GuardUser');
    // personal area enabled is 0 by default
    const resOff = await getReport(sid);
    expect(resOff.status).toBe(403);

    const resDrillOff = await getCategoryDrilldown(sid, 'cat-1');
    expect(resDrillOff.status).toBe(403);
  });

  it('2. validation & 404 checks: foreign walletId, invalid mode, month, from>to, >366 days, groups, unknown categoryId', async () => {
    const sidA = await memberSid('u-rep-val-a', 'ValA');
    const sidB = await memberSid('u-rep-val-b', 'ValB');
    await switchOn('u-rep-val-a');
    await switchOn('u-rep-val-b');

    const wB = (
      await json<WalletDetailResponse>(
        await addWallet(sidB, { name: 'Wallet B', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    // Foreign walletId -> 404
    const resForeignWallet = await getReport(sidA, `?walletId=${encodeURIComponent(wB.id)}`);
    expect(resForeignWallet.status).toBe(404);

    // Non-existent walletId -> 404
    const resMissingWallet = await getReport(sidA, '?walletId=wallet-nonexistent');
    expect(resMissingWallet.status).toBe(404);

    // Invalid mode -> 422
    expect((await getReport(sidA, '?mode=biweekly')).status).toBe(422);

    // Malformed month -> 422
    expect((await getReport(sidA, '?month=2026-13')).status).toBe(422);
    expect((await getReport(sidA, '?month=bad-month')).status).toBe(422);

    // Malformed week -> 422
    expect((await getReport(sidA, '?week=bad-week')).status).toBe(422);

    // Malformed year -> 422
    expect((await getReport(sidA, '?year=202')).status).toBe(422);
    expect((await getReport(sidA, '?year=20266')).status).toBe(422);

    // Malformed today -> 422
    expect((await getReport(sidA, '?today=2026-02-31')).status).toBe(422);

    // Custom mode missing from/to -> 422
    expect((await getReport(sidA, '?mode=custom')).status).toBe(422);
    expect((await getReport(sidA, '?mode=custom&from=2026-11-01')).status).toBe(422);
    expect((await getReport(sidA, '?mode=custom&to=2026-11-10')).status).toBe(422);

    // Custom mode from > to -> 422
    expect((await getReport(sidA, '?mode=custom&from=2026-11-20&to=2026-11-10')).status).toBe(422);

    // Custom range > 366 inclusive days -> 422 (2025-01-01..2026-01-02 = 367 days)
    expect((await getReport(sidA, '?mode=custom&from=2025-01-01&to=2026-01-02')).status).toBe(422);

    // Custom range <= 366 inclusive days -> 200 (2025-01-01..2026-01-01 = 366 days)
    expect((await getReport(sidA, '?mode=custom&from=2025-01-01&to=2026-01-01')).status).toBe(200);

    // Invalid groups -> 422
    expect((await getReport(sidA, '?groups=all')).status).toBe(422);

    // Unknown categoryId on drilldown route -> 404
    expect((await getCategoryDrilldown(sidA, 'cat-completely-unknown')).status).toBe(404);
  });

  it('3. cross-account isolation: user B rows and group activity never leak into user A report', async () => {
    const sidA = await memberSid('u-rep-iso-a', 'IsoA');
    const sidB = await memberSid('u-rep-iso-b', 'IsoB');
    await switchOn('u-rep-iso-a');
    await switchOn('u-rep-iso-b');

    // User A wallet & entry
    const wA = (
      await json<WalletDetailResponse>(
        await addWallet(sidA, { name: 'A Wallet', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const catsA = (await json<CategoriesResponse>(await getCategories(sidA))).categories;
    const foodA = catsA.find((c) => c.type === 'expense')!;
    await createEntry(sidA, {
      type: 'expense',
      walletId: wA.id,
      amount: 45_000,
      categoryId: foodA.id,
      date: '2026-11-10',
      note: 'A lunch',
      tags: ['TagA'],
    });

    // User B wallet, entry, and group trip
    const wB = (
      await json<WalletDetailResponse>(
        await addWallet(sidB, { name: 'B Wallet', startAmount: 5_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const catsB = (await json<CategoriesResponse>(await getCategories(sidB))).categories;
    const foodB = catsB.find((c) => c.type === 'expense')!;
    await createEntry(sidB, {
      type: 'expense',
      walletId: wB.id,
      amount: 500_000,
      categoryId: foodB.id,
      date: '2026-11-11',
      note: 'B dinner',
      tags: ['TagB'],
    });

    const ledgerB = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sidB)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sidB, { name: 'Lan' }),
    );
    await postJson(`/api/trips/${ledgerB.tripId}/expenses`, sidB, {
      description: 'B group lunch',
      amount: 200_000,
      spentOn: '2026-11-12',
      payerId: ledgerB.ownerPid,
      mode: 'equal',
      entries: [
        { participantId: ledgerB.ownerPid, value: 1 },
        { participantId: lanPid, value: 1 },
      ],
    });

    // Request report as User A
    const resA = await getReport(sidA, '?month=2026-11&today=2026-11-24');
    expect(resA.status).toBe(200);
    const repA = await json<ReportData>(resA);

    expect(repA.totals.spent).toBe(45_000);
    expect(repA.totals.income).toBe(0);
    expect(repA.countedCount).toBe(1);
    expect(repA.tags.expense).toHaveLength(1);
    expect(repA.tags.expense[0]!.name).toBe('TagA');
    expect(repA.spendingByCategory).toHaveLength(1);
    expect(repA.spendingByCategory[0]!.categoryId).toBe(foodA.id);
    expect(repA.countedRows).toHaveLength(1);
  });

  it('4. mixed-fixture agreement + category drilldown: personal, transfers, quick expenses, group rows, excluded/archived wallets', async () => {
    const userId = 'u-rep-mix-4';
    const sid = await memberSid(userId, 'Mix4');
    await switchOn(userId);

    const wMain = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 10_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const wExcluded = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Excluded',
          startAmount: 5_000_000,
          startDate: '2026-11-01',
          excludeFromReports: true,
        }),
      )
    ).wallet;

    const wArchived = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Archived', startAmount: 2_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
    const salary = cats.find((c) => c.type === 'income')!;

    // Create sub-category under Food
    const subCatRes = await createCategory(sid, {
      parentId: food.id,
      type: 'expense',
      name: 'Cà phê',
      icon: 'coffee',
    });
    expect(subCatRes.status).toBe(201);
    const coffee = (await json<{ category: CategoryView }>(subCatRes)).category;

    // Previous month (2026-10) Food expense for drilldown previousTotal
    expect(
      (
        await createEntry(sid, {
          type: 'expense',
          walletId: wMain.id,
          amount: 80_000,
          categoryId: food.id,
          date: '2026-10-10',
          note: 'October food',
        })
      ).status,
    ).toBe(201);

    // 2026-11 activity
    // 1. Personal expense with parent category Food
    expect(
      (
        await createEntry(sid, {
          type: 'expense',
          walletId: wMain.id,
          amount: 100_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Lunch Food',
        })
      ).status,
    ).toBe(201);

    // 2. Personal expense with sub-category Coffee
    expect(
      (
        await createEntry(sid, {
          type: 'expense',
          walletId: wMain.id,
          amount: 50_000,
          categoryId: coffee.id,
          date: '2026-11-12',
          note: 'Morning Coffee',
        })
      ).status,
    ).toBe(201);

    // 3. Personal income with Salary
    expect(
      (
        await createEntry(sid, {
          type: 'income',
          walletId: wMain.id,
          amount: 5_000_000,
          categoryId: salary.id,
          date: '2026-11-05',
          note: 'November Salary',
        })
      ).status,
    ).toBe(201);

    // 4. Default transfer (excluded: excludeFromReports = true)
    expect(
      (
        await createEntry(sid, {
          type: 'transfer',
          fromWalletId: wMain.id,
          toWalletId: wExcluded.id,
          amountSent: 500_000,
          date: '2026-11-14',
          note: 'Savings Transfer',
        })
      ).status,
    ).toBe(201);

    // 5. Counted transfer (excludeFromReports = false): transfer_out counts on wMain; transfer_in on wExcluded is excluded under All wallets
    expect(
      (
        await createEntry(sid, {
          type: 'transfer',
          fromWalletId: wMain.id,
          toWalletId: wExcluded.id,
          amountSent: 200_000,
          date: '2026-11-15',
          note: 'Counted Transfer',
          excludeFromReports: false,
        })
      ).status,
    ).toBe(201);

    // 6. Quick expense on ledger (trip): total 120_000, owner share 40_000
    const ledger = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sid)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sid, { name: 'Lan' }),
    );
    expect(
      (
        await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
          description: 'Quick Lunch',
          amount: 120_000,
          spentOn: '2026-11-16',
          payerId: ledger.ownerPid,
          mode: 'amounts',
          entries: [
            { participantId: ledger.ownerPid, value: 40_000 },
            { participantId: lanPid, value: 80_000 },
          ],
        })
      ).status,
    ).toBe(201);

    // 7. Activity on excluded wallet -> omitted from All-wallets report
    expect(
      (
        await createEntry(sid, {
          type: 'expense',
          walletId: wExcluded.id,
          amount: 300_000,
          categoryId: food.id,
          date: '2026-11-17',
          note: 'Excluded Wallet Expense',
        })
      ).status,
    ).toBe(201);

    // 8. Activity created on wallet before archiving it -> counted in period totals even after archive
    expect(
      (
        await createEntry(sid, {
          type: 'expense',
          walletId: wArchived.id,
          amount: 150_000,
          categoryId: food.id,
          date: '2026-11-18',
          note: 'Archived Wallet Food',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await createEntry(sid, {
          type: 'income',
          walletId: wArchived.id,
          amount: 350_000,
          categoryId: salary.id,
          date: '2026-11-19',
          note: 'Archived Wallet Bonus',
        })
      ).status,
    ).toBe(201);
    expect((await patchWallet(wArchived.id, sid, { archived: true })).status).toBe(200);

    // Fetch report, full /transactions list, and excluded-wallet slice
    const repRes = await getReport(sid, '?month=2026-11&today=2026-11-24');
    expect(repRes.status).toBe(200);
    const report = await json<ReportData>(repRes);

    const listRes = await getList(sid, '?month=2026-11&groups=show');
    expect(listRes.status).toBe(200);
    const listBody = await json<ListResponse>(listRes);

    const excludedListRes = await getList(
      sid,
      `?month=2026-11&groups=hide&walletId=${encodeURIComponent(wExcluded.id)}`,
    );
    expect(excludedListRes.status).toBe(200);
    const excludedListBody = await json<ListResponse>(excludedListRes);

    // Agreement invariant (Spec §4): All-wallets report equals /transactions after excluding excludeFromReports wallets
    expect(listBody.totals).toHaveLength(1);
    const excludedSpent = excludedListBody.totals[0]?.spent ?? 0;
    const excludedIncome = excludedListBody.totals[0]?.income ?? 0;
    expect(report.totals.spent).toBe(listBody.totals[0]!.spent - excludedSpent);
    expect(report.totals.income).toBe(listBody.totals[0]!.income - excludedIncome);
    expect(report.totals.spent).toBe(100_000 + 50_000 + 200_000 + 40_000 + 150_000);
    expect(report.totals.income).toBe(5_000_000 + 350_000);
    expect(report.totals.net).toBe(report.totals.income - report.totals.spent);

    // Category Drilldown on parent category (Food)
    const drillFoodRes = await getCategoryDrilldown(sid, food.id, '?month=2026-11&today=2026-11-24');
    expect(drillFoodRes.status).toBe(200);
    const drillFood = await json<ReportCategoryDrilldown>(drillFoodRes);

    // Food total includes: 100k (Main) + 50k (Coffee sub) + 150k (Archived) = 300_000
    expect(drillFood.categoryId).toBe(food.id);
    expect(drillFood.name).toBe('Ăn uống');
    expect(drillFood.type).toBe('expense');
    expect(drillFood.total).toBe(300_000);
    expect(drillFood.previousTotal).toBe(80_000);
    expect(drillFood.diffFromPrevious).toBe(220_000);
    expect(drillFood.pctFromPrevious).toBe(Math.round((220_000 / 80_000) * 100));

    // Sub-categories contains Coffee (50k) and Food chung (250k)
    expect(drillFood.subCategories).toHaveLength(2);
    const coffeeSub = drillFood.subCategories.find((s) => s.categoryId === coffee.id);
    expect(coffeeSub).toBeDefined();
    expect(coffeeSub!.amount).toBe(50_000);

    const foodGeneralSub = drillFood.subCategories.find((s) => s.categoryId === food.id);
    expect(foodGeneralSub).toBeDefined();
    expect(foodGeneralSub!.amount).toBe(250_000);
    expect(foodGeneralSub!.isGeneralParentBucket).toBe(true);

    // Category Drilldown on sub-category (Coffee)
    const drillCoffeeRes = await getCategoryDrilldown(sid, coffee.id, '?month=2026-11&today=2026-11-24');
    expect(drillCoffeeRes.status).toBe(200);
    const drillCoffee = await json<ReportCategoryDrilldown>(drillCoffeeRes);
    expect(drillCoffee.categoryId).toBe(coffee.id);
    expect(drillCoffee.name).toBe('Cà phê');
    expect(drillCoffee.total).toBe(50_000);
    expect(drillCoffee.previousTotal).toBe(0);
    expect(drillCoffee.rows).toHaveLength(1);
    expect(drillCoffee.rows[0]!.kind).toBe('entry');
  });

  it('5. cold 0-write guarantee: fresh user has 0 rows in personal_categories, remains 0, synthetic IDs work', async () => {
    const userId = 'u-rep-cold-5';
    const sid = await memberSid(userId, 'Cold5');
    await switchOn(userId);

    const countBefore = await env.DB.prepare(
      'SELECT count(*) as c FROM personal_categories WHERE user_id = ?',
    )
      .bind(userId)
      .first<number>('c');
    expect(countBefore).toBe(0);

    // Call report endpoint
    const res = await getReport(sid, '?month=2026-11&today=2026-11-24');
    expect(res.status).toBe(200);
    const report = await json<ReportData>(res);
    expect(report.spendingByCategory).toEqual([]);
    expect(report.incomeByCategory).toEqual([]);

    // Count in D1 must still be 0
    const countAfter = await env.DB.prepare(
      'SELECT count(*) as c FROM personal_categories WHERE user_id = ?',
    )
      .bind(userId)
      .first<number>('c');
    expect(countAfter).toBe(0);

    // Synthetic category drilldowns resolve cleanly via synthetic labels
    const resGroup = await getCategoryDrilldown(sid, '__group__', '?month=2026-11&today=2026-11-24');
    expect(resGroup.status).toBe(200);
    const drillGroup = await json<ReportCategoryDrilldown>(resGroup);
    expect(drillGroup.categoryId).toBe('__group__');
    expect(drillGroup.name).toBe('Nhóm');
    expect(drillGroup.icon).toBe('users');
    expect(drillGroup.total).toBe(0);

    const resLend = await getCategoryDrilldown(sid, '__lend__', '?month=2026-11&today=2026-11-24');
    expect(resLend.status).toBe(200);
    const drillLend = await json<ReportCategoryDrilldown>(resLend);
    expect(drillLend.categoryId).toBe('__lend__');
    expect(drillLend.name).toBe('Cho vay');
    expect(drillLend.type).toBe('expense');
    expect(drillLend.total).toBe(0);

    const resBorrow = await getCategoryDrilldown(sid, '__borrow__', '?month=2026-11&today=2026-11-24');
    expect(resBorrow.status).toBe(200);
    const drillBorrow = await json<ReportCategoryDrilldown>(resBorrow);
    expect(drillBorrow.categoryId).toBe('__borrow__');
    expect(drillBorrow.name).toBe('Đi vay');
    expect(drillBorrow.type).toBe('income');
    expect(drillBorrow.total).toBe(0);

    const resUncat = await getCategoryDrilldown(sid, '__uncategorized__', '?month=2026-11&today=2026-11-24');
    expect(resUncat.status).toBe(200);
    const drillUncat = await json<ReportCategoryDrilldown>(resUncat);
    expect(drillUncat.categoryId).toBe('__uncategorized__');
    expect(drillUncat.name).toBe('Chưa phân loại');
    expect(drillUncat.total).toBe(0);

    // Final check: strictly 0 rows created
    const countFinal = await env.DB.prepare(
      'SELECT count(*) as c FROM personal_categories WHERE user_id = ?',
    )
      .bind(userId)
      .first<number>('c');
    expect(countFinal).toBe(0);
  });

  it('6. query budget test (< 50 SQL queries) on year mode with 365+ daily personal txs + baseline + tags + group rows', async () => {
    const userId = 'u-rep-budget-6';
    const sid = await memberSid(userId, 'Budget6');
    await switchOn(userId);

    const wMain = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Budget Main', startAmount: 50_000_000, startDate: '2025-01-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;
    const salary = cats.find((c) => c.type === 'income')!;

    const now = '2026-11-24T10:00:00.000Z';
    const tagId = 'tag-rep-budget-1';
    await env.DB.prepare(
      'INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(tagId, userId, 'YearTag', now)
      .run();

    // Seed 400 daily transactions spanning 2025-10-01 to 2026-11-24
    const txStmts: D1PreparedStatement[] = [];
    let expectedSpent2026 = 0;
    let expectedIncome2026 = 0;

    const startDate = new Date(Date.UTC(2025, 9, 1)); // Oct 1, 2025
    for (let i = 0; i < 400; i++) {
      const d = new Date(startDate.getTime() + i * 86_400_000);
      const ymd = d.toISOString().slice(0, 10);
      const txId = `tx-bgt-${i}`;
      const isIncome = i % 10 === 0;
      const type = isIncome ? 'income' : 'expense';
      const amount = isIncome ? 1_000_000 : 50_000;
      const catId = isIncome ? salary.id : food.id;

      if (ymd.startsWith('2026-') && ymd <= '2026-11-24') {
        if (isIncome) expectedIncome2026 += amount;
        else expectedSpent2026 += amount;
      }

      txStmts.push(
        env.DB.prepare(
          `INSERT INTO personal_transactions
           (id, user_id, wallet_id, type, amount, category_id, date, note, exclude_from_reports, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'manual', ?, ?)`,
        ).bind(txId, userId, wMain.id, type, amount, catId, ymd, `Tx ${i}`, now, now),
      );

      if (i % 3 === 0) {
        txStmts.push(
          env.DB.prepare(
            'INSERT INTO personal_transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
          ).bind(txId, tagId),
        );
      }
    }

    // Execute seed in chunks
    for (let i = 0; i < txStmts.length; i += 50) {
      await env.DB.batch(txStmts.slice(i, i + 50));
    }

    // Group trip activity
    const ledger = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sid)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sid, { name: 'Lan' }),
    );
    await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
      description: 'Budget Group Lunch',
      amount: 100_000,
      spentOn: '2026-11-20',
      payerId: ledger.ownerPid,
      mode: 'equal',
      entries: [
        { participantId: ledger.ownerPid, value: 1 },
        { participantId: lanPid, value: 1 },
      ],
    });
    expectedSpent2026 += 50_000; // owner share is 50,000

    // Spy on env.DB
    let prepareCount = 0;
    let batchCount = 0;
    let writeCount = 0;
    const origPrepare = env.DB.prepare.bind(env.DB);
    const origBatch = env.DB.batch.bind(env.DB);

    env.DB.prepare = ((query: string) => {
      prepareCount++;
      const upper = query.trim().toUpperCase();
      if (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE')) {
        writeCount++;
      }
      return origPrepare(query);
    }) as typeof env.DB.prepare;

    env.DB.batch = ((statements: D1PreparedStatement[]) => {
      batchCount++;
      return origBatch(statements);
    }) as typeof env.DB.batch;

    try {
      const res = await getReport(sid, '?mode=year&year=2026&today=2026-11-24');
      expect(res.status).toBe(200);
      const report = await json<ReportData>(res);

      expect(report.period.mode).toBe('year');
      expect(report.totals.spent).toBe(expectedSpent2026);
      expect(report.totals.income).toBe(expectedIncome2026);

      // Verify query budget: under 50 SQL queries, strictly 0 writes
      expect(prepareCount + batchCount).toBeLessThan(50);
      expect(writeCount).toBe(0);
    } finally {
      env.DB.prepare = origPrepare;
      env.DB.batch = origBatch;
    }
  });
});
