import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  RecurringRuleResponse,
  RecurringSchedule,
  WalletDetailResponse,
} from '@cc/core';
import { runRecurring, RECURRING_STATEMENT_BUDGET } from '../src/personal/recurringJob';
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

  return { sid, wallet, food };
}

async function createExpenseRule(
  sid: string,
  walletId: string,
  categoryId: string,
  schedule: RecurringSchedule,
  amount = 250_000,
  note = 'Recurring',
) {
  const res = await postJson('/api/me/personal/recurring/rules', sid, {
    draft: {
      type: 'expense',
      walletId,
      categoryId,
      amount,
      tags: [],
      note,
    },
    schedule,
  });
  expect(res.status).toBe(201);
  return (await json<RecurringRuleResponse>(res)).rule;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await env.DB.prepare('DELETE FROM personal_planned_items').run();
  await env.DB.prepare('DELETE FROM personal_recurring_rule_tags').run();
  await env.DB.prepare('DELETE FROM personal_recurring_rules').run();
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

describe('runRecurring cron job', () => {
  it('a monthly rule records on its due date exactly once', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-job-monthly';
    const { sid, wallet, food } = await setupUser(userId, 'JobMonthly');

    const rule = await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2026-12-05',
      end: { kind: 'never' },
    });
    vi.useRealTimers();

    // 2026-12-04T16:59Z = 2026-12-04 23:59 VN -> not due yet
    await runRecurring(env, new Date('2026-12-04T16:59:00.000Z'));
    let txs = (
      await env.DB.prepare('SELECT date, amount, external_ref FROM personal_transactions WHERE user_id = ?')
        .bind(userId)
        .all<{ date: string; amount: number; external_ref: string | null }>()
    ).results;
    expect(txs).toHaveLength(0);

    // 2026-12-04T17:15Z = 2026-12-05 00:15 VN -> due!
    await runRecurring(env, new Date('2026-12-04T17:15:00.000Z'));
    txs = (
      await env.DB.prepare('SELECT date, amount, external_ref FROM personal_transactions WHERE user_id = ?')
        .bind(userId)
        .all<{ date: string; amount: number; external_ref: string | null }>()
    ).results;
    expect(txs).toHaveLength(1);
    expect(txs[0]).toEqual({
      date: '2026-12-05',
      amount: 250_000,
      external_ref: `${rule.id}:2026-12-05`,
    });

    // Running again an hour later records nothing more
    await runRecurring(env, new Date('2026-12-04T18:15:00.000Z'));
    txs = (
      await env.DB.prepare('SELECT date, amount, external_ref FROM personal_transactions WHERE user_id = ?')
        .bind(userId)
        .all<{ date: string; amount: number; external_ref: string | null }>()
    ).results;
    expect(txs).toHaveLength(1);
  });

  it('catches up after a missed run, once each', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-job-catchup';
    const { sid, wallet, food } = await setupUser(userId, 'JobCatchup');

    await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2026-12-05',
      end: { kind: 'never' },
    });
    vi.useRealTimers();

    await runRecurring(env, new Date('2027-02-06T00:15:00.000Z'));
    let txs = (
      await env.DB.prepare('SELECT date FROM personal_transactions WHERE user_id = ? ORDER BY date ASC')
        .bind(userId)
        .all<{ date: string }>()
    ).results;
    expect(txs.map((t) => t.date)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);

    // Another run produces no duplicates
    await runRecurring(env, new Date('2027-02-06T01:15:00.000Z'));
    txs = (
      await env.DB.prepare('SELECT date FROM personal_transactions WHERE user_id = ? ORDER BY date ASC')
        .bind(userId)
        .all<{ date: string }>()
    ).results;
    expect(txs).toHaveLength(3);
  });

  it('concurrent runs record once', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-job-concurrent';
    const { sid, wallet, food } = await setupUser(userId, 'JobConcurrent', 10_000_000);

    await createExpenseRule(
      sid,
      wallet.id,
      food.id,
      {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      400_000,
    );
    vi.useRealTimers();

    const t = new Date('2026-12-05T01:15:00.000Z');
    await Promise.all([runRecurring(env, t), runRecurring(env, t)]);

    const txs = (
      await env.DB.prepare('SELECT date, amount FROM personal_transactions WHERE user_id = ?')
        .bind(userId)
        .all<{ date: string; amount: number }>()
    ).results;
    expect(txs).toHaveLength(1);
    expect(txs[0]).toEqual({ date: '2026-12-05', amount: 400_000 });

    const bal = await env.DB.prepare(
      'SELECT personal_net, entry_count FROM personal_wallet_balances WHERE wallet_id = ?',
    )
      .bind(wallet.id)
      .first<{ personal_net: number; entry_count: number }>();
    expect(bal).toEqual({ personal_net: -400_000, entry_count: 1 });
  });

  it('February edge', async () => {
    setVnDate('2027-01-15');
    const userId = 'u-job-feb';
    const { sid, wallet, food } = await setupUser(userId, 'JobFeb');

    const r29 = await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 29,
      startDate: '2027-01-29',
      end: { kind: 'never' },
    });
    const r30 = await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 30,
      startDate: '2027-01-30',
      end: { kind: 'never' },
    });
    const r31 = await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 31,
      startDate: '2027-01-31',
      end: { kind: 'never' },
    });
    const rLast = await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 'last',
      startDate: '2027-01-31',
      end: { kind: 'never' },
    });
    vi.useRealTimers();

    const ruleIds = [r29.id, r30.id, r31.id, rLast.id];

    // Non-leap February 2027: set next_due_on to 2027-02-28
    await env.DB.prepare(
      "UPDATE personal_recurring_rules SET next_due_on = '2027-02-28', last_confirmed_on = '2027-02-01' WHERE user_id = ?",
    )
      .bind(userId)
      .run();

    const feb2027 = new Date('2027-02-28T01:15:00.000Z');
    for (let i = 0; i < 4; i++) {
      const res = await runRecurring(env, feb2027);
      if (res.leftOver === 0) break;
    }

    const txs2027 = (
      await env.DB.prepare(
        "SELECT date, external_ref FROM personal_transactions WHERE user_id = ? AND date LIKE '2027-02-%' ORDER BY external_ref ASC",
      )
        .bind(userId)
        .all<{ date: string; external_ref: string }>()
    ).results;
    expect(txs2027).toHaveLength(4);
    expect(txs2027.every((t) => t.date === '2027-02-28')).toBe(true);
    expect(new Set(txs2027.map((t) => t.external_ref))).toEqual(
      new Set(ruleIds.map((id) => `${id}:2027-02-28`)),
    );

    // Leap February 2028: set next_due_on to 2028-02-29
    await env.DB.prepare(
      "UPDATE personal_recurring_rules SET next_due_on = '2028-02-29', last_confirmed_on = '2028-02-01' WHERE user_id = ?",
    )
      .bind(userId)
      .run();

    const feb2028 = new Date('2028-02-29T01:15:00.000Z');
    for (let i = 0; i < 4; i++) {
      const res = await runRecurring(env, feb2028);
      if (res.leftOver === 0) break;
    }

    const txs2028 = (
      await env.DB.prepare(
        "SELECT date, external_ref FROM personal_transactions WHERE user_id = ? AND date LIKE '2028-02-%' ORDER BY external_ref ASC",
      )
        .bind(userId)
        .all<{ date: string; external_ref: string }>()
    ).results;
    expect(txs2028).toHaveLength(4);
    expect(txs2028.every((t) => t.date === '2028-02-29')).toBe(true);
    expect(new Set(txs2028.map((t) => t.external_ref))).toEqual(
      new Set(ruleIds.map((id) => `${id}:2028-02-29`)),
    );
  });

  it('area off records nothing', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-job-area-off';
    const { sid, wallet, food } = await setupUser(userId, 'JobAreaOff');

    await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2026-12-05',
      end: { kind: 'never' },
    });
    vi.useRealTimers();

    await switchOn(userId, 0);

    const res = await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));
    expect(res.rules).toBe(0);

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(txCount?.cnt).toBe(0);
  });

  it('archived wallet pauses with a reason, once', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-job-archived-wallet';
    const { sid, wallet, food } = await setupUser(userId, 'JobArchivedWallet');

    const rule = await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2026-12-05',
      end: { kind: 'never' },
    });
    vi.useRealTimers();

    // Archive the wallet
    await env.DB.prepare(
      "INSERT INTO personal_wallet_settings (wallet_id, user_id, kind, archived_at, updated_at) VALUES (?, ?, 'everyday', '2026-12-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z') ON CONFLICT(wallet_id) DO UPDATE SET archived_at = excluded.archived_at",
    )
      .bind(wallet.id, userId)
      .run();

    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));
    await runRecurring(env, new Date('2026-12-05T02:15:00.000Z'));

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(txCount?.cnt).toBe(0);

    const ruleRow = await env.DB.prepare(
      'SELECT status, paused_reason FROM personal_recurring_rules WHERE id = ?',
    )
      .bind(rule.id)
      .first<{ status: string; paused_reason: string | null }>();
    expect(ruleRow).toEqual({ status: 'paused', paused_reason: 'missing_wallet' });

    const pausedItems = (
      await env.DB.prepare(
        "SELECT kind, meta, status FROM personal_planned_items WHERE user_id = ? AND kind = 'recurring_paused'",
      )
        .bind(userId)
        .all<{ kind: string; meta: string | null; status: string }>()
    ).results;
    expect(pausedItems).toHaveLength(1);
    expect(pausedItems[0]!.status).toBe('waiting');
    expect(JSON.parse(pausedItems[0]!.meta!)).toEqual({ reason: 'missing_wallet' });
  });

  it('check-in opens and pauses after grace', async () => {
    setVnDate('2026-11-27');
    const userId = 'u-job-checkin';
    const { sid, wallet, food } = await setupUser(userId, 'JobCheckin');

    const rule = await createExpenseRule(sid, wallet.id, food.id, {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2026-12-05',
      end: { kind: 'never' },
    });
    vi.useRealTimers();

    // Set last_confirmed_on 7 months back (> 182 days before 2026-12-05)
    await env.DB.prepare(
      "UPDATE personal_recurring_rules SET last_confirmed_on = '2026-05-01' WHERE id = ?",
    )
      .bind(rule.id)
      .run();

    // Run 1 (Dec 5): opens check-in item AND records 1st occurrence
    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));
    const checkInItems = (
      await env.DB.prepare(
        "SELECT kind, status, created_on FROM personal_planned_items WHERE user_id = ? AND kind = 'recurring_checkin'",
      )
        .bind(userId)
        .all<{ kind: string; status: string; created_on: string }>()
    ).results;
    expect(checkInItems).toHaveLength(1);
    expect(checkInItems[0]).toEqual({
      kind: 'recurring_checkin',
      status: 'waiting',
      created_on: '2026-12-05',
    });

    // Run 2 (Jan 5): records 2nd occurrence
    await runRecurring(env, new Date('2027-01-05T01:15:00.000Z'));
    // Run 3 (Feb 5): records 3rd occurrence
    await runRecurring(env, new Date('2027-02-05T01:15:00.000Z'));

    let txs = (
      await env.DB.prepare(
        'SELECT date FROM personal_transactions WHERE user_id = ? ORDER BY date ASC',
      )
        .bind(userId)
        .all<{ date: string }>()
    ).results;
    expect(txs.map((t) => t.date)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);

    // Still active before the 4th run
    let ruleRow = await env.DB.prepare(
      'SELECT status, paused_reason FROM personal_recurring_rules WHERE id = ?',
    )
      .bind(rule.id)
      .first<{ status: string; paused_reason: string | null }>();
    expect(ruleRow).toEqual({ status: 'active', paused_reason: null });

    // Run 4 (Mar 5): grace exhausted -> pauses with reason 'checkin' without recording
    await runRecurring(env, new Date('2027-03-05T01:15:00.000Z'));

    txs = (
      await env.DB.prepare(
        'SELECT date FROM personal_transactions WHERE user_id = ? ORDER BY date ASC',
      )
        .bind(userId)
        .all<{ date: string }>()
    ).results;
    expect(txs.map((t) => t.date)).toEqual(['2026-12-05', '2027-01-05', '2027-02-05']);

    ruleRow = await env.DB.prepare(
      'SELECT status, paused_reason FROM personal_recurring_rules WHERE id = ?',
    )
      .bind(rule.id)
      .first<{ status: string; paused_reason: string | null }>();
    expect(ruleRow).toEqual({ status: 'paused', paused_reason: 'checkin' });
  });

  it('respects the statement budget', async () => {
    const userId = 'u-job-budget';
    const { wallet, food } = await setupUser(userId, 'JobBudget', 100_000_000);

    const draftJson = JSON.stringify({
      type: 'expense',
      walletId: wallet.id,
      categoryId: food.id,
      amount: 10_000,
      note: 'Daily',
      excludeFromReports: false,
    });
    const scheduleJson = JSON.stringify({
      unit: 'day',
      every: 1,
      startDate: '2026-12-05',
      end: { kind: 'never' },
    });

    // Insert 30 due daily rules directly
    for (let i = 0; i < 30; i++) {
      const id = `r-budget-${String(i).padStart(2, '0')}`;
      await env.DB.prepare(
        "INSERT INTO personal_recurring_rules (id, user_id, type, draft, schedule, ask_me, status, paused_reason, next_due_on, last_confirmed_on, created_at, updated_at) VALUES (?, ?, 'expense', ?, ?, 0, 'active', NULL, '2026-12-05', '2026-12-01', '2026-12-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')",
      )
        .bind(id, userId, draftJson, scheduleJson)
        .run();
    }

    const logSpy = vi.spyOn(console, 'log');
    const runTime = new Date('2026-12-05T01:15:00.000Z');
    const first = await runRecurring(env, runTime);

    expect(first.statements).toBeLessThanOrEqual(RECURRING_STATEMENT_BUDGET);
    expect(first.statements).toBeLessThanOrEqual(45);
    expect(first.rules).toBeGreaterThan(0);
    expect(first.leftOver).toBeGreaterThan(0);
    expect(first.rules + first.leftOver).toBe(30);
    expect(logSpy).toHaveBeenCalledWith(`recurring: budget hit, ${first.leftOver} rules left`);

    // Subsequent runs finish the remaining rules
    let leftOver = first.leftOver;
    let totalRules = first.rules;
    for (let guard = 0; guard < 20 && leftOver > 0; guard++) {
      const next = await runRecurring(env, runTime);
      expect(next.statements).toBeLessThanOrEqual(RECURRING_STATEMENT_BUDGET);
      totalRules += next.rules;
      leftOver = next.leftOver;
    }

    expect(leftOver).toBe(0);
    expect(totalRules).toBe(30);

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(txCount?.cnt).toBe(30);
  });
});
