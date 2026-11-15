import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import { getDb } from '@cc/api-db/client';
import { userPersonalSettings } from '@cc/api-db/schema';
import type { AppBindings } from '@cc/api-db/env';
import { ApiError } from '@cc/api-util/errors';
import { getSessionUser } from './session';

export async function isPersonalAreaOn(db: Db, userId: string): Promise<boolean> {
  const row = await db
    .select({ enabled: userPersonalSettings.enabled })
    .from(userPersonalSettings)
    .where(eq(userPersonalSettings.userId, userId))
    .get();
  return row?.enabled === 1;
}

export const requirePersonal: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) {
    throw new ApiError('UNAUTHENTICATED', 401);
  }
  const db = getDb(c.env);
  const on = await isPersonalAreaOn(db, user.id);
  if (!on) {
    throw new ApiError('FORBIDDEN', 403);
  }
  await next();
};
