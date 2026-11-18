import { Hono } from 'hono';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { personalAssets, personalTransactions } from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import { MAX_ASSET_DECIMALS, type AssetView, type AssetsResponse } from '@cc/core';
import { name1to40, parseJson } from './validate';

function trimmedString(v: unknown, maxLen: number, message: string): string {
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, message);
  }
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > maxLen) {
    throw new ApiError('VALIDATION', 422, message);
  }
  return trimmed;
}

function requireDecimals(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_ASSET_DECIMALS) {
    throw new ApiError('VALIDATION', 422, 'Invalid decimals');
  }
  return v;
}

function toAssetView(row: {
  id: string;
  name: string;
  unit: string;
  groupName: string;
  decimals: number;
  hidden: number;
  sortOrder: number;
  entryCount: number | string;
}): AssetView {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    groupName: row.groupName,
    decimals: row.decimals,
    hidden: Boolean(row.hidden),
    sortOrder: row.sortOrder,
    entryCount: Number(row.entryCount),
  };
}

async function assertUniqueAssetName(
  db: ReturnType<typeof getDb>,
  userId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const cond = excludeId
    ? and(
        eq(personalAssets.userId, userId),
        sql`lower(${personalAssets.name}) = ${name.toLowerCase()}`,
        ne(personalAssets.id, excludeId),
      )
    : and(eq(personalAssets.userId, userId), sql`lower(${personalAssets.name}) = ${name.toLowerCase()}`);

  const dup = await db.select({ id: personalAssets.id }).from(personalAssets).where(cond).get();
  if (dup) {
    throw new ApiError('VALIDATION', 422, 'Asset name already exists.', {
      details: { field: 'name' },
    });
  }
}

export function assetRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/assets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const rows = await db
      .select({
        id: personalAssets.id,
        name: personalAssets.name,
        unit: personalAssets.unit,
        groupName: personalAssets.groupName,
        decimals: personalAssets.decimals,
        hidden: personalAssets.hidden,
        sortOrder: personalAssets.sortOrder,
        entryCount: sql<number>`count(${personalTransactions.id})`,
      })
      .from(personalAssets)
      .leftJoin(
        personalTransactions,
        and(eq(personalTransactions.assetId, personalAssets.id), eq(personalTransactions.userId, user.id)),
      )
      .where(eq(personalAssets.userId, user.id))
      .groupBy(personalAssets.id)
      .orderBy(asc(personalAssets.sortOrder), asc(personalAssets.createdAt))
      .all();

    const body: AssetsResponse = {
      assets: rows.map(toAssetView),
    };
    return c.json(body, 200);
  });

  app.post('/me/personal/assets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const name = name1to40(body.name);
    const unit = trimmedString(body.unit, 20, 'Invalid unit');
    const groupName = trimmedString(body.groupName, 30, 'Invalid groupName');
    const decimals = requireDecimals(body.decimals);

    const db = getDb(c.env);
    await assertUniqueAssetName(db, user.id, name);

    const maxRow = await db
      .select({
        maxOrder: sql<number | null>`max(${personalAssets.sortOrder})`,
      })
      .from(personalAssets)
      .where(eq(personalAssets.userId, user.id))
      .get();

    const sortOrder = (maxRow?.maxOrder ?? -1) + 1;
    const id = newId();
    const now = nowIso();

    await db.insert(personalAssets).values({
      id,
      userId: user.id,
      name,
      unit,
      groupName,
      decimals,
      hidden: 0,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });

    const asset: AssetView = {
      id,
      name,
      unit,
      groupName,
      decimals,
      hidden: false,
      sortOrder,
      entryCount: 0,
    };

    return c.json({ asset }, 201);
  });

  app.patch('/me/personal/assets/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const existing = await db
      .select({
        id: personalAssets.id,
        name: personalAssets.name,
        unit: personalAssets.unit,
        groupName: personalAssets.groupName,
        decimals: personalAssets.decimals,
        hidden: personalAssets.hidden,
        sortOrder: personalAssets.sortOrder,
        entryCount: sql<number>`count(${personalTransactions.id})`,
      })
      .from(personalAssets)
      .leftJoin(
        personalTransactions,
        and(eq(personalTransactions.assetId, personalAssets.id), eq(personalTransactions.userId, user.id)),
      )
      .where(and(eq(personalAssets.id, id), eq(personalAssets.userId, user.id)))
      .groupBy(personalAssets.id)
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Asset not found');
    }

    const entryCount = Number(existing.entryCount);
    const nextName = body.name !== undefined ? name1to40(body.name) : existing.name;
    if (body.name !== undefined && nextName.toLowerCase() !== existing.name.toLowerCase()) {
      await assertUniqueAssetName(db, user.id, nextName, id);
    }

    const nextUnit =
      body.unit !== undefined ? trimmedString(body.unit, 20, 'Invalid unit') : existing.unit;
    const nextGroupName =
      body.groupName !== undefined
        ? trimmedString(body.groupName, 30, 'Invalid groupName')
        : existing.groupName;

    let nextDecimals = existing.decimals;
    if (body.decimals !== undefined) {
      nextDecimals = requireDecimals(body.decimals);
      if (nextDecimals !== existing.decimals && entryCount > 0) {
        throw new ApiError('IN_USE', 409, 'Asset is in use.');
      }
    }

    let nextHidden = Boolean(existing.hidden);
    if (body.hidden !== undefined) {
      if (typeof body.hidden !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid hidden');
      }
      nextHidden = body.hidden;
    }

    const now = nowIso();
    await db
      .update(personalAssets)
      .set({
        name: nextName,
        unit: nextUnit,
        groupName: nextGroupName,
        decimals: nextDecimals,
        hidden: nextHidden ? 1 : 0,
        updatedAt: now,
      })
      .where(and(eq(personalAssets.id, id), eq(personalAssets.userId, user.id)));

    const asset: AssetView = {
      id: existing.id,
      name: nextName,
      unit: nextUnit,
      groupName: nextGroupName,
      decimals: nextDecimals,
      hidden: nextHidden,
      sortOrder: existing.sortOrder,
      entryCount,
    };

    return c.json({ asset }, 200);
  });

  app.delete('/me/personal/assets/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({
        id: personalAssets.id,
        decimals: personalAssets.decimals,
      })
      .from(personalAssets)
      .where(and(eq(personalAssets.id, id), eq(personalAssets.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Asset not found');
    }

    const countRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(personalTransactions)
      .where(and(eq(personalTransactions.assetId, id), eq(personalTransactions.userId, user.id)))
      .get();
    const count = Number(countRow?.count ?? 0);

    const moveTo = c.req.query('moveTo');
    if (moveTo !== undefined && moveTo !== '') {
      if (moveTo === id) {
        throw new ApiError('VALIDATION', 422, 'Cannot move entries to the same asset.');
      }

      const target = await db
        .select({
          id: personalAssets.id,
          decimals: personalAssets.decimals,
        })
        .from(personalAssets)
        .where(and(eq(personalAssets.id, moveTo), eq(personalAssets.userId, user.id)))
        .get();

      if (!target) {
        throw new ApiError('NOT_FOUND', 404, 'Target asset not found');
      }

      if (target.decimals !== existing.decimals) {
        throw new ApiError('VALIDATION', 422, 'Target asset must have the same decimals.');
      }

      const now = nowIso();
      await db.batch([
        db
          .update(personalTransactions)
          .set({ assetId: moveTo, updatedAt: now })
          .where(and(eq(personalTransactions.assetId, id), eq(personalTransactions.userId, user.id))),
        db
          .delete(personalAssets)
          .where(and(eq(personalAssets.id, id), eq(personalAssets.userId, user.id))),
      ]);

      return c.json({ ok: true }, 200);
    }

    if (count > 0) {
      throw new ApiError('IN_USE', 409, 'Asset is in use.', { count });
    }

    await db
      .delete(personalAssets)
      .where(and(eq(personalAssets.id, id), eq(personalAssets.userId, user.id)));

    return c.json({ ok: true }, 200);
  });

  return app;
}
