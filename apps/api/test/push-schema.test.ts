import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { getDb } from '@cc/api-db/client';
import { accountMergeRequests } from '@cc/api-db/schema';
import { mergeUsers } from '../src/auth/mergeUsers';

const CREATED = '2026-11-13T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(query).bind(...binds).run();
}

async function row<T>(query: string, ...binds: unknown[]): Promise<T | null> {
  return env.DB.prepare(query).bind(...binds).first<T>();
}

/** A user signed in with Google (`g-<id>`), or with Zalo when `zaloSub` is given. */
async function addUser(id: string, zaloSub: string | null = null): Promise<void> {
  await run(
    'INSERT INTO users (id, google_sub, zalo_sub, name, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    zaloSub ? null : `g-${id}`,
    zaloSub,
    `Name ${id}`,
    CREATED,
  );
}

async function addSubscription(id: string, userId: string): Promise<void> {
  await run(
    'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    userId,
    `https://push.example/${id}`,
    'p256dh-key',
    'auth-secret',
    CREATED,
    CREATED,
  );
}

async function addReminder(id: string, subscriptionId: string): Promise<void> {
  await run(
    'INSERT INTO push_reminders (id, subscription_id, transaction_root_id, trip_id, due_at) VALUES (?, ?, ?, ?, ?)',
    id,
    subscriptionId,
    'root-1',
    't-1',
    '2026-11-14T10:00:00.000Z',
  );
}

// The shared beforeEach in setup.ts deletes `users` before these tables; with foreign keys enforced,
// leftover push rows would make the next test's reset fail, so this file clears its own rows.
afterEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM push_reminders'), env.DB.prepare('DELETE FROM push_subscriptions')]);
});

describe('push tables', () => {
  it('migration creates push tables', async () => {
    await addUser('u-1');
    await addSubscription('ps-1', 'u-1');
    await addReminder('pr-1', 'ps-1');

    const sub = (await row<Record<string, unknown>>('SELECT * FROM push_subscriptions WHERE id = ?', 'ps-1'))!;
    expect(sub).toMatchObject({
      user_id: 'u-1',
      endpoint: 'https://push.example/ps-1',
      new_session: 1,
      session_reminder: 1,
      reminder_lead_minutes: 30,
      expense_new: 1,
      user_agent: null,
      last_success_at: null,
    });

    const reminder = (await row<Record<string, unknown>>('SELECT * FROM push_reminders WHERE id = ?', 'pr-1'))!;
    expect(reminder).toMatchObject({
      subscription_id: 'ps-1',
      transaction_root_id: 'root-1',
      trip_id: 't-1',
      due_at: '2026-11-14T10:00:00.000Z',
      sent_at: null,
    });
  });

  it('endpoint is unique and one reminder per subscription and session', async () => {
    await addUser('u-1');
    await addSubscription('ps-1', 'u-1');
    await expect(
      run(
        'INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'ps-2',
        'u-1',
        'https://push.example/ps-1',
        'k',
        'a',
        CREATED,
        CREATED,
      ),
    ).rejects.toThrow(/UNIQUE/);

    await addReminder('pr-1', 'ps-1');
    await expect(addReminder('pr-2', 'ps-1')).rejects.toThrow(/UNIQUE/);
  });

  it('deleting a subscription cascades its reminders', async () => {
    await addUser('u-1');
    await addSubscription('ps-1', 'u-1');
    await addReminder('pr-1', 'ps-1');

    await run('DELETE FROM push_subscriptions WHERE id = ?', 'ps-1');

    const count = (await row<{ n: number }>('SELECT COUNT(*) AS n FROM push_reminders'))!;
    expect(count.n).toBe(0);
  });

  it('mergeUsers moves push subscriptions to the surviving user', async () => {
    await addUser('u-a');
    await addUser('u-b', 'z-b');
    await addSubscription('ps-a', 'u-a');
    await addSubscription('ps-b', 'u-b');
    await run(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'mr-1',
      'u-a',
      'u-b',
      'zalo',
      'z-b',
      'pending',
      new Date().toISOString(),
      new Date(Date.now() + 7 * 86_400_000).toISOString(),
    );
    const db = getDb(env);
    const request = (await db.select().from(accountMergeRequests).where(eq(accountMergeRequests.id, 'mr-1')).get())!;

    await mergeUsers(db, request, 'dev');

    expect(await row('SELECT id FROM users WHERE id = ?', 'u-b')).toBeNull();
    const subs = await env.DB.prepare('SELECT id, user_id FROM push_subscriptions ORDER BY id').all<{
      id: string;
      user_id: string;
    }>();
    expect(subs.results).toEqual([
      { id: 'ps-a', user_id: 'u-a' },
      { id: 'ps-b', user_id: 'u-a' },
    ]);
  });
});
