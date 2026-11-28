import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  AssetView,
  BudgetsProgressResponse,
  CategoriesResponse,
  CategoryView,
  HoldingsResponse,
  ListResponse,
  PlannedItemsResponse,
  RecurringRuleResponse,
  RecurringRulesResponse,
  WalletDetailResponse,
  WalletsResponse,
} from '@cc/core';
import { runRecurring } from '../src/personal/recurringJob';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, seedLegacyStarters, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

function setVnDate(ymd: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${ymd}T08:00:00.000Z`));
}

async function setupUser(userId: string, name: string, startAmount = 10_000_000) {
  const sid = await memberSid(userId, name);
  await switchOn(userId, 1);
  await seedLegacyStarters(userId);

  const wallet = (
    await json<WalletDetailResponse>(
      await addWallet(sid, {
        name: 'Ví chính',
        currency: 'VND',
        startAmount,
        startDate: '2026-01-01',
      }),
    )
  ).wallet;

  const cats = (
    await json<CategoriesResponse>(await call('/api/me/personal/categories', as(sid)))
  ).categories;
  const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

  return { sid, wallet, food, cats };
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await env.DB.prepare('DELETE FROM personal_planned_items').run();
  await env.DB.prepare('DELETE FROM personal_recurring_rule_tags').run();
  await env.DB.prepare('DELETE FROM personal_recurring_rules').run();
  await env.DB.prepare('DELETE FROM personal_budget_excluded_wallets').run();
  await env.DB.prepare('DELETE FROM personal_budget_limits').run();
  await env.DB.prepare('DELETE FROM personal_budgets').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_asset_counts').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_balances').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal planned items routes', () => {
  it('a waiting item moves nothing', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-wait';
    const { sid, wallet, food } = await setupUser(userId, 'PlanWait', 10_000_000);

    // Create a monthly budget for food so /budgets/progress has scope
    const budgetRes = await postJson('/api/me/personal/budgets', sid, {
      target: { kind: 'category', categoryId: food.id },
      currency: 'VND',
      amount: 3_000_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: [],
      today: '2026-12-05',
    });
    expect(budgetRes.status).toBe(201);

    // Snapshot wallet balance, /list, /report, /budgets/progress BEFORE the waiting item exists
    const walletsBefore = await json<WalletsResponse>(
      await call('/api/me/personal/wallets', as(sid)),
    );
    const listBefore = await json<ListResponse>(
      await call('/api/me/personal/list?month=2026-12', as(sid)),
    );
    const reportBefore = await json<unknown>(
      await call('/api/me/personal/report?mode=month&month=2026-12&today=2026-12-05', as(sid)),
    );
    const progressBefore = await json<BudgetsProgressResponse>(
      await call('/api/me/personal/budgets/progress', as(sid)),
    );

    // Create an ask-me rule due on 2026-12-05
    const ruleRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 450_000,
        tags: [],
        note: 'Tiền điện',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      askMe: true,
    });
    expect(ruleRes.status).toBe(201);
    vi.useRealTimers();

    // Run job on due date -> creates waiting recurring_occurrence item
    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const planned = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(planned.items).toHaveLength(1);
    expect(planned.items[0]!.kind).toBe('recurring_occurrence');
    expect(planned.items[0]!.status).toBe('waiting');
    expect(planned.items[0]!.dueOn).toBe('2026-12-05');

    // Wallet balance, /list, /report, /budgets/progress are all identical to before
    const walletsAfter = await json<WalletsResponse>(
      await call('/api/me/personal/wallets', as(sid)),
    );
    const listAfter = await json<ListResponse>(
      await call('/api/me/personal/list?month=2026-12', as(sid)),
    );
    const reportAfter = await json<unknown>(
      await call('/api/me/personal/report?mode=month&month=2026-12&today=2026-12-05', as(sid)),
    );
    const progressAfter = await json<BudgetsProgressResponse>(
      await call('/api/me/personal/budgets/progress', as(sid)),
    );

    expect(walletsAfter).toEqual(walletsBefore);
    expect(listAfter).toEqual(listBefore);
    expect(reportAfter).toEqual(reportBefore);
    expect(progressAfter).toEqual(progressBefore);
  });

  it('confirm with a changed amount and date records that amount and date while external_ref keeps the scheduled date', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-confirm-edit';
    const { sid, wallet, food } = await setupUser(userId, 'PlanConfirmEdit', 10_000_000);

    const ruleRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 300_000,
        tags: [],
        note: 'Tiền nước',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      askMe: true,
    });
    expect(ruleRes.status).toBe(201);
    const rule = (await json<RecurringRuleResponse>(ruleRes)).rule;
    vi.useRealTimers();

    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const planned = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(planned.items).toHaveLength(1);
    const item = planned.items[0]!;

    setVnDate('2026-12-07');
    const confirmRes = await postJson(`/api/me/personal/planned/${item.id}/confirm`, sid, {
      entry: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 375_000,
        date: '2026-12-07',
        note: 'Tiền nước thực tế',
      },
    });
    expect(confirmRes.status).toBe(200);
    vi.useRealTimers();

    const txs = (
      await env.DB.prepare(
        'SELECT amount, date, source, external_ref, note FROM personal_transactions WHERE user_id = ?',
      )
        .bind(userId)
        .all<{
          amount: number;
          date: string;
          source: string;
          external_ref: string | null;
          note: string | null;
        }>()
    ).results;
    expect(txs).toHaveLength(1);
    expect(txs[0]).toEqual({
      amount: 375_000,
      date: '2026-12-07',
      source: 'recurring',
      external_ref: `${rule.id}:2026-12-05`,
      note: 'Tiền nước thực tế',
    });

    // Item is no longer in waiting list
    const plannedAfter = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedAfter.items).toHaveLength(0);
  });

  it('double confirm records once (one 200 and one 409)', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-double';
    const { sid, wallet, food } = await setupUser(userId, 'PlanDouble', 10_000_000);

    await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 200_000,
        tags: [],
        note: 'Internet',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      askMe: true,
    });
    vi.useRealTimers();

    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const planned = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(planned.items).toHaveLength(1);
    const itemId = planned.items[0]!.id;

    const [r1, r2] = await Promise.all([
      postJson(`/api/me/personal/planned/${itemId}/confirm`, sid, {}),
      postJson(`/api/me/personal/planned/${itemId}/confirm`, sid, {}),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const conflictRes = r1.status === 409 ? r1 : r2;
    const conflictBody = await json<{ error: { code: string } }>(conflictRes);
    expect(conflictBody.error.code).toBe('ALREADY_RESOLVED');

    const txs = (
      await env.DB.prepare('SELECT amount FROM personal_transactions WHERE user_id = ?')
        .bind(userId)
        .all<{ amount: number }>()
    ).results;
    expect(txs).toHaveLength(1);
    expect(txs[0]!.amount).toBe(200_000);

    // A sequential third confirm also returns 409 ALREADY_RESOLVED
    const r3 = await postJson(`/api/me/personal/planned/${itemId}/confirm`, sid, {});
    expect(r3.status).toBe(409);
    const body3 = await json<{ error: { code: string } }>(r3);
    expect(body3.error.code).toBe('ALREADY_RESOLVED');
  });

  it('skip is never remade', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-skip';
    const { sid, wallet, food } = await setupUser(userId, 'PlanSkip', 10_000_000);

    await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 200_000,
        tags: [],
        note: 'Skip me',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      askMe: true,
    });
    vi.useRealTimers();

    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const planned = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(planned.items).toHaveLength(1);
    const itemId = planned.items[0]!.id;

    const skipRes = await postJson(`/api/me/personal/planned/${itemId}/skip`, sid, {});
    expect(skipRes.status).toBe(200);

    // Run job past that date again
    await runRecurring(env, new Date('2026-12-10T01:15:00.000Z'));

    const txs = (
      await env.DB.prepare('SELECT id FROM personal_transactions WHERE user_id = ?')
        .bind(userId)
        .all()
    ).results;
    expect(txs).toHaveLength(0);

    const plannedAfter = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedAfter.items).toHaveLength(0);

    const allItems = (
      await env.DB.prepare('SELECT status FROM personal_planned_items WHERE user_id = ?')
        .bind(userId)
        .all<{ status: string }>()
    ).results;
    expect(allItems).toEqual([{ status: 'skipped' }]);
  });

  it('buy confirm needs units', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-buy';
    const { sid } = await setupUser(userId, 'PlanBuy');

    const invWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Chứng khoán',
          currency: 'VND',
          kind: 'investment',
          startAmount: 50_000_000,
          startDate: '2026-01-01',
        }),
      )
    ).wallet;

    const assetRes = await postJson('/api/me/personal/assets', sid, {
      name: 'E1VFVN30',
      unit: 'CCQ',
      groupName: 'ETF',
      decimals: 0,
    });
    expect(assetRes.status).toBe(201);
    const asset = (await json<{ asset: AssetView }>(assetRes)).asset;

    const ruleRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'buy',
        walletId: invWallet.id,
        assetId: asset.id,
        amount: 5_000_000,
        tags: [],
        note: 'DCA ETF',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    expect(ruleRes.status).toBe(201);
    vi.useRealTimers();

    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const planned = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(planned.items).toHaveLength(1);
    const itemId = planned.items[0]!.id;

    // Confirm without entry -> 422 (quantity needed)
    const noEntryRes = await postJson(`/api/me/personal/planned/${itemId}/confirm`, sid, {});
    expect(noEntryRes.status).toBe(422);

    // Holdings still empty
    const holdingsBefore = await json<HoldingsResponse>(
      await call(`/api/me/personal/holdings?walletId=${invWallet.id}`, as(sid)),
    );
    expect(holdingsBefore.holdings).toHaveLength(0);

    // Confirm with entry (quantity set) -> holdings change as for a manual buy
    const withEntryRes = await postJson(`/api/me/personal/planned/${itemId}/confirm`, sid, {
      entry: {
        type: 'buy',
        walletId: invWallet.id,
        assetId: asset.id,
        quantity: 200,
        amount: 5_000_000,
        date: '2026-12-05',
        note: 'DCA ETF',
      },
    });
    expect(withEntryRes.status).toBe(200);

    const holdingsAfter = await json<HoldingsResponse>(
      await call(`/api/me/personal/holdings?walletId=${invWallet.id}`, as(sid)),
    );
    expect(holdingsAfter.holdings).toEqual([
      {
        walletId: invWallet.id,
        assetId: asset.id,
        quantity: 200,
        cost: 5_000_000,
        costVnd: 5_000_000,
      },
    ]);
  });

  it('editing a recurring transaction confirms the rule', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-r14';
    const { sid, wallet, food } = await setupUser(userId, 'PlanR14');

    const ruleRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 250_000,
        tags: [],
        note: 'Subscription',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    expect(ruleRes.status).toBe(201);
    const rule = (await json<RecurringRuleResponse>(ruleRes)).rule;
    vi.useRealTimers();

    // Backdate last_confirmed_on so Dec 5 run opens a check-in AND records the occurrence
    await env.DB.prepare(
      "UPDATE personal_recurring_rules SET last_confirmed_on = '2026-05-01' WHERE id = ?",
    )
      .bind(rule.id)
      .run();

    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const tx = await env.DB.prepare(
      'SELECT id FROM personal_transactions WHERE user_id = ? AND source = ?',
    )
      .bind(userId, 'recurring')
      .first<{ id: string }>();
    expect(tx).toBeTruthy();

    // Verify open check-in exists before edit
    const plannedBefore = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedBefore.items.some((i) => i.kind === 'recurring_checkin')).toBe(true);

    // Edit the recurring transaction on 2026-12-10
    setVnDate('2026-12-10');
    const patchRes = await postJson(
      `/api/me/personal/transactions/${tx!.id}`,
      sid,
      {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 260_000,
        date: '2026-12-05',
        note: 'Updated amount',
      },
      'PATCH',
    );
    expect(patchRes.status).toBe(200);
    vi.useRealTimers();

    // Rule's last_confirmed_on = today (2026-12-10) and open check-in is resolved
    const ruleRow = await env.DB.prepare(
      'SELECT last_confirmed_on FROM personal_recurring_rules WHERE id = ?',
    )
      .bind(rule.id)
      .first<{ last_confirmed_on: string }>();
    expect(ruleRow?.last_confirmed_on).toBe('2026-12-10');

    const plannedAfter = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedAfter.items.some((i) => i.kind === 'recurring_checkin')).toBe(false);

    const checkinRow = await env.DB.prepare(
      "SELECT status FROM personal_planned_items WHERE rule_id = ? AND kind = 'recurring_checkin'",
    )
      .bind(rule.id)
      .first<{ status: string }>();
    expect(checkinRow?.status).toBe('confirmed');
  });

  it('category delete with moveTo moves the rule; without moveTo pauses the rule on the next run', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-cat-del';
    const { sid, wallet, food } = await setupUser(userId, 'PlanCatDel');

    // Create two custom expense categories
    const c1Res = await postJson('/api/me/personal/categories', sid, {
      type: 'expense',
      name: 'Cat Move',
      icon: 'tag',
    });
    expect(c1Res.status).toBe(201);
    const catMove = (await json<{ category: CategoryView }>(c1Res)).category;

    const c2Res = await postJson('/api/me/personal/categories', sid, {
      type: 'expense',
      name: 'Cat Drop',
      icon: 'tag',
    });
    expect(c2Res.status).toBe(201);
    const catDrop = (await json<{ category: CategoryView }>(c2Res)).category;

    const rMove = (
      await json<RecurringRuleResponse>(
        await postJson('/api/me/personal/recurring/rules', sid, {
          draft: {
            type: 'expense',
            walletId: wallet.id,
            categoryId: catMove.id,
            amount: 100_000,
            tags: [],
            note: 'Moves',
          },
          schedule: {
            unit: 'month',
            every: 1,
            monthDay: 5,
            startDate: '2026-12-05',
            end: { kind: 'never' },
          },
        }),
      )
    ).rule;

    const rDrop = (
      await json<RecurringRuleResponse>(
        await postJson('/api/me/personal/recurring/rules', sid, {
          draft: {
            type: 'expense',
            walletId: wallet.id,
            categoryId: catDrop.id,
            amount: 120_000,
            tags: [],
            note: 'Drops',
          },
          schedule: {
            unit: 'month',
            every: 1,
            monthDay: 5,
            startDate: '2026-12-05',
            end: { kind: 'never' },
          },
        }),
      )
    ).rule;
    vi.useRealTimers();

    // Delete catMove with moveTo=food.id
    const delMoveRes = await call(
      `/api/me/personal/categories/${catMove.id}?moveTo=${food.id}`,
      { method: 'DELETE', headers: { Cookie: `sid=${sid}` } },
    );
    expect(delMoveRes.status).toBe(200);

    // Delete catDrop without moveTo
    const delDropRes = await call(`/api/me/personal/categories/${catDrop.id}`, {
      method: 'DELETE',
      headers: { Cookie: `sid=${sid}` },
    });
    expect(delDropRes.status).toBe(200);

    // Check rMove now points to food.id
    const rules = (
      await json<RecurringRulesResponse>(
        await call('/api/me/personal/recurring/rules', as(sid)),
      )
    ).rules;
    expect(rules.find((r) => r.id === rMove.id)!.draft.categoryId).toBe(food.id);

    // Next run: rMove records under food.id; rDrop pauses with missing_category
    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const dropRow = await env.DB.prepare(
      'SELECT status, paused_reason FROM personal_recurring_rules WHERE id = ?',
    )
      .bind(rDrop.id)
      .first<{ status: string; paused_reason: string | null }>();
    expect(dropRow).toEqual({ status: 'paused', paused_reason: 'missing_category' });

    const moveTx = await env.DB.prepare(
      'SELECT category_id, amount FROM personal_transactions WHERE user_id = ? AND external_ref = ?',
    )
      .bind(userId, `${rMove.id}:2026-12-05`)
      .first<{ category_id: string; amount: number }>();
    expect(moveTx).toEqual({ category_id: food.id, amount: 100_000 });
  });

  it('handles recurring_checkin, recurring_paused, and rule_suggestion confirm and skip', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-plan-kinds';
    const { sid, wallet, food } = await setupUser(userId, 'PlanKinds');

    const rule = (
      await json<RecurringRuleResponse>(
        await postJson('/api/me/personal/recurring/rules', sid, {
          draft: {
            type: 'expense',
            walletId: wallet.id,
            categoryId: food.id,
            amount: 100_000,
            tags: [],
            note: 'Kinds',
          },
          schedule: {
            unit: 'month',
            every: 1,
            monthDay: 5,
            startDate: '2026-12-05',
            end: { kind: 'never' },
          },
        }),
      )
    ).rule;
    vi.useRealTimers();

    // Seed a check-in item and skip it -> pauses rule (manual)
    await env.DB.prepare(
      "INSERT INTO personal_planned_items (id, user_id, kind, ref_key, rule_id, due_on, draft, meta, status, transaction_id, created_on, resolved_at) VALUES ('pi-ci', ?, 'recurring_checkin', ?, ?, '2026-12-05', NULL, '{}', 'waiting', NULL, '2026-12-05', NULL)",
    )
      .bind(userId, `${rule.id}:checkin:2026-12-05`, rule.id)
      .run();

    const skipCi = await postJson('/api/me/personal/planned/pi-ci/skip', sid, {});
    expect(skipCi.status).toBe(200);

    const pausedRule = await env.DB.prepare(
      'SELECT status, paused_reason FROM personal_recurring_rules WHERE id = ?',
    )
      .bind(rule.id)
      .first<{ status: string; paused_reason: string | null }>();
    expect(pausedRule).toEqual({ status: 'paused', paused_reason: 'manual' });

    // Seed a recurring_paused item and confirm it -> resumes rule
    await env.DB.prepare(
      "INSERT INTO personal_planned_items (id, user_id, kind, ref_key, rule_id, due_on, draft, meta, status, transaction_id, created_on, resolved_at) VALUES ('pi-paused', ?, 'recurring_paused', ?, ?, '2026-12-06', NULL, '{\"reason\":\"manual\"}', 'waiting', NULL, '2026-12-06', NULL)",
    )
      .bind(userId, `${rule.id}:paused:2026-12-06`, rule.id)
      .run();

    setVnDate('2026-12-06');
    const confirmPaused = await postJson('/api/me/personal/planned/pi-paused/confirm', sid, {});
    expect(confirmPaused.status).toBe(200);
    vi.useRealTimers();

    const resumedRule = await env.DB.prepare(
      'SELECT status, paused_reason, next_due_on, last_confirmed_on FROM personal_recurring_rules WHERE id = ?',
    )
      .bind(rule.id)
      .first<{
        status: string;
        paused_reason: string | null;
        next_due_on: string | null;
        last_confirmed_on: string;
      }>();
    expect(resumedRule).toEqual({
      status: 'active',
      paused_reason: null,
      next_due_on: '2027-01-05',
      last_confirmed_on: '2026-12-06',
    });

    // Seed a rule_suggestion item and skip it -> dismissed
    await env.DB.prepare(
      "INSERT INTO personal_planned_items (id, user_id, kind, ref_key, rule_id, due_on, draft, meta, status, transaction_id, created_on, resolved_at) VALUES ('pi-sug', ?, 'rule_suggestion', 'sug:1', NULL, '2026-12-06', NULL, '{}', 'waiting', NULL, '2026-12-06', NULL)",
    )
      .bind(userId)
      .run();

    const skipSug = await postJson('/api/me/personal/planned/pi-sug/skip', sid, {});
    expect(skipSug.status).toBe(200);

    const sugRow = await env.DB.prepare(
      "SELECT status FROM personal_planned_items WHERE id = 'pi-sug'",
    ).first<{ status: string }>();
    expect(sugRow?.status).toBe('dismissed');
  });
});
