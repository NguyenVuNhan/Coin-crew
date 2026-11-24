import { Hono } from 'hono';
import { and, asc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  personalCategories,
  personalCategoryVisibility,
  personalTags,
  personalTransactions,
  personalTransactionTags,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import type { CategoryView, TagView, WalletOverride } from '@cc/core';
import { STARTER_CATEGORIES } from './starterCategories';
import { name1to40, parseJson } from './validate';

function isCategoryType(v: unknown): v is 'expense' | 'income' {
  return v === 'expense' || v === 'income';
}

function requireIcon(v: unknown): string {
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid icon');
  }
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    throw new ApiError('VALIDATION', 422, 'Invalid icon');
  }
  return trimmed;
}

function starterKeyOf(userId: string, id: string): string | null {
  const prefix = `${userId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

function toCategoryView(
  row: {
    id: string;
    parentId: string | null;
    type: string;
    name: string;
    icon: string;
    hidden: number;
    sortOrder: number;
  },
  userId: string,
  walletOverrides: WalletOverride[] = [],
): CategoryView {
  return {
    id: row.id,
    parentId: row.parentId ?? null,
    type: row.type as 'expense' | 'income',
    name: row.name,
    icon: row.icon,
    hidden: Boolean(row.hidden),
    sortOrder: row.sortOrder,
    starterKey: starterKeyOf(userId, row.id),
    walletOverrides,
  };
}

export function categoryAndTagRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/categories', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    let rows = await db
      .select({
        id: personalCategories.id,
        parentId: personalCategories.parentId,
        type: personalCategories.type,
        name: personalCategories.name,
        icon: personalCategories.icon,
        hidden: personalCategories.hidden,
        sortOrder: personalCategories.sortOrder,
      })
      .from(personalCategories)
      .where(eq(personalCategories.userId, user.id))
      .orderBy(asc(personalCategories.sortOrder), asc(personalCategories.createdAt))
      .all();

    if (rows.length === 0) {
      const now = nowIso();
      const stmts = STARTER_CATEGORIES.map((s) =>
        db
          .insert(personalCategories)
          .values({
            id: `${user.id}:${s.key}`,
            userId: user.id,
            parentId: s.parentKey ? `${user.id}:${s.parentKey}` : null,
            type: s.type,
            name: s.name,
            icon: s.icon,
            hidden: 0,
            sortOrder: s.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing(),
      );
      await db.batch([stmts[0]!, ...stmts.slice(1)]);

      rows = await db
        .select({
          id: personalCategories.id,
          parentId: personalCategories.parentId,
          type: personalCategories.type,
          name: personalCategories.name,
          icon: personalCategories.icon,
          hidden: personalCategories.hidden,
          sortOrder: personalCategories.sortOrder,
        })
        .from(personalCategories)
        .where(eq(personalCategories.userId, user.id))
        .orderBy(asc(personalCategories.sortOrder), asc(personalCategories.createdAt))
        .all();
    }

    const nowDate = new Date();
    const cutoff = new Date(
      Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() - 29),
    )
      .toISOString()
      .slice(0, 10);

    const recentRows = await db
      .select({
        categoryId: personalTransactions.categoryId,
      })
      .from(personalTransactions)
      .where(
        and(
          eq(personalTransactions.userId, user.id),
          eq(personalTransactions.source, 'manual'),
          isNotNull(personalTransactions.categoryId),
          gte(personalTransactions.date, cutoff),
        ),
      )
      .groupBy(personalTransactions.categoryId)
      .orderBy(sql`count(*) desc`, sql`max(${personalTransactions.date}) desc`)
      .limit(6)
      .all();

    const overrideRows = await db
      .select({
        categoryId: personalCategoryVisibility.categoryId,
        walletId: personalCategoryVisibility.walletId,
        visible: personalCategoryVisibility.visible,
      })
      .from(personalCategoryVisibility)
      .where(eq(personalCategoryVisibility.userId, user.id))
      .all();

    const overridesByCategory = new Map<string, WalletOverride[]>();
    for (const r of overrideRows) {
      const ov: WalletOverride = { walletId: r.walletId, visible: Boolean(r.visible) };
      const list = overridesByCategory.get(r.categoryId);
      if (list) list.push(ov);
      else overridesByCategory.set(r.categoryId, [ov]);
    }

    return c.json(
      {
        categories: rows.map((r) => toCategoryView(r, user.id, overridesByCategory.get(r.id) ?? [])),
        recentIds: recentRows.map((r) => r.categoryId!),
      },
      200,
    );
  });

  app.post('/me/personal/categories', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (!isCategoryType(body.type)) {
      throw new ApiError('VALIDATION', 422, 'Invalid type');
    }
    const type = body.type;
    const name = name1to40(body.name);
    const icon = requireIcon(body.icon);

    let parentId: string | null = null;
    if (body.parentId !== undefined && body.parentId !== null) {
      if (typeof body.parentId !== 'string' || body.parentId.trim().length === 0) {
        throw new ApiError('VALIDATION', 422, 'Invalid parentId');
      }
      parentId = body.parentId;
    }

    const db = getDb(c.env);

    let inheritedOverrides: WalletOverride[] = [];
    if (parentId !== null) {
      const parent = await db
        .select({
          id: personalCategories.id,
          parentId: personalCategories.parentId,
          type: personalCategories.type,
        })
        .from(personalCategories)
        .where(and(eq(personalCategories.id, parentId), eq(personalCategories.userId, user.id)))
        .get();

      if (!parent || parent.parentId !== null || parent.type !== type) {
        throw new ApiError('VALIDATION', 422, 'Invalid parent category');
      }

      const parentOverrides = await db
        .select({
          walletId: personalCategoryVisibility.walletId,
          visible: personalCategoryVisibility.visible,
        })
        .from(personalCategoryVisibility)
        .where(
          and(
            eq(personalCategoryVisibility.userId, user.id),
            eq(personalCategoryVisibility.categoryId, parentId),
          ),
        )
        .all();

      inheritedOverrides = parentOverrides.map((r) => ({
        walletId: r.walletId,
        visible: Boolean(r.visible),
      }));
    }

    const maxRow = await db
      .select({
        maxOrder: sql<number | null>`max(${personalCategories.sortOrder})`,
      })
      .from(personalCategories)
      .where(eq(personalCategories.userId, user.id))
      .get();

    const sortOrder = (maxRow?.maxOrder ?? -1) + 1;
    const id = newId();
    const now = nowIso();

    await commitPersonalWrite(db, user.id, () => [
      db.insert(personalCategories).values({
        id,
        userId: user.id,
        parentId,
        type,
        name,
        icon,
        hidden: 0,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      }),
      ...(inheritedOverrides.length > 0
        ? [
            db.insert(personalCategoryVisibility).values(
              inheritedOverrides.map((ov) => ({
                userId: user.id,
                walletId: ov.walletId,
                categoryId: id,
                visible: ov.visible ? 1 : 0,
              })),
            ),
          ]
        : []),
    ]);

    const category: CategoryView = {
      id,
      parentId,
      type,
      name,
      icon,
      hidden: false,
      sortOrder,
      starterKey: starterKeyOf(user.id, id),
      walletOverrides: inheritedOverrides,
    };

    return c.json({ category }, 201);
  });

  app.patch('/me/personal/categories/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const existing = await db
      .select({
        id: personalCategories.id,
        parentId: personalCategories.parentId,
        type: personalCategories.type,
        name: personalCategories.name,
        icon: personalCategories.icon,
        hidden: personalCategories.hidden,
        sortOrder: personalCategories.sortOrder,
      })
      .from(personalCategories)
      .where(and(eq(personalCategories.id, id), eq(personalCategories.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Category not found');
    }

    const nextName = body.name !== undefined ? name1to40(body.name) : existing.name;
    const nextIcon = body.icon !== undefined ? requireIcon(body.icon) : existing.icon;

    let nextHidden = Boolean(existing.hidden);
    if (body.hidden !== undefined) {
      if (typeof body.hidden !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid hidden');
      }
      nextHidden = body.hidden;
    }

    let nextSortOrder = existing.sortOrder;
    if (body.sortOrder !== undefined) {
      if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder)) {
        throw new ApiError('VALIDATION', 422, 'Invalid sortOrder');
      }
      nextSortOrder = body.sortOrder;
    }

    let requestedParentId: string | null | undefined;
    if (body.parentId !== undefined) {
      if (body.parentId === null) {
        requestedParentId = null;
      } else if (typeof body.parentId === 'string' && body.parentId.trim().length > 0) {
        requestedParentId = body.parentId.trim();
      } else {
        throw new ApiError('VALIDATION', 422, 'Invalid parentId');
      }
    }

    const existingParentId = existing.parentId ?? null;
    const parentChanged = requestedParentId !== undefined && requestedParentId !== existingParentId;
    const nextParentId: string | null =
      requestedParentId !== undefined ? requestedParentId : existingParentId;

    if (parentChanged && requestedParentId !== undefined) {
      if (requestedParentId === id) {
        throw new ApiError('VALIDATION', 422, 'Category cannot be its own parent');
      }

      if (requestedParentId !== null) {
        const child = await db
          .select({ id: personalCategories.id })
          .from(personalCategories)
          .where(and(eq(personalCategories.parentId, id), eq(personalCategories.userId, user.id)))
          .get();

        if (child) {
          throw new ApiError('IN_USE', 409, 'Category has sub-categories.', {
            reason: 'HAS_CHILDREN',
          });
        }

        const parent = await db
          .select({
            id: personalCategories.id,
            parentId: personalCategories.parentId,
            type: personalCategories.type,
          })
          .from(personalCategories)
          .where(and(eq(personalCategories.id, requestedParentId), eq(personalCategories.userId, user.id)))
          .get();

        if (!parent || parent.parentId !== null || parent.type !== existing.type) {
          throw new ApiError('VALIDATION', 422, 'Invalid parent category');
        }
      }

      if (body.sortOrder === undefined) {
        const maxRow = await db
          .select({
            maxOrder: sql<number | null>`max(${personalCategories.sortOrder})`,
          })
          .from(personalCategories)
          .where(
            and(
              eq(personalCategories.userId, user.id),
              eq(personalCategories.type, existing.type),
              requestedParentId === null
                ? isNull(personalCategories.parentId)
                : eq(personalCategories.parentId, requestedParentId),
            ),
          )
          .get();

        nextSortOrder = (maxRow?.maxOrder ?? -1) + 1;
      }
    }

    const now = nowIso();
    const buildUpdate = () =>
      db
        .update(personalCategories)
        .set({
          name: nextName,
          icon: nextIcon,
          hidden: nextHidden ? 1 : 0,
          parentId: nextParentId,
          sortOrder: nextSortOrder,
          updatedAt: now,
        })
        .where(and(eq(personalCategories.id, id), eq(personalCategories.userId, user.id)));

    if (parentChanged) {
      await commitPersonalWrite(db, user.id, () => [
        buildUpdate() as unknown as BatchItem<'sqlite'>,
      ]);
    } else {
      await buildUpdate();
    }

    const overrideRows = await db
      .select({
        walletId: personalCategoryVisibility.walletId,
        visible: personalCategoryVisibility.visible,
      })
      .from(personalCategoryVisibility)
      .where(
        and(
          eq(personalCategoryVisibility.userId, user.id),
          eq(personalCategoryVisibility.categoryId, existing.id),
        ),
      )
      .all();

    const category: CategoryView = {
      id: existing.id,
      parentId: nextParentId,
      type: existing.type as 'expense' | 'income',
      name: nextName,
      icon: nextIcon,
      hidden: nextHidden,
      sortOrder: nextSortOrder,
      starterKey: starterKeyOf(user.id, existing.id),
      walletOverrides: overrideRows.map((r) => ({
        walletId: r.walletId,
        visible: Boolean(r.visible),
      })),
    };

    return c.json({ category }, 200);
  });

  app.delete('/me/personal/categories/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({
        id: personalCategories.id,
        type: personalCategories.type,
      })
      .from(personalCategories)
      .where(and(eq(personalCategories.id, id), eq(personalCategories.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Category not found');
    }

    const childRows = await db
      .select({ id: personalCategories.id })
      .from(personalCategories)
      .where(and(eq(personalCategories.parentId, id), eq(personalCategories.userId, user.id)))
      .orderBy(asc(personalCategories.sortOrder), asc(personalCategories.createdAt))
      .all();
    const childCount = childRows.length;

    const countRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(personalTransactions)
      .where(and(eq(personalTransactions.categoryId, id), eq(personalTransactions.userId, user.id)))
      .get();
    const count = Number(countRow?.count ?? 0);

    const rawChildren = c.req.query('children');
    let childrenParam: string | undefined;
    if (rawChildren !== undefined && rawChildren !== '') {
      const trimmed = rawChildren.trim();
      if (!trimmed) {
        throw new ApiError('VALIDATION', 422, 'Invalid target parent category');
      }
      childrenParam = trimmed;
    }

    let nextChildParentId: string | null = null;
    if (childCount > 0) {
      if (!childrenParam) {
        throw new ApiError('IN_USE', 409, 'Category has sub-categories.', {
          reason: 'HAS_CHILDREN',
          childCount,
          count,
        });
      }
      if (childrenParam !== 'promote') {
        if (childrenParam === id) {
          throw new ApiError('VALIDATION', 422, 'Invalid target parent category');
        }
        const targetParent = await db
          .select({
            id: personalCategories.id,
            parentId: personalCategories.parentId,
            type: personalCategories.type,
          })
          .from(personalCategories)
          .where(and(eq(personalCategories.id, childrenParam), eq(personalCategories.userId, user.id)))
          .get();

        if (!targetParent) {
          throw new ApiError('NOT_FOUND', 404, 'Target parent category not found');
        }
        if (targetParent.parentId !== null || targetParent.type !== existing.type) {
          throw new ApiError('VALIDATION', 422, 'Invalid target parent category');
        }
        nextChildParentId = targetParent.id;
      }
    }

    const moveTo = c.req.query('moveTo');
    const hasMoveTo = moveTo !== undefined && moveTo !== '';
    if (hasMoveTo) {
      if (moveTo === id) {
        throw new ApiError('VALIDATION', 422, 'Cannot move entries to the same category.');
      }

      const target = await db
        .select({
          id: personalCategories.id,
          parentId: personalCategories.parentId,
          type: personalCategories.type,
        })
        .from(personalCategories)
        .where(and(eq(personalCategories.id, moveTo), eq(personalCategories.userId, user.id)))
        .get();

      if (!target) {
        throw new ApiError('NOT_FOUND', 404, 'Target category not found');
      }

      if (target.type !== existing.type || (childCount === 0 && target.parentId === id)) {
        throw new ApiError('VALIDATION', 422, 'Invalid target category');
      }
    } else if (count > 0) {
      throw new ApiError('IN_USE', 409, 'Category is in use.', { count });
    }

    if (childCount > 0 || hasMoveTo) {
      let baseOrder = -1;
      if (childCount > 0) {
        const destMaxRow = await db
          .select({ maxOrder: sql<number | null>`max(${personalCategories.sortOrder})` })
          .from(personalCategories)
          .where(
            and(
              eq(personalCategories.userId, user.id),
              eq(personalCategories.type, existing.type),
              nextChildParentId === null
                ? isNull(personalCategories.parentId)
                : eq(personalCategories.parentId, nextChildParentId),
            ),
          )
          .get();
        baseOrder = destMaxRow?.maxOrder ?? -1;
      }

      const now = nowIso();
      await commitPersonalWrite(db, user.id, (v) => {
        const stmts: BatchItem<'sqlite'>[] = [];
        for (const [idx, child] of childRows.entries()) {
          stmts.push(
            db
              .update(personalCategories)
              .set({
                parentId: nextChildParentId,
                sortOrder: baseOrder + 1 + idx,
                updatedAt: now,
              })
              .where(
                and(eq(personalCategories.id, child.id), eq(personalCategories.userId, user.id)),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
        if (hasMoveTo) {
          stmts.push(
            db
              .update(personalTransactions)
              .set({ categoryId: moveTo!, updatedAt: now, syncVersion: v })
              .where(
                and(
                  eq(personalTransactions.categoryId, id),
                  eq(personalTransactions.userId, user.id),
                ),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
        stmts.push(
          db
            .delete(personalCategories)
            .where(
              and(eq(personalCategories.id, id), eq(personalCategories.userId, user.id)),
            ) as unknown as BatchItem<'sqlite'>,
        );
        return stmts;
      });

      return c.json({ ok: true }, 200);
    }

    await db
      .delete(personalCategories)
      .where(and(eq(personalCategories.id, id), eq(personalCategories.userId, user.id)));

    return c.json({ ok: true }, 200);
  });

  app.get('/me/personal/tags', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const rows = await db
      .select({
        id: personalTags.id,
        name: personalTags.name,
        useCount: sql<number>`count(${personalTransactionTags.transactionId})`,
      })
      .from(personalTags)
      .leftJoin(personalTransactionTags, eq(personalTransactionTags.tagId, personalTags.id))
      .where(eq(personalTags.userId, user.id))
      .groupBy(personalTags.id)
      .orderBy(sql`count(${personalTransactionTags.transactionId}) desc`, asc(personalTags.name))
      .all();

    const tags: TagView[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      useCount: Number(r.useCount),
    }));

    return c.json({ tags }, 200);
  });

  app.patch('/me/personal/tags/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    if (typeof body.name !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    const name = body.name.trim();
    if (name.length < 1 || name.length > 30) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const existing = await db
      .select({
        id: personalTags.id,
        useCount: sql<number>`count(${personalTransactionTags.transactionId})`,
      })
      .from(personalTags)
      .leftJoin(personalTransactionTags, eq(personalTransactionTags.tagId, personalTags.id))
      .where(and(eq(personalTags.id, id), eq(personalTags.userId, user.id)))
      .groupBy(personalTags.id)
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Tag not found');
    }

    try {
      await db
        .update(personalTags)
        .set({ name })
        .where(and(eq(personalTags.id, id), eq(personalTags.userId, user.id)));
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('CONFLICT', 409, 'Tag already exists.');
      }
      throw err;
    }

    const tag: TagView = {
      id: existing.id,
      name,
      useCount: Number(existing.useCount),
    };

    return c.json({ tag }, 200);
  });

  app.delete('/me/personal/tags/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({ id: personalTags.id })
      .from(personalTags)
      .where(and(eq(personalTags.id, id), eq(personalTags.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Tag not found');
    }

    const now = nowIso();
    await commitPersonalWrite(db, user.id, (v) => [
      db
        .update(personalTransactions)
        .set({ syncVersion: v, updatedAt: now })
        .where(
          and(
            eq(personalTransactions.userId, user.id),
            sql`${personalTransactions.id} IN (SELECT transaction_id FROM personal_transaction_tags WHERE tag_id = ${id})`,
          ),
        ),
      db.delete(personalTransactionTags).where(eq(personalTransactionTags.tagId, id)),
      db.delete(personalTags).where(and(eq(personalTags.id, id), eq(personalTags.userId, user.id))),
    ]);

    return c.json({ ok: true }, 200);
  });

  return app;
}
