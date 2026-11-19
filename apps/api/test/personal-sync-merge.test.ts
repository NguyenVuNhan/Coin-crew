import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { getDb } from '@cc/api-db/client';
import { accountMergeRequests, personalSyncState } from '@cc/api-db/schema';
import { mergeUsers } from '../src/auth/mergeUsers';

const CREATED = '2026-10-12T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(query).bind(...binds).run();
}

describe('personal sync merge', () => {
  it('merging accounts bumps the epoch of the surviving user', async () => {
    await run(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, gender, avatar_url, custom_profile, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'u-a',
      'g-a',
      null,
      'a@x.com',
      'Anh A',
      'M',
      null,
      0,
      CREATED,
      CREATED,
    );
    await run(
      'INSERT INTO users (id, google_sub, zalo_sub, email, name, gender, avatar_url, custom_profile, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'u-b',
      null,
      'z-b',
      null,
      'Bé Chi',
      'F',
      null,
      1,
      CREATED,
      CREATED,
    );

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await run(
      'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      'mr-1',
      'u-a',
      'u-b',
      'zalo',
      'z-b',
      'pending',
      now,
      expiresAt,
      null,
    );

    const db = getDb(env);
    const before = await db
      .select()
      .from(personalSyncState)
      .where(eq(personalSyncState.userId, 'u-a'))
      .get();
    expect(before).toBeUndefined();

    const request = (await db
      .select()
      .from(accountMergeRequests)
      .where(eq(accountMergeRequests.id, 'mr-1'))
      .get())!;

    await mergeUsers(db, request, 'dev');

    const after = await db
      .select()
      .from(personalSyncState)
      .where(eq(personalSyncState.userId, 'u-a'))
      .get();
    expect(after?.epoch).toBe(1);
  });
});
