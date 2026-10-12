import { Hono } from 'hono';
import type { AppBindings } from './env';
import { errorResponse } from './lib/errors';
import { authRoutes } from './auth/routes';
import { deviceMiddleware } from './access/device';
import { accessRoutes } from './access/routes';
import { tripRoutes } from './trips/routes';

export function createApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.onError((err) => errorResponse(err));
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

  app.use('/api/*', deviceMiddleware);

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api', authRoutes());
  app.route('/api', accessRoutes());
  app.route('/api', tripRoutes());

  return app;
}
