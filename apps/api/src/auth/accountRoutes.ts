import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { toMeUserView } from './me';
import { getSessionUser, requireUser } from './session';

export function accountRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.delete('/me/identities/:provider', requireUser, async (c) => {
    const provider = c.req.param('provider');
    if (provider !== 'google' && provider !== 'zalo') {
      throw new ApiError('NOT_FOUND', 404);
    }

    const user = (await getSessionUser(c))!;

    const currentSub = provider === 'google' ? user.googleSub : user.zaloSub;
    if (currentSub == null) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const otherSub = provider === 'google' ? user.zaloSub : user.googleSub;
    if (otherSub == null) {
      throw new ApiError('LAST_IDENTITY', 409, 'You need at least one sign-in method');
    }

    const db = getDb(c.env);
    if (provider === 'google') {
      await db
        .update(users)
        .set({ googleSub: null, email: null })
        .where(eq(users.id, user.id));
    } else {
      await db
        .update(users)
        .set({ zaloSub: null })
        .where(eq(users.id, user.id));
    }

    const updated = await db.select().from(users).where(eq(users.id, user.id)).get();
    if (!updated) {
      throw new ApiError('NOT_FOUND', 404);
    }
    c.set('user', updated);

    return c.json({ user: toMeUserView(updated) }, 200);
  });

  return app;
}
