import type { Context } from 'hono';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { userNotificationSettings } from '@cc/api-db/schema';
import { getSessionUser, requireUser } from '@cc/api-auth/session';
import { ApiError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';
import type { UserNotificationSettings } from '@cc/core';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

export function notificationSettingsRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/notifications', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const row = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, user.id))
      .get();

    const settings: UserNotificationSettings = {
      transactionCrud: row ? Boolean(row.transactionCrud) : true,
      loanReminders: row ? Boolean(row.loanReminders) : true,
      monthlyNotice: row ? Boolean(row.monthlyNotice) : true,
    };

    return c.json({ settings }, 200);
  });

  app.patch('/me/notifications', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const { transactionCrud, loanReminders, monthlyNotice } = body;

    if (transactionCrud !== undefined && typeof transactionCrud !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'transactionCrud must be a boolean');
    }
    if (loanReminders !== undefined && typeof loanReminders !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'loanReminders must be a boolean');
    }
    if (monthlyNotice !== undefined && typeof monthlyNotice !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'monthlyNotice must be a boolean');
    }

    const db = getDb(c.env);
    const existing = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, user.id))
      .get();

    const newTransactionCrud =
      typeof transactionCrud === 'boolean'
        ? (transactionCrud ? 1 : 0)
        : (existing ? existing.transactionCrud : 1);

    const newLoanReminders =
      typeof loanReminders === 'boolean'
        ? (loanReminders ? 1 : 0)
        : (existing ? existing.loanReminders : 1);

    const newMonthlyNotice =
      typeof monthlyNotice === 'boolean'
        ? (monthlyNotice ? 1 : 0)
        : (existing ? existing.monthlyNotice : 1);

    const now = nowIso();

    await db
      .insert(userNotificationSettings)
      .values({
        userId: user.id,
        transactionCrud: newTransactionCrud,
        loanReminders: newLoanReminders,
        monthlyNotice: newMonthlyNotice,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userNotificationSettings.userId,
        set: {
          transactionCrud: newTransactionCrud,
          loanReminders: newLoanReminders,
          monthlyNotice: newMonthlyNotice,
          updatedAt: now,
        },
      });

    const settings: UserNotificationSettings = {
      transactionCrud: Boolean(newTransactionCrud),
      loanReminders: Boolean(newLoanReminders),
      monthlyNotice: Boolean(newMonthlyNotice),
    };

    return c.json({ settings }, 200);
  });

  return app;
}
