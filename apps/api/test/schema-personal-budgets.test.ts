import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  personalBudgets,
  personalBudgetLimits,
  personalBudgetExcludedWallets,
} from '@cc/api-db/schema';
import { seedUser } from './helpers';

const NOW = '2026-11-26T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function seedWallet(id: string, userId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES (?, ?, 'Ví chính', 'VND', 100000, '2026-11-01', 1, ?, ?)",
  )
    .bind(id, userId, NOW, NOW)
    .run();
}

describe('personal budgets tables (0037)', () => {
  it('the three tables exist with their columns', async () => {
    expect(personalBudgets.id).toBeDefined();
    expect(personalBudgetLimits.budgetId).toBeDefined();
    expect(personalBudgetExcludedWallets.budgetId).toBeDefined();

    expect(await colsOf('personal_budgets')).toEqual([
      'id',
      'user_id',
      'name',
      'target_kind',
      'target_id',
      'currency',
      'period_kind',
      'month_start_day',
      'from_date',
      'to_date',
      'suggestion_dismissed_until',
      'created_on',
      'created_at',
      'updated_at',
    ]);

    expect(await colsOf('personal_budget_limits')).toEqual([
      'budget_id',
      'effective_from',
      'amount',
    ]);

    expect(await colsOf('personal_budget_excluded_wallets')).toEqual([
      'budget_id',
      'wallet_id',
    ]);
  });

  it('enforces unique (user_id, target_kind, target_id, period_kind)', async () => {
    await seedUser('u-bgt-uq', 'Budget UQ User');

    await env.DB.prepare(
      `INSERT INTO personal_budgets
       (id, user_id, name, target_kind, target_id, currency, period_kind, month_start_day, created_on, created_at, updated_at)
       VALUES ('b-uq-1', 'u-bgt-uq', 'Food', 'category', 'cat-1', 'VND', 'month', 1, '2026-11-26', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO personal_budgets
         (id, user_id, name, target_kind, target_id, currency, period_kind, month_start_day, created_on, created_at, updated_at)
         VALUES ('b-uq-2', 'u-bgt-uq', 'Food 2', 'category', 'cat-1', 'VND', 'month', 15, '2026-11-26', ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();

    // Same target with a different period_kind is allowed
    await env.DB.prepare(
      `INSERT INTO personal_budgets
       (id, user_id, name, target_kind, target_id, currency, period_kind, created_on, created_at, updated_at)
       VALUES ('b-uq-3', 'u-bgt-uq', 'Food Weekly', 'category', 'cat-1', 'VND', 'week', '2026-11-26', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();
  });

  it('deleting a wallet removes its excluded-wallet rows', async () => {
    await seedUser('u-bgt-wdel', 'Wallet Del User');
    await seedWallet('w-bgt-del', 'u-bgt-wdel');

    await env.DB.prepare(
      `INSERT INTO personal_budgets
       (id, user_id, name, target_kind, target_id, currency, period_kind, month_start_day, created_on, created_at, updated_at)
       VALUES ('b-wdel-1', 'u-bgt-wdel', 'Food', 'category', 'cat-1', 'VND', 'month', 1, '2026-11-26', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_budget_excluded_wallets (budget_id, wallet_id) VALUES ('b-wdel-1', 'w-bgt-del')",
    ).run();

    await env.DB.prepare("DELETE FROM personal_wallets WHERE id = 'w-bgt-del'").run();

    const row = await env.DB.prepare(
      "SELECT count(*) AS n FROM personal_budget_excluded_wallets WHERE budget_id = 'b-wdel-1'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('deleting a budget removes its limits and excluded wallets', async () => {
    await seedUser('u-bgt-bdel', 'Budget Del User');
    await seedWallet('w-bgt-bdel', 'u-bgt-bdel');

    await env.DB.prepare(
      `INSERT INTO personal_budgets
       (id, user_id, name, target_kind, target_id, currency, period_kind, month_start_day, created_on, created_at, updated_at)
       VALUES ('b-bdel-1', 'u-bgt-bdel', 'Food', 'category', 'cat-1', 'VND', 'month', 1, '2026-11-26', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_budget_limits (budget_id, effective_from, amount) VALUES ('b-bdel-1', '2026-11-01', 3000000)",
    ).run();

    await env.DB.prepare(
      "INSERT INTO personal_budget_excluded_wallets (budget_id, wallet_id) VALUES ('b-bdel-1', 'w-bgt-bdel')",
    ).run();

    await env.DB.prepare("DELETE FROM personal_budgets WHERE id = 'b-bdel-1'").run();

    const limitsRow = await env.DB.prepare(
      "SELECT count(*) AS n FROM personal_budget_limits WHERE budget_id = 'b-bdel-1'",
    ).first<{ n: number }>();
    expect(limitsRow?.n).toBe(0);

    const walletsRow = await env.DB.prepare(
      "SELECT count(*) AS n FROM personal_budget_excluded_wallets WHERE budget_id = 'b-bdel-1'",
    ).first<{ n: number }>();
    expect(walletsRow?.n).toBe(0);
  });

  it('deleting a user cascades to all three budget tables', async () => {
    await seedUser('u-bgt-udel', 'User Del');
    await seedWallet('w-bgt-udel', 'u-bgt-udel');

    await env.DB.prepare(
      `INSERT INTO personal_budgets
       (id, user_id, name, target_kind, target_id, currency, period_kind, month_start_day, created_on, created_at, updated_at)
       VALUES ('b-udel-1', 'u-bgt-udel', 'Food', 'category', 'cat-1', 'VND', 'month', 1, '2026-11-26', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_budget_limits (budget_id, effective_from, amount) VALUES ('b-udel-1', '2026-11-01', 2000000)",
    ).run();

    await env.DB.prepare(
      "INSERT INTO personal_budget_excluded_wallets (budget_id, wallet_id) VALUES ('b-udel-1', 'w-bgt-udel')",
    ).run();

    await env.DB.prepare("DELETE FROM users WHERE id = 'u-bgt-udel'").run();

    for (const table of [
      'personal_budgets',
      'personal_budget_limits',
      'personal_budget_excluded_wallets',
    ]) {
      const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row?.n, `expected 0 rows in ${table}`).toBe(0);
    }
  });
});
