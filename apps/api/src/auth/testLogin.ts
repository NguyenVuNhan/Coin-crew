import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { users, personalGroupSettings } from '@cc/api-db/schema';
import { ApiError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import { createSession, getSessionUser, setSessionCookie } from '@cc/api-auth/session';

/** Sign-in shortcut for the end-to-end tests. Answers 404 unless the Worker runs with E2E_LOGIN=1 (never set in wrangler.jsonc). */
export function testLoginRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.post('/test/login', async (c) => {
    if (c.env.E2E_LOGIN !== '1') throw new ApiError('NOT_FOUND', 404, 'Not found');
    const { sub, name, email, provider = 'google' } = await c.req.json<{ sub: string; name: string; email?: string; provider?: 'google' | 'zalo' }>();
    const db = getDb(c.env);
    const existing = await db.select().from(users).where(eq(provider === 'zalo' ? users.zaloSub : users.googleSub, sub)).get();
    const userId = existing?.id ?? newId();
    if (!existing) await db.insert(users).values({
      id: userId,
      ...(provider === 'zalo' ? { zaloSub: sub } : { googleSub: sub }),
      email: email ?? null,
      name,
      createdAt: nowIso(),
    });
    setSessionCookie(c, await createSession(db, userId));
    return c.json({ userId });
  });

  /** Moves the signed-in caller's Sổ chi tiêu disabled_at back by `days` days (and reenabled_at to now) for G-26/G-27. */
  app.post('/test/personal/off-since', async (c) => {
    if (c.env.E2E_LOGIN !== '1') throw new ApiError('NOT_FOUND', 404, 'Not found');
    const user = await getSessionUser(c);
    if (!user) throw new ApiError('UNAUTHENTICATED', 401);
    let body: { days?: unknown };
    try {
      body = await c.req.json<{ days?: unknown }>();
    } catch {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const days = body?.days;
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
      throw new ApiError('VALIDATION', 422, 'days must be a non-negative number');
    }
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const disabledAt = new Date(nowMs - Math.round(days * 86_400_000)).toISOString();
    const db = getDb(c.env);
    await db
      .insert(personalGroupSettings)
      .values({
        userId: user.id,
        disabledAt,
        reenabledAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: personalGroupSettings.userId,
        set: {
          disabledAt,
          reenabledAt: now,
          updatedAt: now,
        },
      });
    return c.json({ ok: true, disabledAt, reenabledAt: now });
  });

  return app;
}
