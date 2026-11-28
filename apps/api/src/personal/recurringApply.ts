import { and, eq, gte, inArray, like, ne, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '@cc/api-db/client';
import {
  personalAssets,
  personalCategories,
  personalPlannedItems,
  personalRecurringRules,
  personalRecurringRuleTags,
  personalTags,
  personalTransactions,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { ApiError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import {
  checkInPolicy,
  planRuleRun,
  type EntryInput,
  type RecurringDraft,
  type RecurringRuleView,
  type RecurringSchedule,
  type RunPlan,
} from '@cc/core';
import { prepareEntryWrite } from './entryWrite';

const MAX_OCCURRENCES_PER_RUN = 31;

type MissingRefReason = 'missing_wallet' | 'missing_category' | 'missing_asset';

/**
 * Estimates the number of D1 batch statements required to apply `plan` for a rule:
 * 1 (sync bump)
 * + per recorded entry (1 insert, +1 for transfers, +tags per row, +balance delta statements: 1 per wallet touched, +1 if a non-VND transfer)
 * + 1 per waiting/check-in/paused item
 * + 1 rule update.
 */
export function estimateStatements(plan: RunPlan, draft: RecurringDraft): number {
  const tagCount = draft.tags.length;
  const perRecord =
    draft.type === 'transfer'
      ? 2 + tagCount * 2 + 2 + 1
      : 1 + tagCount + 1;

  return (
    1 +
    plan.record.length * perRecord +
    plan.wait.length +
    (plan.openCheckIn ? 1 : 0) +
    (plan.pause !== null ? 1 : 0) +
    1
  );
}

/** Reads one prepareEntryWrite makes for this draft: wallets, category (expense/income), tag lookup. */
export function readsPerRecord(draft: RecurringDraft): number {
  return 1 + (draft.type === 'expense' || draft.type === 'income' ? 1 : 0) + (draft.tags.length > 0 ? 1 : 0);
}

export function draftToEntryInput(draft: RecurringDraft, date: string): EntryInput {
  if (draft.type === 'expense' || draft.type === 'income') {
    return {
      type: draft.type,
      walletId: draft.walletId,
      categoryId: draft.categoryId!,
      amount: draft.amount,
      date,
      note: draft.note,
      tags: draft.tags,
      excludeFromReports: draft.excludeFromReports ?? false,
    };
  }
  if (draft.type === 'transfer') {
    return {
      type: 'transfer',
      fromWalletId: draft.walletId,
      toWalletId: draft.toWalletId!,
      amountSent: draft.amount,
      ...(draft.amountReceived !== undefined ? { amountReceived: draft.amountReceived } : {}),
      date,
      note: draft.note,
      tags: draft.tags,
      excludeFromReports: draft.excludeFromReports ?? true,
    };
  }
  throw new ApiError('VALIDATION', 422, 'Buy rules cannot record automatically');
}

/**
 * Loads refs, plans with planRuleRun, writes everything for this rule in ONE commitPersonalWrite batch.
 * Returns statements used. Missing refs (archived/missing wallet, deleted category, deleted asset)
 * pause the rule with that reason; a plan with pause 'checkin' or 'waiting' pauses it too.
 * Every self-pause adds one recurring_paused item (meta.reason) and resolves an open check-in.
 */
export async function applyRule(
  db: Db,
  userId: string,
  ruleId: string,
  today: string,
  statementBudget: number,
): Promise<{ used: number } | 'over_budget'> {
  const [ruleRow, tagRows] = await Promise.all([
    db
      .select()
      .from(personalRecurringRules)
      .where(and(eq(personalRecurringRules.id, ruleId), eq(personalRecurringRules.userId, userId)))
      .get(),
    db
      .select({ name: personalTags.name })
      .from(personalRecurringRuleTags)
      .innerJoin(personalTags, eq(personalTags.id, personalRecurringRuleTags.tagId))
      .where(eq(personalRecurringRuleTags.ruleId, ruleId))
      .all(),
  ]);

  if (!ruleRow || ruleRow.status !== 'active') {
    return { used: 0 };
  }

  const rawDraft = JSON.parse(ruleRow.draft) as Omit<RecurringDraft, 'tags'>;
  const draft: RecurringDraft = {
    ...rawDraft,
    tags: tagRows.map((t) => t.name),
  };
  const schedule = JSON.parse(ruleRow.schedule) as RecurringSchedule;
  const askMe = Boolean(ruleRow.askMe) || draft.type === 'buy';
  const now = nowIso();

  const walletIds =
    draft.type === 'transfer' && draft.toWalletId
      ? [...new Set([draft.walletId, draft.toWalletId])]
      : [draft.walletId];

  const [walletRows, catRow, assetRow, waitingItems] = await Promise.all([
    db
      .select({
        id: personalWallets.id,
        archivedAt: personalWalletSettings.archivedAt,
      })
      .from(personalWallets)
      .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
      .where(and(eq(personalWallets.userId, userId), inArray(personalWallets.id, walletIds)))
      .all(),
    (draft.type === 'expense' || draft.type === 'income') && draft.categoryId
      ? db
          .select({
            id: personalCategories.id,
            type: personalCategories.type,
            hidden: personalCategories.hidden,
          })
          .from(personalCategories)
          .where(
            and(
              eq(personalCategories.id, draft.categoryId),
              eq(personalCategories.userId, userId),
            ),
          )
          .get()
      : Promise.resolve(undefined),
    draft.type === 'buy' && draft.assetId
      ? db
          .select({
            id: personalAssets.id,
            hidden: personalAssets.hidden,
          })
          .from(personalAssets)
          .where(and(eq(personalAssets.id, draft.assetId), eq(personalAssets.userId, userId)))
          .get()
      : Promise.resolve(undefined),
    db
      .select({
        id: personalPlannedItems.id,
        kind: personalPlannedItems.kind,
        createdOn: personalPlannedItems.createdOn,
      })
      .from(personalPlannedItems)
      .where(
        and(
          eq(personalPlannedItems.userId, userId),
          eq(personalPlannedItems.ruleId, ruleId),
          eq(personalPlannedItems.status, 'waiting'),
        ),
      )
      .all(),
  ]);

  const openCheckInRow = waitingItems.find((i) => i.kind === 'recurring_checkin') ?? null;

  // Check missing refs before planning
  let missingReason: MissingRefReason | null = null;
  const walletMap = new Map(walletRows.map((w) => [w.id, w]));
  for (const wid of walletIds) {
    const w = walletMap.get(wid);
    if (!w || (w.archivedAt !== null && w.archivedAt !== undefined)) {
      missingReason = 'missing_wallet';
      break;
    }
  }
  if (
    missingReason === null &&
    (draft.type === 'expense' || draft.type === 'income') &&
    (!catRow || catRow.type !== draft.type || Boolean(catRow.hidden))
  ) {
    missingReason = 'missing_category';
  }
  if (missingReason === null && draft.type === 'buy' && (!assetRow || Boolean(assetRow.hidden))) {
    missingReason = 'missing_asset';
  }

  if (missingReason !== null) {
    const pauseStmts: BatchItem<'sqlite'>[] = [
      db
        .update(personalRecurringRules)
        .set({
          status: 'paused',
          pausedReason: missingReason,
          updatedAt: now,
        })
        .where(
          and(eq(personalRecurringRules.id, ruleId), eq(personalRecurringRules.userId, userId)),
        ) as unknown as BatchItem<'sqlite'>,
      db
        .insert(personalPlannedItems)
        .values({
          id: newId(),
          userId,
          kind: 'recurring_paused',
          refKey: `${ruleId}:paused:${today}`,
          ruleId,
          dueOn: today,
          draft: null,
          meta: JSON.stringify({ reason: missingReason }),
          status: 'waiting',
          transactionId: null,
          createdOn: today,
          resolvedAt: null,
        })
        .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
    ];
    if (openCheckInRow) {
      pauseStmts.push(
        db
          .update(personalPlannedItems)
          .set({ status: 'dismissed', resolvedAt: now })
          .where(
            and(
              eq(personalPlannedItems.id, openCheckInRow.id),
              eq(personalPlannedItems.userId, userId),
            ),
          ) as unknown as BatchItem<'sqlite'>,
      );
    }

    const used = 6 + 1 + pauseStmts.length;
    if (used > statementBudget) {
      return 'over_budget';
    }
    await commitPersonalWrite(db, userId, () => pauseStmts);
    return { used };
  }

  const waitingOccurrences = waitingItems.filter((i) => i.kind === 'recurring_occurrence').length;

  let openCheckIn: { createdOn: string; occurrencesSince: number } | null = null;
  if (openCheckInRow) {
    const countRow = await db
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(personalTransactions)
      .where(
        and(
          eq(personalTransactions.userId, userId),
          eq(personalTransactions.source, 'recurring'),
          like(personalTransactions.externalRef, `${ruleId}:%`),
          ne(personalTransactions.type, 'transfer_in'),
          gte(personalTransactions.date, openCheckInRow.createdOn),
        ),
      )
      .get();
    openCheckIn = {
      createdOn: openCheckInRow.createdOn,
      occurrencesSince: Number(countRow?.cnt ?? 0),
    };
  }

  // The statement budget counts reads too: rule + tags, the four ref lookups, the check-in count.
  const readsSoFar = 6 + (openCheckInRow ? 1 : 0);
  const fixedWrites = 4; // sync bump, rule update, a check-in or paused item, a check-in dismissal
  const room = statementBudget - readsSoFar - fixedWrites;
  const emptyPlan: RunPlan = { record: [], wait: [], nextDueOn: null, openCheckIn: false, pause: null };
  const perOccurrence = askMe
    ? 1
    : estimateStatements({ ...emptyPlan, record: ['x'] }, draft) -
      estimateStatements(emptyPlan, draft) +
      readsPerRecord(draft);
  const maxOccurrences = Math.max(0, Math.min(MAX_OCCURRENCES_PER_RUN, Math.floor(room / perOccurrence)));
  if (maxOccurrences === 0 && ruleRow.nextDueOn !== null && ruleRow.nextDueOn <= today) {
    return 'over_budget';
  }

  const plan = planRuleRun({
    rule: {
      schedule,
      askMe,
      status: ruleRow.status as RecurringRuleView['status'],
      nextDueOn: ruleRow.nextDueOn,
      lastConfirmedOn: ruleRow.lastConfirmedOn,
    },
    today,
    waitingOccurrences,
    openCheckIn,
    maxOccurrences,
  });

  if (
    plan.record.length === 0 &&
    plan.wait.length === 0 &&
    !plan.openCheckIn &&
    plan.pause === null &&
    plan.nextDueOn === ruleRow.nextDueOn
  ) {
    return { used: readsSoFar };
  }

  const estimated = readsSoFar + estimateStatements(plan, draft) + plan.record.length * readsPerRecord(draft);
  if (estimated > statementBudget) {
    return 'over_budget';
  }

  // Prepare occurrence writes (read-only; no writes until commitPersonalWrite)
  const entryBuilders: Array<(v: SQL) => BatchItem<'sqlite'>[]> = [];
  for (const date of plan.record) {
    const prepared = await prepareEntryWrite(db, userId, draftToEntryInput(draft, date), {
      source: 'recurring',
      externalRef: `${ruleId}:${date}`,
      now,
    });
    entryBuilders.push(prepared.items);
  }

  const extraStmts: BatchItem<'sqlite'>[] = [];
  const draftJson = JSON.stringify(draft);

  for (const date of plan.wait) {
    extraStmts.push(
      db.insert(personalPlannedItems).values({
        id: newId(),
        userId,
        kind: 'recurring_occurrence',
        refKey: `${ruleId}:${date}`,
        ruleId,
        dueOn: date,
        draft: draftJson,
        meta: null,
        status: 'waiting',
        transactionId: null,
        createdOn: today,
        resolvedAt: null,
      }) as unknown as BatchItem<'sqlite'>,
    );
  }

  if (plan.openCheckIn) {
    const policy = checkInPolicy(schedule);
    const pausesAfter =
      policy.kind === 'after'
        ? policy.graceDays !== null
          ? { days: policy.graceDays }
          : { occurrences: policy.graceOccurrences }
        : null;
    extraStmts.push(
      db
        .insert(personalPlannedItems)
        .values({
          id: newId(),
          userId,
          kind: 'recurring_checkin',
          refKey: `${ruleId}:checkin:${today}`,
          ruleId,
          dueOn: today,
          draft: null,
          meta: JSON.stringify({ pausesAfter }),
          status: 'waiting',
          transactionId: null,
          createdOn: today,
          resolvedAt: null,
        })
        .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
    );
  }

  if (plan.pause !== null) {
    extraStmts.push(
      db
        .insert(personalPlannedItems)
        .values({
          id: newId(),
          userId,
          kind: 'recurring_paused',
          refKey: `${ruleId}:paused:${today}`,
          ruleId,
          dueOn: today,
          draft: null,
          meta: JSON.stringify({ reason: plan.pause }),
          status: 'waiting',
          transactionId: null,
          createdOn: today,
          resolvedAt: null,
        })
        .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
    );
    if (openCheckInRow) {
      extraStmts.push(
        db
          .update(personalPlannedItems)
          .set({ status: 'dismissed', resolvedAt: now })
          .where(
            and(
              eq(personalPlannedItems.id, openCheckInRow.id),
              eq(personalPlannedItems.userId, userId),
            ),
          ) as unknown as BatchItem<'sqlite'>,
      );
    }
  }

  const nextStatus: RecurringRuleView['status'] =
    plan.pause !== null ? 'paused' : plan.nextDueOn === null ? 'ended' : 'active';
  const nextPausedReason = plan.pause !== null ? plan.pause : null;

  extraStmts.push(
    db
      .update(personalRecurringRules)
      .set({
        status: nextStatus,
        pausedReason: nextPausedReason,
        nextDueOn: plan.nextDueOn,
        updatedAt: now,
      })
      .where(
        and(eq(personalRecurringRules.id, ruleId), eq(personalRecurringRules.userId, userId)),
      ) as unknown as BatchItem<'sqlite'>,
  );

  let used = 0;
  await commitPersonalWrite(db, userId, (v) => {
    const all: BatchItem<'sqlite'>[] = [];
    for (const build of entryBuilders) {
      all.push(...build(v));
    }
    all.push(...extraStmts);
    used = readsSoFar + plan.record.length * readsPerRecord(draft) + 1 + all.length;
    return all;
  });

  return { used };
}
