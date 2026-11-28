import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  personalEvents,
  personalEventGroups,
  personalEventShareMarks,
} from '@cc/api-db/schema';
import { seedUser } from './helpers';

const NOW = '2026-11-27T00:00:00.000Z';

async function colsOf(table: string): Promise<string[]> {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return res.results.map((r) => r.name);
}

async function seedTag(id: string, userId: string, name = 'Da Lat'): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(id, userId, name, NOW)
    .run();
}

async function seedBudget(id: string, userId: string, tagId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO personal_budgets
     (id, user_id, name, target_kind, target_id, currency, period_kind, from_date, to_date, created_on, created_at, updated_at)
     VALUES (?, ?, 'Da Lat', 'tag', ?, 'VND', 'once', '2026-11-27', '2026-11-30', '2026-11-27', ?, ?)`,
  )
    .bind(id, userId, tagId, NOW, NOW)
    .run();
}

describe('personal events tables (0038)', () => {
  it('the three tables exist with their columns', async () => {
    expect(personalEvents.id).toBeDefined();
    expect(personalEventGroups.eventId).toBeDefined();
    expect(personalEventShareMarks.userId).toBeDefined();

    expect(await colsOf('personal_events')).toEqual([
      'id',
      'user_id',
      'tag_id',
      'start_date',
      'end_date',
      'counts_from',
      'budget_id',
      'created_at',
      'updated_at',
    ]);

    expect(await colsOf('personal_event_groups')).toEqual([
      'event_id',
      'trip_id',
    ]);

    expect(await colsOf('personal_event_share_marks')).toEqual([
      'user_id',
      'root_id',
      'event_id',
      'state',
    ]);
  });

  it('deleting a tag deletes its event, groups and marks', async () => {
    await seedUser('u-trv-tdel', 'Event Tag Del User');
    await seedTag('tag-trv-del', 'u-trv-tdel');

    await env.DB.prepare(
      `INSERT INTO personal_events
       (id, user_id, tag_id, start_date, end_date, counts_from, budget_id, created_at, updated_at)
       VALUES ('trv-tdel-1', 'u-trv-tdel', 'tag-trv-del', '2026-11-27', '2026-11-30', '2026-11-27', NULL, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_event_groups (event_id, trip_id) VALUES ('trv-tdel-1', 'trip-1')",
    ).run();

    await env.DB.prepare(
      "INSERT INTO personal_event_share_marks (user_id, root_id, event_id, state) VALUES ('u-trv-tdel', 'root-1', 'trv-tdel-1', 'tagged')",
    ).run();

    await env.DB.prepare("DELETE FROM personal_tags WHERE id = 'tag-trv-del'").run();

    for (const table of [
      'personal_events',
      'personal_event_groups',
      'personal_event_share_marks',
    ]) {
      const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row?.n, `expected 0 rows in ${table}`).toBe(0);
    }
  });

  it('deleting a budget sets budget_id to null', async () => {
    await seedUser('u-trv-bdel', 'Event Budget Del User');
    await seedTag('tag-trv-bdel', 'u-trv-bdel');
    await seedBudget('b-trv-del', 'u-trv-bdel', 'tag-trv-bdel');

    await env.DB.prepare(
      `INSERT INTO personal_events
       (id, user_id, tag_id, start_date, end_date, counts_from, budget_id, created_at, updated_at)
       VALUES ('trv-bdel-1', 'u-trv-bdel', 'tag-trv-bdel', '2026-11-27', '2026-11-30', '2026-11-27', 'b-trv-del', ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare("DELETE FROM personal_budgets WHERE id = 'b-trv-del'").run();

    const row = await env.DB.prepare(
      "SELECT budget_id FROM personal_events WHERE id = 'trv-bdel-1'",
    ).first<{ budget_id: string | null }>();
    expect(row).not.toBeNull();
    expect(row?.budget_id).toBeNull();
  });

  it('a second mark for the same (user_id, root_id) fails', async () => {
    await seedUser('u-trv-mk', 'Event Mark User');
    await seedTag('tag-trv-mk1', 'u-trv-mk', 'Trip 1');
    await seedTag('tag-trv-mk2', 'u-trv-mk', 'Trip 2');

    await env.DB.prepare(
      `INSERT INTO personal_events
       (id, user_id, tag_id, start_date, end_date, counts_from, budget_id, created_at, updated_at)
       VALUES ('trv-mk-1', 'u-trv-mk', 'tag-trv-mk1', '2026-11-01', '2026-11-03', '2026-11-01', NULL, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      `INSERT INTO personal_events
       (id, user_id, tag_id, start_date, end_date, counts_from, budget_id, created_at, updated_at)
       VALUES ('trv-mk-2', 'u-trv-mk', 'tag-trv-mk2', '2026-11-10', '2026-11-12', '2026-11-10', NULL, ?, ?)`,
    )
      .bind(NOW, NOW)
      .run();

    await env.DB.prepare(
      "INSERT INTO personal_event_share_marks (user_id, root_id, event_id, state) VALUES ('u-trv-mk', 'root-dup', 'trv-mk-1', 'tagged')",
    ).run();

    await expect(
      env.DB.prepare(
        "INSERT INTO personal_event_share_marks (user_id, root_id, event_id, state) VALUES ('u-trv-mk', 'root-dup', 'trv-mk-2', 'skipped')",
      ).run(),
    ).rejects.toThrow();
  });
});
