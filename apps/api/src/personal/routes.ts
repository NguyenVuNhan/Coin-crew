import type { Context } from 'hono';
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { personalWallets, userPersonalSettings } from '@cc/api-db/schema';
import { getSessionUser, requireUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import { MAX_WALLET_AMOUNT } from '@cc/core';
import type { WalletView } from '@cc/core';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

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

  app.get('/me/personal/wallets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const rows = await db
      .select()
      .from(personalWallets)
      .where(eq(personalWallets.userId, user.id))
      .orderBy(asc(personalWallets.createdAt))
      .all();

    const wallets: WalletView[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      currency: 'VND',
      balance: r.startAmount,
      isDefault: Boolean(r.isDefault),
    }));

    return c.json({ wallets }, 200);
  });

  app.post('/me/personal/wallets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (
      typeof body.name !== 'string' ||
      body.name.trim().length < 1 ||
      body.name.trim().length > 40
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (
      typeof body.startAmount !== 'number' ||
      !Number.isSafeInteger(body.startAmount) ||
      body.startAmount < 0 ||
      body.startAmount > MAX_WALLET_AMOUNT
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const name = body.name.trim();
    const db = getDb(c.env);

    const existing = await db
      .select({ id: personalWallets.id })
      .from(personalWallets)
      .where(eq(personalWallets.userId, user.id))
      .get();

    if (existing) {
      throw new ApiError('ALREADY_HANDLED', 409, 'You already have a wallet.');
    }

    const now = nowIso();
    const walletId = newId();

    try {
      await db.insert(personalWallets).values({
        id: walletId,
        userId: user.id,
        name,
        currency: 'VND',
        startAmount: body.startAmount,
        startDate: now.slice(0, 10),
        isDefault: 1,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_HANDLED', 409, 'You already have a wallet.');
      }
      throw err;
    }

    const wallet: WalletView = {
      id: walletId,
      name,
      currency: 'VND',
      balance: body.startAmount,
      isDefault: true,
    };

    return c.json({ wallet }, 201);
  });

  return app;
}
