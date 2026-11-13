import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { matchedRoutes } from 'hono/route';
import { eq } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { devices } from '@cc/api-db/schema';
import { isDbError } from '@cc/api-util/errors';
import { newToken, nowIso, sha256Hex } from '@cc/api-util/ids';

export const deviceMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  const cookieDid = getCookie(c, 'did');
  let id = cookieDid;
  let created = false;

  if (!id) {
    const restore = c.req.header('X-Device-Restore');
    if (restore && restore.length <= 64) {
      id = restore;
    } else {
      id = newToken();
      created = true;
    }
  }

  const hash = await sha256Hex(id);
  const db = getDb(c.env);
  const now = nowIso();

  const existing = created
    ? undefined
    : await db
        .select()
        .from(devices)
        .where(eq(devices.idHash, hash))
        .get();

  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method);
  // Middleware is registered with app.use (method ALL); a request that matches no real route will 404, so it
  // must not write a device row (a bot POSTing to bad URLs would otherwise fill the table).
  const hasRoute = matchedRoutes(c).some((r) => r.method !== 'ALL');
  const shouldPersist = hasRoute && Boolean(cookieDid || c.req.header('X-Device-Restore') || isMutation);

  if (!existing && shouldPersist) {
    try {
      await db
        .insert(devices)
        .values({
          idHash: hash,
          createdAt: now,
          lastSeenAt: now,
        })
        .onConflictDoNothing();
    } catch (err) {
      if (!isDbError(err, 'UNIQUE constraint failed')) {
        throw err;
      }
    }
  } else if (existing && Date.now() - new Date(existing.lastSeenAt).getTime() > 3_600_000) {
    await db
      .update(devices)
      .set({ lastSeenAt: now })
      .where(eq(devices.idHash, hash));
  }

  if (!cookieDid) {
    setCookie(c, 'did', id, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 400 * 86_400,
    });
  }

  if (created) {
    c.header('X-Device-Id', id);
  }

  c.set('deviceHash', hash);
  await next();
};
