import { Hono, type Context } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import { personalPlannedItems, personalRecurringRules } from '@cc/api-db/schema';
import { personalBumpStatement, personalVersionExpr } from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import {
  vnDate,
  type ConfirmPlannedInput,
  type PlannedItemsResponse,
  type PlannedItemView,
  type RecurringDraft,
  type RecurringSchedule,
} from '@cc/core';
import { parseEntryInput } from './entryInput';
import { prepareEntryWrite } from './entryWrite';
import { resumeRuleStmts } from './recurring';
import { draftToEntryInput } from './recurringApply';

export type PlannedItemRow = typeof personalPlannedItems.$inferSelect;

export interface PlannedKindHandler {
  confirm(
    db: Db,
    userId: string,
    item: PlannedItemRow,
    body: ConfirmPlannedInput,
    now: string,
  ): Promise<{ transactionId: string | null; extra: BatchItem<'sqlite'>[] }>;
}

export const plannedKinds: Record<string, PlannedKindHandler> = {
  recurring_occurrence: {
    async confirm(db, userId, item, body, now) {
      let entryInput = body.entry;
      if (!entryInput) {
        if (!item.draft) {
          throw new ApiError('VALIDATION', 422, 'Missing draft');
        }
        const draft = JSON.parse(item.draft) as RecurringDraft;
        entryInput = draftToEntryInput(draft, item.dueOn);
      }

      const prepared = await prepareEntryWrite(db, userId, entryInput, {
        source: 'recurring',
        externalRef: item.refKey,
        now,
      });

      const today = vnDate(new Date(now));
      const extra: BatchItem<'sqlite'>[] = [
        personalBumpStatement(db, userId),
        ...prepared.items(personalVersionExpr(userId)),
      ];

      if (item.ruleId) {
        extra.push(
          db
            .update(personalRecurringRules)
            .set({ lastConfirmedOn: today, updatedAt: now })
            .where(
              and(
                eq(personalRecurringRules.id, item.ruleId),
                eq(personalRecurringRules.userId, userId),
              ),
            ) as unknown as BatchItem<'sqlite'>,
        );
      }

      return { transactionId: prepared.entries[0]!.id, extra };
    },
  },

  recurring_checkin: {
    async confirm(db, userId, item, _body, now) {
      const today = vnDate(new Date(now));
      const extra: BatchItem<'sqlite'>[] = item.ruleId
        ? [
            db
              .update(personalRecurringRules)
              .set({ lastConfirmedOn: today, updatedAt: now })
              .where(
                and(
                  eq(personalRecurringRules.id, item.ruleId),
                  eq(personalRecurringRules.userId, userId),
                ),
              ) as unknown as BatchItem<'sqlite'>,
          ]
        : [];
      return { transactionId: null, extra };
    },
  },

  recurring_paused: {
    async confirm(db, userId, item, _body, now) {
      if (!item.ruleId) {
        return { transactionId: null, extra: [] };
      }
      const rule = await db
        .select({
          id: personalRecurringRules.id,
          schedule: personalRecurringRules.schedule,
        })
        .from(personalRecurringRules)
        .where(
          and(
            eq(personalRecurringRules.id, item.ruleId),
            eq(personalRecurringRules.userId, userId),
          ),
        )
        .get();
      if (!rule) {
        return { transactionId: null, extra: [] };
      }
      const schedule = JSON.parse(rule.schedule) as RecurringSchedule;
      const today = vnDate(new Date(now));
      const { stmts } = resumeRuleStmts(db, userId, rule.id, schedule, today, now);
      return { transactionId: null, extra: stmts };
    },
  },

  rule_suggestion: {
    async confirm() {
      return { transactionId: null, extra: [] };
    },
  },
};

function toPlannedItemView(row: PlannedItemRow): PlannedItemView {
  return {
    id: row.id,
    kind: row.kind as PlannedItemView['kind'],
    ruleId: row.ruleId ?? null,
    dueOn: row.dueOn,
    draft: row.draft ? (JSON.parse(row.draft) as RecurringDraft) : null,
    status: row.status as PlannedItemView['status'],
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
    createdOn: row.createdOn,
  };
}

async function parseOptionalJson(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

export function plannedRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // Query cost: 1
  app.get('/me/personal/planned', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const rows = await db
      .select()
      .from(personalPlannedItems)
      .where(
        and(
          eq(personalPlannedItems.userId, user.id),
          eq(personalPlannedItems.status, 'waiting'),
        ),
      )
      .orderBy(asc(personalPlannedItems.dueOn), asc(personalPlannedItems.createdOn))
      .all();

    const body: PlannedItemsResponse = {
      items: rows.map(toPlannedItemView),
    };
    return c.json(body, 200);
  });

  // Query cost: <= 12 plus entry writes
  app.post('/me/personal/planned/:id/confirm', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const rawBody = await parseOptionalJson(c);
    const body: ConfirmPlannedInput =
      rawBody.entry !== undefined ? { entry: parseEntryInput(rawBody.entry) } : {};

    const db = getDb(c.env);
    const item = await db
      .select()
      .from(personalPlannedItems)
      .where(and(eq(personalPlannedItems.id, id), eq(personalPlannedItems.userId, user.id)))
      .get();

    if (!item) {
      throw new ApiError('NOT_FOUND', 404, 'Planned item not found');
    }
    if (item.status !== 'waiting') {
      throw new ApiError('ALREADY_RESOLVED', 409, 'Planned item already resolved');
    }

    const handler = plannedKinds[item.kind];
    if (!handler) {
      throw new ApiError('VALIDATION', 422, 'Unknown planned item kind');
    }

    const now = new Date().toISOString();
    const { transactionId, extra } = await handler.confirm(db, user.id, item, body, now);

    const updateItemStmt = db
      .update(personalPlannedItems)
      .set({
        status: 'confirmed',
        transactionId,
        resolvedAt: now,
      })
      .where(
        and(
          eq(personalPlannedItems.id, item.id),
          eq(personalPlannedItems.userId, user.id),
          eq(personalPlannedItems.status, 'waiting'),
        ),
      ) as unknown as BatchItem<'sqlite'>;

    try {
      await db.batch([updateItemStmt, ...extra] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_RESOLVED', 409, 'Planned item already resolved');
      }
      throw err;
    }

    return c.json({ ok: true, transactionId }, 200);
  });

  // Query cost: <= 4
  app.post('/me/personal/planned/:id/skip', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const item = await db
      .select()
      .from(personalPlannedItems)
      .where(and(eq(personalPlannedItems.id, id), eq(personalPlannedItems.userId, user.id)))
      .get();

    if (!item) {
      throw new ApiError('NOT_FOUND', 404, 'Planned item not found');
    }
    if (item.status !== 'waiting') {
      throw new ApiError('ALREADY_RESOLVED', 409, 'Planned item already resolved');
    }

    const now = new Date().toISOString();
    const nextStatus = item.kind === 'recurring_occurrence' ? 'skipped' : 'dismissed';

    const stmts: BatchItem<'sqlite'>[] = [
      db
        .update(personalPlannedItems)
        .set({ status: nextStatus, resolvedAt: now })
        .where(
          and(
            eq(personalPlannedItems.id, item.id),
            eq(personalPlannedItems.userId, user.id),
            eq(personalPlannedItems.status, 'waiting'),
          ),
        ) as unknown as BatchItem<'sqlite'>,
    ];

    if (item.kind === 'recurring_checkin' && item.ruleId) {
      stmts.push(
        db
          .update(personalRecurringRules)
          .set({
            status: 'paused',
            pausedReason: 'manual',
            updatedAt: now,
          })
          .where(
            and(
              eq(personalRecurringRules.id, item.ruleId),
              eq(personalRecurringRules.userId, user.id),
            ),
          ) as unknown as BatchItem<'sqlite'>,
      );
    }

    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    return c.json({ ok: true }, 200);
  });

  return app;
}
