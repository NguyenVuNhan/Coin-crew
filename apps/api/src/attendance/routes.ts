import { Hono } from 'hono';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { resolveActor } from '@cc/api-auth/actor';
import { ensure } from '@cc/api-auth/guard';
import { ApiError } from '@cc/api-util/errors';
import { previewAttendance } from './count';

export function attendanceRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // GET /trips/:id/attendance: admins of a sport group only.
  app.get('/trips/:id/attendance', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    if (actor.trip.preset !== 'sport') {
      throw new ApiError('FORBIDDEN', 403, 'Attendance is only kept for sport groups.');
    }
    ensure(actor, 'plan_session');
    return c.json(await previewAttendance(getDb(c.env), tripId));
  });

  return app;
}
