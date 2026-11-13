import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { seedTrip, T } from './helpers';
import { getDb } from '@cc/api-db/client';
import { trips, tripViews } from '@cc/api-db/schema';
import { getSnapshot } from '../src/trips/snapshot';

const savedVersion = async () =>
  (await getDb(env).select({ version: tripViews.version }).from(tripViews).where(eq(tripViews.tripId, T.tripId)).get())?.version;

describe('saving a group view', () => {
  beforeEach(async () => { await seedTrip(); });

  it('a request holding an older trip version does not replace a newer saved view', async () => {
    const db = getDb(env);
    const stale = (await db.select().from(trips).where(eq(trips.id, T.tripId)).get())!;

    await env.DB.prepare('UPDATE trips SET version = version + 1 WHERE id = ?').bind(T.tripId).run();
    const fresh = (await db.select().from(trips).where(eq(trips.id, T.tripId)).get())!;
    await getSnapshot(db, fresh);
    expect(await savedVersion()).toBe(fresh.version);

    // The slow request finishes last with the version it read before the change.
    await getSnapshot(db, stale, null);
    expect(await savedVersion()).toBe(fresh.version);
  });

  it('a newer version replaces an older saved view', async () => {
    const db = getDb(env);
    await getSnapshot(db, (await db.select().from(trips).where(eq(trips.id, T.tripId)).get())!);
    await env.DB.prepare('UPDATE trips SET version = version + 1 WHERE id = ?').bind(T.tripId).run();
    const fresh = (await db.select().from(trips).where(eq(trips.id, T.tripId)).get())!;
    await getSnapshot(db, fresh);
    expect(await savedVersion()).toBe(fresh.version);
  });
});
