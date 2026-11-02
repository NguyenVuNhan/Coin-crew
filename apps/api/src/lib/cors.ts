import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../env';

export const corsMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  const origin = c.req.header('Origin');
  const allowed = (c.env.ZMP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!origin || !allowed.includes(origin)) {
    // Cross-origin callers that aren't on the list: logged so the Mini App's real origin can be found and added.
    if (origin && allowed.length > 0 && origin !== new URL(c.req.url).origin) {
      console.warn(`CORS: origin not in ZMP_ALLOWED_ORIGINS: ${origin}`);
    }
    await next();
    return;
  }

  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-Link-Token, X-Device-Restore',
    );
    c.header('Access-Control-Max-Age', '86400');
    c.header('Vary', 'Origin');
    return c.body(null, 204);
  }

  await next();
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Expose-Headers', 'X-Device-Id');
  c.header('Vary', 'Origin', { append: true });
};
