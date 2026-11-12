import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

const migration = () => env.TEST_MIGRATIONS!.find((m) => m.name.startsWith('0022'))!;

describe('migration 0022', () => {
  it('dedupe keeps the oldest code per pair', async () => {
    const m = migration();
    expect(m).toBeDefined();
    const cleanup = m.queries.find((q) => q.includes('DELETE FROM `payment_refs`'))!;
    expect(cleanup).toBeDefined();

    // Scratch copy of payment_refs without the pair index (the pre-migration shape).
    await env.DB.prepare(
      'CREATE TABLE payment_refs_old (code text NOT NULL, trip_id text NOT NULL, from_id text NOT NULL, to_id text NOT NULL, created_at text NOT NULL)',
    ).run();
    const insert = (code: string, trip: string, from: string, to: string, createdAt: string) =>
      env.DB.prepare('INSERT INTO payment_refs_old (code, trip_id, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(code, trip, from, to, createdAt)
        .run();

    await insert('Y', 't', 'a', 'b', '2026-02-01T00:00:00.000Z');
    await insert('X', 't', 'a', 'b', '2026-01-01T00:00:00.000Z');
    await insert('Z', 't', 'b', 'a', '2026-03-01T00:00:00.000Z');
    // A tie on created_at keeps the smaller code.
    await insert('Q', 't', 'c', 'd', '2026-04-01T00:00:00.000Z');
    await insert('P', 't', 'c', 'd', '2026-04-01T00:00:00.000Z');

    await env.DB.prepare(cleanup.replaceAll('`payment_refs`', '`payment_refs_old`')).run();

    const rows = await env.DB.prepare('SELECT code FROM payment_refs_old ORDER BY code').all<{ code: string }>();
    expect(rows.results.map((r) => r.code)).toEqual(['P', 'X', 'Z']);
  });

  it('pair index rejects a second ref for the same pair', async () => {
    const insert = (code: string) =>
      env.DB.prepare('INSERT INTO payment_refs (code, trip_id, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(code, 'trip-mig-22', 'a', 'b', '2026-11-12T00:00:00.000Z')
        .run();
    await insert('X');
    await expect(insert('Y')).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it('payment_keys exists', async () => {
    await env.DB.prepare('INSERT INTO payment_keys (key, trip_id, payment_id, created_at) VALUES (?, ?, ?, ?)')
      .bind('k-1', 'trip-mig-22', 'pay-1', '2026-11-12T00:00:00.000Z')
      .run();
    const row = await env.DB.prepare('SELECT key, trip_id, payment_id FROM payment_keys WHERE key = ?')
      .bind('k-1')
      .first();
    expect(row).toEqual({ key: 'k-1', trip_id: 'trip-mig-22', payment_id: 'pay-1' });
  });
});
