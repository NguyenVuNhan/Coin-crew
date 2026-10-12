import { Hono } from 'hono';
import { eq, or } from 'drizzle-orm';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { trips } from '../db/schema';
import { ApiError } from '../lib/errors';

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

    if (!trip) {
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
