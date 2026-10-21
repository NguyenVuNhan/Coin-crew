import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, gt } from 'drizzle-orm';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { accountMergeRequests, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { nowIso } from '../lib/ids';
import { toMeUserView } from './me';
import { mergeUsers } from './mergeUsers';
import { getSessionUser, requireUser } from './session';

/**
 * Decline (as B, the merged account) or cancel (as A, the survivor) an open request in one conditional write.
 * 404 when the request is not this user's on that side, or is no longer pending, or has expired.
 */
async function closeRequest(
  c: Context<AppBindings>,
  side: 'merged' | 'survivor',
  status: 'declined' | 'cancelled',
): Promise<Response> {
  const user = (await getSessionUser(c))!;
  const now = nowIso();
  const closed = await getDb(c.env)
    .update(accountMergeRequests)
    .set({ status, decidedAt: now })
    .where(
      and(
        eq(accountMergeRequests.id, c.req.param('id') ?? ''),
        eq(side === 'merged' ? accountMergeRequests.mergedUserId : accountMergeRequests.survivorUserId, user.id),
        eq(accountMergeRequests.status, 'pending'),
        gt(accountMergeRequests.expiresAt, now),
      ),
    )
    .returning({ id: accountMergeRequests.id });
  if (closed.length === 0) {
    throw new ApiError('NOT_FOUND', 404);
  }
  return c.body(null, 204);
}

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

  /** B confirms: B is merged into A, and this session (like all of B's) now belongs to A. */
  app.post('/me/merge-requests/:id/accept', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const request = await db
      .select()
      .from(accountMergeRequests)
      .where(
        and(
          eq(accountMergeRequests.id, c.req.param('id')),
          eq(accountMergeRequests.mergedUserId, user.id),
          eq(accountMergeRequests.status, 'pending'),
          gt(accountMergeRequests.expiresAt, nowIso()),
        ),
      )
      .get();
    if (!request) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const survivor = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, request.survivorUserId))
      .get();
    const heldSub = request.provider === 'google' ? user.googleSub : user.zaloSub;
    if (!survivor || heldSub !== request.providerSub) {
      await db
        .update(accountMergeRequests)
        .set({ status: 'cancelled', decidedAt: nowIso() })
        .where(and(eq(accountMergeRequests.id, request.id), eq(accountMergeRequests.status, 'pending')));
      throw new ApiError('MERGE_STALE', 409, 'This merge request is out of date.');
    }

    await mergeUsers(db, request, c.get('deviceHash'));

    const merged = await db.select().from(users).where(eq(users.id, request.survivorUserId)).get();
    if (!merged) {
      throw new ApiError('NOT_FOUND', 404);
    }
    c.set('user', merged);
    return c.json({ user: toMeUserView(merged) }, 200);
  });

  app.post('/me/merge-requests/:id/decline', requireUser, (c) => closeRequest(c, 'merged', 'declined'));

  app.post('/me/merge-requests/:id/cancel', requireUser, (c) => closeRequest(c, 'survivor', 'cancelled'));

  return app;
}
