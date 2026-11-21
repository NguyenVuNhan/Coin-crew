import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { seedUser } from './helpers';

const NOW = '2026-11-21T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function indexesOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA index_list(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

describe('personal group link tables (0030)', () => {
  it('creates all four tables with expected columns and indexes', async () => {
    expect(await colsOf('personal_group_links')).toEqual([
      'user_id',
      'root_id',
      'trip_id',
      'wallet_id',
      'category_id',
      'intent',
      'exclude_from_reports',
      'created_at',
      'updated_at',
      'sync_version',
    ]);
    expect(await indexesOf('personal_group_links')).toContain('personal_group_links_user_trip_idx');

    expect(await colsOf('personal_group_link_tags')).toEqual(['user_id', 'root_id', 'tag_id']);
    expect(await indexesOf('personal_group_link_tags')).toContain('personal_group_link_tags_tag_idx');

    expect(await colsOf('personal_group_settings')).toEqual([
      'user_id',
      'default_group_category_id',
      'count_loans',
      'disabled_at',
      'reenabled_at',
      'updated_at',
    ]);

    expect(await colsOf('personal_balance_checks')).toEqual(['user_id', 'wallet_id', 'answered_at']);
  });

  it('rejects duplicate primary keys across all four tables', async () => {
    await seedUser('u-pgl-pk', 'PglPk');
    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-pgl-pk', 'u-pgl-pk', 'Ví', 'VND', 0, '2026-01-01', 1, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();
    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('t-pgl-pk', 'u-pgl-pk', 'Ăn uống', ?)",
    )
      .bind(NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_group_links (user_id, root_id, trip_id, created_at, updated_at) VALUES ('u-pgl-pk', 'root-1', 'trip-1', ?, ?)",
    )
      .bind(NOW, NOW)
      .run();
    await expect(
      env.DB.prepare(
        "INSERT INTO personal_group_links (user_id, root_id, trip_id, created_at, updated_at) VALUES ('u-pgl-pk', 'root-1', 'trip-2', ?, ?)",
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "INSERT INTO personal_group_link_tags (user_id, root_id, tag_id) VALUES ('u-pgl-pk', 'root-1', 't-pgl-pk')",
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO personal_group_link_tags (user_id, root_id, tag_id) VALUES ('u-pgl-pk', 'root-1', 't-pgl-pk')",
      ).run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "INSERT INTO personal_group_settings (user_id, updated_at) VALUES ('u-pgl-pk', ?)",
    )
      .bind(NOW)
      .run();
    await expect(
      env.DB.prepare("INSERT INTO personal_group_settings (user_id, updated_at) VALUES ('u-pgl-pk', ?)")
        .bind(NOW)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      "INSERT INTO personal_balance_checks (user_id, wallet_id, answered_at) VALUES ('u-pgl-pk', 'w-pgl-pk', ?)",
    )
      .bind(NOW)
      .run();
    await expect(
      env.DB.prepare(
        "INSERT INTO personal_balance_checks (user_id, wallet_id, answered_at) VALUES ('u-pgl-pk', 'w-pgl-pk', ?)",
      )
        .bind(NOW)
        .run(),
    ).rejects.toThrow();
  });

  it('enforces intent CHECK constraint and defaults on personal_group_links', async () => {
    await seedUser('u-pgl-chk', 'PglChk');

    await env.DB.prepare(
      "INSERT INTO personal_group_links (user_id, root_id, trip_id, intent, created_at, updated_at) VALUES ('u-pgl-chk', 'r-shared', 'trip-1', 'shared', ?, ?)",
    )
      .bind(NOW, NOW)
      .run();
    await env.DB.prepare(
      "INSERT INTO personal_group_links (user_id, root_id, trip_id, intent, created_at, updated_at) VALUES ('u-pgl-chk', 'r-loan', 'trip-1', 'loan', ?, ?)",
    )
      .bind(NOW, NOW)
      .run();
    await env.DB.prepare(
      "INSERT INTO personal_group_links (user_id, root_id, trip_id, intent, created_at, updated_at) VALUES ('u-pgl-chk', 'r-null', 'trip-1', NULL, ?, ?)",
    )
      .bind(NOW, NOW)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_group_links (user_id, root_id, trip_id, intent, created_at, updated_at) VALUES ('u-pgl-chk', 'r-other', 'trip-1', 'other', ?, ?)",
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow();

    const row = await env.DB.prepare(
      "SELECT exclude_from_reports, sync_version FROM personal_group_links WHERE user_id = 'u-pgl-chk' AND root_id = 'r-null'",
    ).first<{ exclude_from_reports: number; sync_version: number }>();
    expect(row).toEqual({ exclude_from_reports: 0, sync_version: 0 });
  });
});
