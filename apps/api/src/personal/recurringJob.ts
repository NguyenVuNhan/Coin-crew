import { and, asc, eq, lte } from 'drizzle-orm';
import type { Env } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { personalRecurringRules, userPersonalSettings } from '@cc/api-db/schema';
import { vnDate } from '@cc/core';
import { applyRule } from './recurringApply';

export const RECURRING_STATEMENT_BUDGET = 45;

const PICK_LIMIT = 50;

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    return cause ? `${err.message}: ${errorMessage(cause)}` : err.message;
  }
  return String(err);
}

/**
 * Hourly recurring job (`15 * * * *`).
 * Picks up to 50 due active rules for users with the personal area enabled,
 * applies each within RECURRING_STATEMENT_BUDGET (including the pick query),
 * and stops early when the budget would be exceeded.
 */
export async function runRecurring(
  env: Env,
  now: Date,
): Promise<{ rules: number; statements: number; leftOver: number }> {
  const db = getDb(env);
  const today = vnDate(now);

  // Pick query (1 statement): oldest-due active rules for enabled personal users.
  const due = await db
    .select({
      id: personalRecurringRules.id,
      userId: personalRecurringRules.userId,
    })
    .from(personalRecurringRules)
    .innerJoin(
      userPersonalSettings,
      eq(userPersonalSettings.userId, personalRecurringRules.userId),
    )
    .where(
      and(
        eq(personalRecurringRules.status, 'active'),
        lte(personalRecurringRules.nextDueOn, today),
        eq(userPersonalSettings.enabled, 1),
      ),
    )
    .orderBy(asc(personalRecurringRules.nextDueOn), asc(personalRecurringRules.id))
    .limit(PICK_LIMIT)
    .all();

  let statements = 1;
  let rules = 0;
  let leftOver = 0;

  for (let i = 0; i < due.length; i++) {
    const row = due[i]!;
    const remaining = RECURRING_STATEMENT_BUDGET - statements;
    if (remaining <= 0) {
      leftOver = due.length - i;
      console.log(`recurring: budget hit, ${leftOver} rules left`);
      break;
    }

    try {
      const result = await applyRule(db, row.userId, row.id, today, remaining);
      if (result === 'over_budget') {
        leftOver = due.length - i;
        console.log(`recurring: budget hit, ${leftOver} rules left`);
        break;
      }
      statements += result.used;
      if (result.used > 0) {
        rules += 1;
      }
    } catch (err) {
      // The failed rule still made its reads (and maybe a rolled-back batch): count them conservatively.
      statements += 8;
      const msg = errorMessage(err);
      if (msg.includes('UNIQUE')) {
        console.log(`recurring: rule ${row.id} already applied (unique constraint): ${msg}`);
      } else {
        console.error(`recurring: rule ${row.id} failed:`, err);
      }
    }
  }

  return { rules, statements, leftOver };
}
