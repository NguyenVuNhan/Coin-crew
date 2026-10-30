import { Hono } from 'hono';
import type { AppBindings } from './env';
import { errorResponse } from './lib/errors';
import { authRoutes } from './auth/routes';
import { accountRoutes } from './auth/accountRoutes';
import { testLoginRoutes } from './auth/testLogin';
import { deviceMiddleware } from './access/device';
import { accessRoutes } from './access/routes';
import { tripRoutes } from './trips/routes';
import { participantRoutes } from './participants/routes';
import { joinRoutes } from './participants/join';
import { expenseRoutes } from './expenses/routes';
import { fundRoutes } from './fund/routes';
import { ratingRoutes } from './ratings/routes';
import { bankRoutes } from './bank/routes';
import { paymentRoutes } from './payments/routes';
import { peopleRoutes } from './me/people';
import { ledgerRoutes } from './me/ledger';
import { pageRoutes } from './og/routes';

export function createApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.onError((err) => errorResponse(err));
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

  app.use('/api/*', deviceMiddleware);

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api', authRoutes());
  app.route('/api', accountRoutes());
  app.route('/api', testLoginRoutes());
  app.route('/api', accessRoutes());
  app.route('/api', tripRoutes());
  app.route('/api', participantRoutes());
  app.route('/api', joinRoutes());
  app.route('/api', expenseRoutes());
  app.route('/api', fundRoutes());
  app.route('/api', ratingRoutes());
  app.route('/api', bankRoutes());
  app.route('/api', paymentRoutes());
  app.route('/api', peopleRoutes());
  app.route('/api', ledgerRoutes());
  app.route('/', pageRoutes());

  return app;
}
