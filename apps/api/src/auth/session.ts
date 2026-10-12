import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { sessions, users } from '../db/schema';
import type { AppBindings } from '../env';
import { ApiError } from '../lib/errors';
import { newToken, nowIso, sha256Hex } from '../lib/ids';

export type UserRow = typeof users.$inferSelect;

export const SESSION_DAYS = 30;

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = newToken();
  const idHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db.insert(sessions).values({ idHash, userId, expiresAt });
  return token;
}

export async function getSessionUser(c: Context<AppBindings>): Promise<UserRow | null> {
  const cached = c.get('user');
  if (cached !== undefined) {
    return cached;
  }
  const sid = getCookie(c, 'sid');
  if (!sid) {
    c.set('user', null);
    return null;
  }
  const idHash = await sha256Hex(sid);
  const db = getDb(c.env);
  const now = nowIso();
  const session = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.idHash, idHash), gt(sessions.expiresAt, now)))
    .get();
  if (!session) {
    c.set('user', null);
    return null;
  }
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .get();
  const result = user ?? null;
  c.set('user', result);
  return result;
}

export const requireUser: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) {
    throw new ApiError('UNAUTHENTICATED', 401);
  }
  await next();
};

export function setSessionCookie(c: Context<AppBindings>, token: string): void {
  setCookie(c, 'sid', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}
