import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

const NOW = '2026-10-31T00:00:00.000Z';

function insertTrip(id: string, preset: string, organiser: string) {
  return env.DB.prepare(
    'INSERT INTO trips (id, name, preset, organiser_user_id, group_token, view_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, id, preset, organiser, `g-${id}`, `v-${id}`, NOW)
    .run();
}

function insertRequest(id: string, participantId: string, status: string) {
  return env.DB.prepare(
    'INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, 't1', participantId, 'u1', status, NOW)
    .run();
}

async function columns(table: string) {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{
    name: string;
    notnull: number;
  }>();
  return results;
}

describe('migration 0009', () => {
  it('creates person_links, nicknames, participant_merges and participant_merge_rows', async () => {
    const expected: Record<string, string[]> = {
      person_links: ['owner_user_id', 'participant_id', 'person_pid', 'created_at'],
      nicknames: ['owner_user_id', 'person_key', 'nickname', 'updated_at'],
      participant_merges: ['id', 'trip_id', 'from_id', 'into_id', 'actor_user_id', 'created_at'],
      participant_merge_rows: ['merge_id', 'table_name', 'row_key', 'before_json'],
    };
    for (const [table, cols] of Object.entries(expected)) {
      const names = (await columns(table)).map((c) => c.name);
      expect(names).toEqual(cols);
    }
  });

  it('indexes participant_merge_rows by merge_id', async () => {
    const { results } = await env.DB.prepare('PRAGMA index_list(participant_merge_rows)').all<{
      name: string;
    }>();
    expect(results.map((r) => r.name)).toContain('participant_merge_rows_merge_id_idx');
  });

  it('adds a nullable, unique participants.request_token', async () => {
    const row = (await columns('participants')).find((c) => c.name === 'request_token');
    expect(row).toBeDefined();
    expect(row?.notnull).toBe(0);

    const insert = (id: string, token: string | null) =>
      env.DB.prepare(
        "INSERT INTO participants (id, trip_id, name, normalized_name, status, sort_order, created_at, request_token) VALUES (?, 't1', ?, ?, 'active', 0, ?, ?)",
      )
        .bind(id, id, id, NOW, token)
        .run();

    await insert('p1', null);
    await insert('p2', null);
    await insert('p3', 'tok');
    await expect(insert('p4', 'tok')).rejects.toThrow();
  });

  it('allows one direct trip per organiser', async () => {
    await insertTrip('d1', 'direct', 'u1');
    await insertTrip('t-a', 'trip', 'u1');
    await insertTrip('t-b', 'trip', 'u1');
    await insertTrip('d2', 'direct', 'u2');
    await expect(insertTrip('d3', 'direct', 'u1')).rejects.toThrow();
  });

  it('allows one pending membership request per participant', async () => {
    await insertRequest('r1', 'p1', 'pending');
    await insertRequest('r2', 'p1', 'rejected');
    await insertRequest('r3', 'p1', 'approved');
    await insertRequest('r4', 'p2', 'pending');
    await expect(insertRequest('r5', 'p1', 'pending')).rejects.toThrow();
  });
});
