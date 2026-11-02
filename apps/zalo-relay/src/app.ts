import { Hono } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';

export const UPSTREAM_URL = 'https://graph.zalo.me/v2.0/me';

export interface CreateAppOptions {
  secret: string;
  fetch?: typeof fetch;
  log?: (line: string) => void;
}

export function createApp(opts: CreateAppOptions): Hono {
  if (!opts.secret) {
    throw new Error('ZALO_RELAY_SECRET is required');
  }

  const fetchFn = opts.fetch ?? globalThis.fetch;
  const logFn = opts.log ?? (() => {});

  const app = new Hono();

  app.use('*', async (c, next) => {
    const start = Date.now();
    try {
      await next();
    } finally {
      const ms = Date.now() - start;
      logFn(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
    }
  });

  app.get('/health', (c) => {
    return c.text('ok', 200);
  });

  app.get('/me', async (c) => {
    const auth = c.req.header('authorization') ?? '';
    const expectedAuth = `Bearer ${opts.secret}`;
    const actualDigest = createHash('sha256').update(auth).digest();
    const expectedDigest = createHash('sha256').update(expectedAuth).digest();

    if (!timingSafeEqual(actualDigest, expectedDigest)) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const fields = c.req.query('fields');
    if (fields !== 'id' && fields !== 'id,name,picture') {
      return c.json({ error: 'bad fields' }, 400);
    }

    const token = c.req.header('x-zalo-access-token');
    if (!token) {
      return c.json({ error: 'missing token' }, 400);
    }

    // Mini App tokens come with appsecret_proof; nginx drops underscored headers, so it arrives as X-Zalo-Appsecret-Proof.
    const upstreamHeaders: Record<string, string> = { access_token: token };
    const proof = c.req.header('x-zalo-appsecret-proof');
    if (proof) {
      upstreamHeaders.appsecret_proof = proof;
    }

    try {
      const upstreamRes = await fetchFn(`${UPSTREAM_URL}?fields=${fields}`, {
        method: 'GET',
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(5000),
      });

      const body = await upstreamRes.text();
      return new Response(body, {
        status: upstreamRes.status,
        headers: {
          'content-type': 'application/json',
        },
      });
    } catch (err: unknown) {
      const name =
        typeof err === 'object' && err !== null && 'name' in err
          ? (err as { name: unknown }).name
          : undefined;

      if (name === 'AbortError' || name === 'TimeoutError') {
        return c.json({ error: 'upstream timeout' }, 504);
      }

      return c.json({ error: 'upstream unreachable' }, 502);
    }
  });

  return app;
}
