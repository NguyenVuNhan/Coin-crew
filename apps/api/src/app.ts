import { Hono } from 'hono';
import type { AppBindings } from './env';
import { errorResponse } from './lib/errors';
import { authRoutes } from './auth/routes';
import { testLoginRoutes } from './auth/testLogin';
import { deviceMiddleware } from './access/device';
import { accessRoutes } from './access/routes';
import { tripRoutes } from './trips/routes';
import { participantRoutes } from './participants/routes';
import { expenseRoutes } from './expenses/routes';
import { bankRoutes } from './bank/routes';
import { paymentRoutes } from './payments/routes';

export function createApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.onError((err) => errorResponse(err));
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

  app.use('/api/*', deviceMiddleware);

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api', authRoutes());
  app.route('/api', testLoginRoutes());
  app.route('/api', accessRoutes());
  app.route('/api', tripRoutes());
  app.route('/api', participantRoutes());
  app.route('/api', expenseRoutes());
  app.route('/api', bankRoutes());
  app.route('/api', paymentRoutes());

  return app;
}
