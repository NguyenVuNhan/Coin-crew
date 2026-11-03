import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import { getDb } from '@cc/api-db/client';
import { sessions, users } from '@cc/api-db/schema';
import type { AppBindings } from '@cc/api-db/env';
import { ApiError } from '@cc/api-util/errors';
import { newToken, nowIso, sha256Hex } from '@cc/api-util/ids';
import type { UserRow } from '@cc/api-db/types';

export type { UserRow } from '@cc/api-db/types';

export const SESSION_DAYS = 30;

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = newToken();
  const idHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db.insert(sessions).values({ idHash, userId, expiresAt });
  return token;
}

export function readSessionToken(c: Context<AppBindings>): string | undefined {
  const auth = c.req.header('Authorization');
  const match = auth?.match(/^Bearer\s+(\S+)$/i);
  if (match) {
    return match[1];
  }
  return getCookie(c, 'sid');
}

export async function getSessionUser(c: Context<AppBindings>): Promise<UserRow | null> {
  const cached = c.get('user');
  if (cached !== undefined) {
    return cached;
  }
  const sid = readSessionToken(c);
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
