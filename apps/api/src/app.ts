import { Hono } from 'hono';
import type { AppBindings } from './env';
import { errorResponse } from './lib/errors';

export function createApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.onError((err) => errorResponse(err));
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));

  return app;
}
