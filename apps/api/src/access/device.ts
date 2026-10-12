import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { devices } from '../db/schema';
import { newToken, nowIso, sha256Hex } from '../lib/ids';

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

  const existing = await db
    .select()
    .from(devices)
    .where(eq(devices.idHash, hash))
    .get();

  if (!existing) {
    await db.insert(devices).values({
      idHash: hash,
      createdAt: now,
      lastSeenAt: now,
    });
  } else if (Date.now() - new Date(existing.lastSeenAt).getTime() > 3_600_000) {
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
