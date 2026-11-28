import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  personalRecurringRules,
  personalRecurringRuleTags,
  personalPlannedItems,
} from '@cc/api-db/schema';
import { seedUser } from './helpers';

const NOW = '2026-11-27T00:00:00.000Z';
const DRAFT_JSON = JSON.stringify({
  type: 'expense',
  walletId: 'w-1',
  amount: 250000,
  categoryId: 'cat-1',
  note: null,
});
const SCHEDULE_JSON = JSON.stringify({
  unit: 'month',
  every: 1,
  monthDay: 5,
  startDate: '2026-12-05',
  end: { kind: 'never' },
});

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function seedTag(id: string, userId: string, name: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id, userId, name, NOW)
    .run();
}

describe('personal recurring tables (0038)', () => {
  it('the three tables exist with their columns in order', async () => {
    expect(personalRecurringRules.id).toBeDefined();
    expect(personalRecurringRuleTags.ruleId).toBeDefined();
    expect(personalPlannedItems.id).toBeDefined();

    expect(await colsOf('personal_recurring_rules')).toEqual([
      'id',
      'user_id',
      'type',
      'draft',
      'schedule',
      'ask_me',
      'status',
      'paused_reason',
      'next_due_on',
      'last_confirmed_on',
      'created_at',
      'updated_at',
    ]);

    expect(await colsOf('personal_recurring_rule_tags')).toEqual(['rule_id', 'tag_id']);

    expect(await colsOf('personal_planned_items')).toEqual([
      'id',
      'user_id',
      'kind',
      'ref_key',
      'rule_id',
      'due_on',
      'draft',
      'meta',
      'status',
      'transaction_id',
      'created_on',
      'resolved_at',
    ]);
  });

  it('rejects duplicate planned items with the same (user_id, kind, ref_key)', async () => {
    await seedUser('u-rec-uq', 'Recurring UQ User');

    await env.DB.prepare(
      `INSERT INTO personal_planned_items
       (id, user_id, kind, ref_key, rule_id, due_on, draft, created_on)
       VALUES ('pi-1', 'u-rec-uq', 'recurring_occurrence', 'rule-1:2026-12-05', 'rule-1', '2026-12-05', ?, '2026-12-05')`,
    )
      .bind(DRAFT_JSON)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO personal_planned_items
         (id, user_id, kind, ref_key, rule_id, due_on, draft, created_on)
         VALUES ('pi-2', 'u-rec-uq', 'recurring_occurrence', 'rule-1:2026-12-05', 'rule-1', '2026-12-05', ?, '2026-12-05')`,
      )
        .bind(DRAFT_JSON)
        .run(),
    ).rejects.toThrow();

    // Same user & kind with a different ref_key is allowed
    await env.DB.prepare(
      `INSERT INTO personal_planned_items
       (id, user_id, kind, ref_key, rule_id, due_on, draft, created_on)
       VALUES ('pi-3', 'u-rec-uq', 'recurring_occurrence', 'rule-1:2027-01-05', 'rule-1', '2027-01-05', ?, '2027-01-05')`,
    )
      .bind(DRAFT_JSON)
      .run();
  });

  it('deleting a tag removes its personal_recurring_rule_tags row', async () => {
    await seedUser('u-rec-tdel', 'Tag Del User');
    await seedTag('tag-rec-1', 'u-rec-tdel', 'Internet');

    await env.DB.prepare(
      `INSERT INTO personal_recurring_rules
       (id, user_id, type, draft, schedule, next_due_on, last_confirmed_on, created_at, updated_at)
       VALUES ('r-tdel-1', 'u-rec-tdel', 'expense', ?, ?, '2026-12-05', '2026-11-27', ?, ?)`,
    )
      .bind(DRAFT_JSON, SCHEDULE_JSON, NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_recurring_rule_tags (rule_id, tag_id) VALUES ('r-tdel-1', 'tag-rec-1')",
    ).run();

    await env.DB.prepare("DELETE FROM personal_tags WHERE id = 'tag-rec-1'").run();

    const row = await env.DB.prepare(
      "SELECT count(*) AS n FROM personal_recurring_rule_tags WHERE rule_id = 'r-tdel-1'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('rejects a rule type of sell', async () => {
    await seedUser('u-rec-sell', 'Sell Reject User');

    await expect(
      env.DB.prepare(
        `INSERT INTO personal_recurring_rules
         (id, user_id, type, draft, schedule, next_due_on, last_confirmed_on, created_at, updated_at)
         VALUES ('r-sell-1', 'u-rec-sell', 'sell', ?, ?, '2026-12-05', '2026-11-27', ?, ?)`,
      )
        .bind(DRAFT_JSON, SCHEDULE_JSON, NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});
