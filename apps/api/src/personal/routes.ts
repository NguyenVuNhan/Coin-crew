import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { personalRecurringRules, userPersonalSettings } from '@cc/api-db/schema';
import { getSessionUser, requireUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { nextOccurrenceAfter, vnDate, type RecurringSchedule } from '@cc/core';
import { parseJson } from './validate';
import { walletRoutes } from './wallets';
import { categoryAndTagRoutes } from './categories';
import { entryRoutes } from './entries';
import { listRoutes } from './list';
import { assetRoutes } from './assets';
import { holdingsRoutes } from './holdings';
import { syncRoutes } from './sync';
import { groupLinkRoutes, recordPersonalToggle } from './groupLinks';
import { visibilityRoutes } from './visibility';
import { reportRoutes } from './reports';
import { budgetRoutes } from './budgets';
import { recurringRoutes } from './recurring';
import { plannedRoutes } from './planned';

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
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const enabledInt = body.enabled ? 1 : 0;

    const prev = await db
      .select({ enabled: userPersonalSettings.enabled })
      .from(userPersonalSettings)
      .where(eq(userPersonalSettings.userId, user.id))
      .get();
    const turningOn = body.enabled && prev?.enabled !== 1;

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

    await recordPersonalToggle(db, user.id, body.enabled, now);

    // R19: turning personal area back on skips missed recurring dates and restarts check-in clocks
    if (turningOn) {
      const activeRules = await db
        .select({
          id: personalRecurringRules.id,
          schedule: personalRecurringRules.schedule,
        })
        .from(personalRecurringRules)
        .where(
          and(
            eq(personalRecurringRules.userId, user.id),
            eq(personalRecurringRules.status, 'active'),
          ),
        )
        .all();

      if (activeRules.length > 0) {
        const today = vnDate(nowDate);
        const stmts: BatchItem<'sqlite'>[] = activeRules.map((r) => {
          const schedule = JSON.parse(r.schedule) as RecurringSchedule;
          const nextDueOn = nextOccurrenceAfter(schedule, today);
          return db
            .update(personalRecurringRules)
            .set({
              nextDueOn,
              status: nextDueOn === null ? 'ended' : 'active',
              lastConfirmedOn: today,
              updatedAt: now,
            })
            .where(
              and(
                eq(personalRecurringRules.id, r.id),
                eq(personalRecurringRules.userId, user.id),
              ),
            );
        });
        await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
      }
    }

    return c.json({ enabled: body.enabled }, 200);
  });

  app.route('/', walletRoutes());
  app.route('/', categoryAndTagRoutes());
  app.route('/', entryRoutes());
  app.route('/', listRoutes());
  app.route('/', assetRoutes());
  app.route('/', holdingsRoutes());
  app.route('/', syncRoutes());
  app.route('/', groupLinkRoutes());
  app.route('/', visibilityRoutes());
  app.route('/', reportRoutes());
  app.route('/', budgetRoutes());
  app.route('/', recurringRoutes());
  app.route('/', plannedRoutes());

  return app;
}
