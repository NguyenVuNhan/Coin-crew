import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { createSession, setSessionCookie } from './session';

/** Sign-in shortcut for the end-to-end tests. Answers 404 unless the Worker runs with E2E_LOGIN=1 (never set in wrangler.jsonc). */
export function testLoginRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.post('/test/login', async (c) => {
    if (c.env.E2E_LOGIN !== '1') throw new ApiError('NOT_FOUND', 404, 'Not found');
    const { sub, name, email } = await c.req.json<{ sub: string; name: string; email: string }>();
    const db = getDb(c.env);
    const existing = await db.select().from(users).where(eq(users.googleSub, sub)).get();
    const userId = existing?.id ?? newId();
    if (!existing) await db.insert(users).values({ id: userId, googleSub: sub, email, name, createdAt: nowIso() });
    setSessionCookie(c, await createSession(db, userId));
    return c.json({ userId });
  });
  return app;
}
