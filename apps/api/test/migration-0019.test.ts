import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

describe('migration 0019', () => {
  it('deduplicates multiple pending claims for same user by keeping the newest', async () => {
    const migration = env.TEST_MIGRATIONS!.find((m) => m.name.startsWith('0019'))!;
    const cleanup = migration.queries.find((q) => q.includes('UPDATE `membership_requests`'))!;
    const index = migration.queries.find((q) => q.includes('CREATE UNIQUE INDEX `membership_requests_one_pending_user`'))!;
    expect(cleanup).toBeDefined();
    expect(index).toBeDefined();

    // Drop index to simulate pre-migration state with duplicate pending requests for same user
    await env.DB.prepare('DROP INDEX IF EXISTS membership_requests_one_pending_user').run();

    const insert = (id: string, participantId: string, status: string, createdAt: string) =>
      env.DB.prepare(
        'INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(id, 'trip-mig-19', participantId, 'user-mig-19', status, createdAt)
        .run();

    // Insert older claim on p1 and newer claim on p2
    await insert('r-old', 'p1', 'pending', '2026-10-01T00:00:00.000Z');
    await insert('r-new', 'p2', 'pending', '2026-10-02T00:00:00.000Z');

    // Run cleanup & re-create index
    await env.DB.prepare(cleanup).run();
    await env.DB.prepare(index).run();

    const rows = await env.DB.prepare(
      "SELECT id, status FROM membership_requests WHERE trip_id = 'trip-mig-19' ORDER BY id",
    ).all<{ id: string; status: string }>();

    expect(rows.results).toEqual([
      { id: 'r-new', status: 'pending' },
      { id: 'r-old', status: 'rejected' },
    ]);
  });
});
