import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  personalAssets,
  personalAssetVisibility,
  personalTransactions,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import {
  inheritedAssetOverrides,
  MAX_ASSET_DECIMALS,
  type AssetView,
  type AssetsResponse,
  type VisibilityWallet,
  type WalletKind,
  type WalletOverride,
} from '@cc/core';
import { name1to40, parseJson } from './validate';

function trimmedString(
  v: unknown,
  maxLen: number,
  message: string,
  minLen = 1,
): string {
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, message);
  }
  const trimmed = v.trim();
  if (trimmed.length < minLen || trimmed.length > maxLen) {
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

function parseOptionalIcon(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid icon');
  }
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    throw new ApiError('VALIDATION', 422, 'Invalid icon');
  }
  return trimmed;
}

function toAssetView(
  row: {
    id: string;
    name: string;
    unit: string;
    groupName: string;
    decimals: number;
    icon: string | null;
    hidden: number;
    sortOrder: number;
    entryCount: number | string;
  },
  walletOverrides: WalletOverride[] = [],
): AssetView {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    groupName: row.groupName,
    decimals: row.decimals,
    icon: row.icon ?? null,
    hidden: Boolean(row.hidden),
    sortOrder: row.sortOrder,
    entryCount: Number(row.entryCount),
    walletOverrides,
  };
}

function normalizeAssetNameKey(name: string): string {
  return name.trim().normalize('NFC').toLocaleLowerCase('vi');
}

function duplicateAssetNameError(): ApiError {
  return new ApiError('VALIDATION', 422, 'Asset name already exists.', {
    details: { field: 'name' },
  });
}

async function assertUniqueAssetName(
  db: ReturnType<typeof getDb>,
  userId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const target = normalizeAssetNameKey(name);
  const rows = await db
    .select({ id: personalAssets.id, name: personalAssets.name })
    .from(personalAssets)
    .where(eq(personalAssets.userId, userId))
    .all();

  const dup = rows.find(
    (r) => r.id !== excludeId && normalizeAssetNameKey(r.name) === target,
  );
  if (dup) {
    throw duplicateAssetNameError();
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
        icon: personalAssets.icon,
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

    const overrideRows = await db
      .select({
        assetId: personalAssetVisibility.assetId,
        walletId: personalAssetVisibility.walletId,
        visible: personalAssetVisibility.visible,
      })
      .from(personalAssetVisibility)
      .where(eq(personalAssetVisibility.userId, user.id))
      .all();

    const overridesByAsset = new Map<string, WalletOverride[]>();
    for (const r of overrideRows) {
      const ov: WalletOverride = { walletId: r.walletId, visible: Boolean(r.visible) };
      const list = overridesByAsset.get(r.assetId);
      if (list) list.push(ov);
      else overridesByAsset.set(r.assetId, [ov]);
    }

    const body: AssetsResponse = {
      assets: rows.map((r) => toAssetView(r, overridesByAsset.get(r.id) ?? [])),
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
    const unit = trimmedString(body.unit, 20, 'Invalid unit', 0);
    const groupName = trimmedString(body.groupName, 30, 'Invalid groupName');
    const decimals = requireDecimals(body.decimals);
    const icon = parseOptionalIcon(body.icon);

    const db = getDb(c.env);
    await assertUniqueAssetName(db, user.id, name);

    const existingAssetRows = await db
      .select({
        id: personalAssets.id,
        name: personalAssets.name,
        unit: personalAssets.unit,
        groupName: personalAssets.groupName,
        decimals: personalAssets.decimals,
        icon: personalAssets.icon,
        hidden: personalAssets.hidden,
        sortOrder: personalAssets.sortOrder,
      })
      .from(personalAssets)
      .where(eq(personalAssets.userId, user.id))
      .all();

    const existingOverrideRows = await db
      .select({
        assetId: personalAssetVisibility.assetId,
        walletId: personalAssetVisibility.walletId,
        visible: personalAssetVisibility.visible,
      })
      .from(personalAssetVisibility)
      .where(eq(personalAssetVisibility.userId, user.id))
      .all();

    const overridesByAsset = new Map<string, WalletOverride[]>();
    for (const r of existingOverrideRows) {
      const ov: WalletOverride = { walletId: r.walletId, visible: Boolean(r.visible) };
      const list = overridesByAsset.get(r.assetId);
      if (list) list.push(ov);
      else overridesByAsset.set(r.assetId, [ov]);
    }

    const existingAssets: AssetView[] = existingAssetRows.map((r) =>
      toAssetView({ ...r, entryCount: 0 }, overridesByAsset.get(r.id) ?? []),
    );

    const walletRows = await db
      .select({
        id: personalWallets.id,
        kind: personalWalletSettings.kind,
      })
      .from(personalWallets)
      .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
      .where(eq(personalWallets.userId, user.id))
      .all();

    const visibilityWallets: VisibilityWallet[] = walletRows.map((w) => ({
      id: w.id,
      kind: (w.kind ?? 'everyday') as WalletKind,
    }));

    const inheritedOverrides = inheritedAssetOverrides(groupName, existingAssets, visibilityWallets);

    const sortOrder =
      existingAssetRows.reduce((max, r) => (r.sortOrder > max ? r.sortOrder : max), -1) + 1;
    const id = newId();
    const now = nowIso();

    try {
      await commitPersonalWrite(db, user.id, () => [
        db.insert(personalAssets).values({
          id,
          userId: user.id,
          name,
          unit,
          groupName,
          decimals,
          icon,
          hidden: 0,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        }),
        ...(inheritedOverrides.length > 0
          ? [
              db.insert(personalAssetVisibility).values(
                inheritedOverrides.map((ov) => ({
                  userId: user.id,
                  walletId: ov.walletId,
                  assetId: id,
                  visible: ov.visible ? 1 : 0,
                })),
              ),
            ]
          : []),
      ]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw duplicateAssetNameError();
      }
      throw err;
    }

    const asset: AssetView = {
      id,
      name,
      unit,
      groupName,
      decimals,
      icon,
      hidden: false,
      sortOrder,
      entryCount: 0,
      walletOverrides: inheritedOverrides,
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
        icon: personalAssets.icon,
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
    if (body.name !== undefined && normalizeAssetNameKey(nextName) !== normalizeAssetNameKey(existing.name)) {
      await assertUniqueAssetName(db, user.id, nextName, id);
    }

    const nextUnit =
      body.unit !== undefined ? trimmedString(body.unit, 20, 'Invalid unit', 0) : existing.unit;
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

    const nextIcon = body.icon !== undefined ? parseOptionalIcon(body.icon) : (existing.icon ?? null);

    const now = nowIso();
    try {
      await db
        .update(personalAssets)
        .set({
          name: nextName,
          unit: nextUnit,
          groupName: nextGroupName,
          decimals: nextDecimals,
          icon: nextIcon,
          hidden: nextHidden ? 1 : 0,
          updatedAt: now,
        })
        .where(and(eq(personalAssets.id, id), eq(personalAssets.userId, user.id)));
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw duplicateAssetNameError();
      }
      throw err;
    }

    const overrideRows = await db
      .select({
        walletId: personalAssetVisibility.walletId,
        visible: personalAssetVisibility.visible,
      })
      .from(personalAssetVisibility)
      .where(
        and(
          eq(personalAssetVisibility.userId, user.id),
          eq(personalAssetVisibility.assetId, existing.id),
        ),
      )
      .all();

    const asset: AssetView = {
      id: existing.id,
      name: nextName,
      unit: nextUnit,
      groupName: nextGroupName,
      decimals: nextDecimals,
      icon: nextIcon,
      hidden: nextHidden,
      sortOrder: existing.sortOrder,
      entryCount,
      walletOverrides: overrideRows.map((r) => ({
        walletId: r.walletId,
        visible: Boolean(r.visible),
      })),
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
      await commitPersonalWrite(db, user.id, (v) => [
        db
          .update(personalTransactions)
          .set({ assetId: moveTo, updatedAt: now, syncVersion: v })
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
