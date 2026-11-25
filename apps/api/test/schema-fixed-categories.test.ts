import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { seedUser } from './helpers';

const NOW = '2026-11-25T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function indexesOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA index_list(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_categories').run();
});

describe('fixed categories schema (0034)', () => {
  it('adds system_key to personal_categories and category_key, note to transactions', async () => {
    expect(await colsOf('personal_categories')).toContain('system_key');
    expect(await indexesOf('personal_categories')).toContain(
      'personal_categories_user_system_key_idx',
    );

    const txCols = await colsOf('transactions');
    expect(txCols).toContain('category_key');
    expect(txCols).toContain('note');
  });

  it('enforces unique (user_id, system_key) while allowing multiple NULLs and same key across users', async () => {
    await seedUser('u-fix-sch-1', 'FixSch1');
    await seedUser('u-fix-sch-2', 'FixSch2');

    await env.DB.prepare(
      `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, system_key, created_at, updated_at)
       VALUES (?, ?, NULL, 'expense', 'Ăn uống', 'utensils', 0, 0, 'food', ?, ?)`,
    )
      .bind('u-fix-sch-1:food', 'u-fix-sch-1', NOW, NOW)
      .run();

    // Duplicate (user_id, system_key) must fail
    await expect(
      env.DB.prepare(
        `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, system_key, created_at, updated_at)
         VALUES (?, ?, NULL, 'expense', 'Ăn uống 2', 'utensils', 0, 1, 'food', ?, ?)`,
      )
        .bind('u-fix-sch-1:food-dup', 'u-fix-sch-1', NOW, NOW)
        .run(),
    ).rejects.toThrow();

    // Same system_key for another user is allowed
    await env.DB.prepare(
      `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, system_key, created_at, updated_at)
       VALUES (?, ?, NULL, 'expense', 'Ăn uống', 'utensils', 0, 0, 'food', ?, ?)`,
    )
      .bind('u-fix-sch-2:food', 'u-fix-sch-2', NOW, NOW)
      .run();

    // Multiple NULL system_keys for the same user (custom categories) are allowed
    await env.DB.prepare(
      `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, system_key, created_at, updated_at)
       VALUES (?, ?, NULL, 'expense', 'Custom 1', 'tag', 0, 10, NULL, ?, ?),
              (?, ?, NULL, 'expense', 'Custom 2', 'tag', 0, 11, NULL, ?, ?)`,
    )
      .bind('c-null-1', 'u-fix-sch-1', NOW, NOW, 'c-null-2', 'u-fix-sch-1', NOW, NOW)
      .run();
  });
});
