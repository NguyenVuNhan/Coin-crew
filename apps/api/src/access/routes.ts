import { Hono } from 'hono';
import { eq, or } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { trips } from '@cc/api-db/schema';
import { ApiError } from '@cc/api-util/errors';

export function accessRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/links/:token', async (c) => {
    const token = c.req.param('token');
    const db = getDb(c.env);
    const trip = await db
      .select()
      .from(trips)
      .where(or(eq(trips.groupToken, token), eq(trips.viewToken, token)))
      .get();

    // A personal ledger's tokens are never shown and never open anything.
    if (!trip || trip.preset === 'direct') {
      throw new ApiError('LINK_DEAD', 410, 'This link no longer works. Ask the organiser for a new one.');
    }

    const access = trip.groupToken === token ? 'group' : 'view';
    return c.json({
      tripId: trip.id,
      tripName: trip.name,
      access,
    });
  });

  return app;
}
