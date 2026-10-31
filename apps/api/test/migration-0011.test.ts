import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

const run = (query: string, ...binds: unknown[]) => env.DB.prepare(query).bind(...binds).run();

function person(id: string, name: string, createdAt: string) {
  return run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, status, sort_order, created_at) VALUES (?, 't1', ?, ?, 'active', 0, ?)",
    id, name, name.toLowerCase(), createdAt,
  );
}

function linkRow(participantId: string, personPid: string, createdAt: string) {
  return run(
    "INSERT INTO person_links (owner_user_id, participant_id, person_pid, created_at) VALUES ('u1', ?, ?, ?)",
    participantId, personPid, createdAt,
  );
}

describe('migration 0011', () => {
  it("adds person_links.kind, 'merge' by default", async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(person_links)').all<{ name: string; notnull: number; dflt_value: string | null }>();
    expect(results.find((c) => c.name === 'kind')).toMatchObject({ notnull: 1, dflt_value: "'merge'" });
  });

  it('backfills links written with their ledger row as imports and keeps the rest as merges', async () => {
    const migration = env.TEST_MIGRATIONS!.find((m) => m.name.startsWith('0011'))!;
    const backfill = migration.queries.find((q) => q.includes('UPDATE `person_links`'))!;
    expect(backfill).toBeDefined();

    const T0 = '2026-10-01T00:00:00.000Z';
    const T1 = '2026-10-02T00:00:00.000Z';
    // Imported: the ledger row and its link share one timestamp and the name.
    await person('g-minh', 'Minh', T0);
    await person('l-minh', 'Minh', T1);
    await linkRow('g-minh', 'l-minh', T1);
    // Merged later, by the owner.
    await person('g-linh', 'Linh', T0);
    await linkRow('g-linh', 'l-minh', '2026-10-03T00:00:00.000Z');
    // Merged in the same instant as the ledger row was made, but under another name.
    await person('g-other', 'Bao', T0);
    await linkRow('g-other', 'l-minh', T1);

    await env.DB.prepare(backfill).run();

    const { results } = await env.DB.prepare('SELECT participant_id, kind FROM person_links ORDER BY participant_id').all();
    expect(results).toEqual([
      { participant_id: 'g-linh', kind: 'merge' },
      { participant_id: 'g-minh', kind: 'import' },
      { participant_id: 'g-other', kind: 'merge' },
    ]);
  });
});
