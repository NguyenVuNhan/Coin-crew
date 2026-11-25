import { and, eq } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '@cc/api-db/client';
import { personalCategories } from '@cc/api-db/schema';
import { nowIso } from '@cc/api-util/ids';
import { ADOPTED_STARTER_KEYS, FIXED_CATEGORIES } from '@cc/core';

export function fixedCategoryId(userId: string, key: string): string {
  return `${userId}:${key}`;
}

/**
 * Ensures the user has a `personal_categories` row for every entry in `FIXED_CATEGORIES`.
 * Cheap no-op when every fixed key already has a row with that `system_key`.
 * Adopts eligible old starter rows by id (`${userId}:${key}`), resetting name/icon/type/parent
 * while preserving `hidden`, `sort_order`, and any transactions pointing at the row.
 */
export async function ensureFixedCategories(db: Db, userId: string): Promise<void> {
  const existing = await db
    .select({
      id: personalCategories.id,
      systemKey: personalCategories.systemKey,
    })
    .from(personalCategories)
    .where(eq(personalCategories.userId, userId))
    .all();

  const existingSystemKeys = new Set<string>();
  const existingIds = new Set<string>();
  for (const row of existing) {
    existingIds.add(row.id);
    if (row.systemKey !== null) {
      existingSystemKeys.add(row.systemKey);
    }
  }

  const missing = FIXED_CATEGORIES.filter((c) => !existingSystemKeys.has(c.key));
  if (missing.length === 0) return;

  const now = nowIso();
  const stmts: BatchItem<'sqlite'>[] = missing.map((c) => {
    const id = fixedCategoryId(userId, c.key);
    const parentId = c.parentKey ? fixedCategoryId(userId, c.parentKey) : null;

    if (existingIds.has(id) && ADOPTED_STARTER_KEYS.has(c.key)) {
      return db
        .update(personalCategories)
        .set({
          systemKey: c.key,
          name: c.name,
          icon: c.icon,
          type: c.type,
          parentId,
          updatedAt: now,
        })
        .where(
          and(eq(personalCategories.id, id), eq(personalCategories.userId, userId)),
        ) as unknown as BatchItem<'sqlite'>;
    }

    return db
      .insert(personalCategories)
      .values({
        id,
        userId,
        parentId,
        type: c.type,
        name: c.name,
        icon: c.icon,
        hidden: 0,
        sortOrder: c.sortOrder,
        systemKey: c.key,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing() as unknown as BatchItem<'sqlite'>;
  });

  await db.batch([stmts[0]!, ...stmts.slice(1)]);
}
