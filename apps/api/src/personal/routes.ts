import { Hono } from 'hono';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { userPersonalSettings } from '@cc/api-db/schema';
import { getSessionUser, requireUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';
import { parseJson } from './validate';
import { walletRoutes } from './wallets';
import { categoryAndTagRoutes } from './categories';
import { entryRoutes } from './entries';
import { listRoutes } from './list';
import { assetRoutes } from './assets';
import { holdingsRoutes } from './holdings';
import { syncRoutes } from './sync';
import { visibilityRoutes } from './visibility';

export function personalRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal', requirePersonal, async (c) => {
    return c.json({ ok: true }, 200);
  });

  app.patch('/me/personal', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (typeof body.enabled !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'enabled must be a boolean');
    }

    const db = getDb(c.env);
    const now = nowIso();
    const enabledInt = body.enabled ? 1 : 0;

    await db
      .insert(userPersonalSettings)
      .values({
        userId: user.id,
        enabled: enabledInt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userPersonalSettings.userId,
        set: {
          enabled: enabledInt,
          updatedAt: now,
        },
      });

    return c.json({ enabled: body.enabled }, 200);
  });

  app.route('/', walletRoutes());
  app.route('/', categoryAndTagRoutes());
  app.route('/', entryRoutes());
  app.route('/', listRoutes());
  app.route('/', assetRoutes());
  app.route('/', holdingsRoutes());
  app.route('/', syncRoutes());
  app.route('/', visibilityRoutes());

  return app;
}
