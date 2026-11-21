import { Hono, type Context } from 'hono';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  personalAssets,
  personalAssetVisibility,
  personalCategories,
  personalCategoryVisibility,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';

interface VisibilityChange {
  id: string;
  visible: boolean;
}

async function parseBodyObject(c: Context): Promise<Record<string, unknown>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError('VALIDATION', 400, 'Invalid JSON body');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('VALIDATION', 400, 'Invalid request body');
  }
  return raw as Record<string, unknown>;
}

function parseVisibilityChanges(v: unknown, field: string): VisibilityChange[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new ApiError('VALIDATION', 400, `Invalid ${field}`);
  }
  const out: VisibilityChange[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ApiError('VALIDATION', 400, `Invalid ${field} entry`);
    }
    const { id, visible } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id.trim().length === 0 || typeof visible !== 'boolean') {
      throw new ApiError('VALIDATION', 400, `Invalid ${field} entry`);
    }
    out.push({ id, visible });
  }
  return out;
}

function parseWalletIds(v: unknown): string[] {
  if (!Array.isArray(v)) {
    throw new ApiError('VALIDATION', 400, 'Invalid walletIds');
  }
  for (const item of v) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new ApiError('VALIDATION', 400, 'Invalid walletIds');
    }
  }
  return v as string[];
}

async function loadActiveWalletIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: personalWallets.id })
    .from(personalWallets)
    .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
    .where(and(eq(personalWallets.userId, userId), isNull(personalWalletSettings.archivedAt)))
    .all();
  return rows.map((r) => r.id);
}

export function visibilityRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.put('/me/personal/wallets/:id/visibility', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const walletId = c.req.param('id');
    const body = await parseBodyObject(c);

    const categoryChanges = parseVisibilityChanges(body.categories, 'categories');
    const assetChanges = parseVisibilityChanges(body.assets, 'assets');

    const catMap = new Map<string, boolean>();
    for (const entry of categoryChanges) {
      catMap.set(entry.id, entry.visible);
    }
    const assetMap = new Map<string, boolean>();
    for (const entry of assetChanges) {
      assetMap.set(entry.id, entry.visible);
    }

    const db = getDb(c.env);

    const wallet = await db
      .select({ id: personalWallets.id })
      .from(personalWallets)
      .where(and(eq(personalWallets.id, walletId), eq(personalWallets.userId, user.id)))
      .get();

    if (!wallet) {
      throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
    }

    const catIds = [...catMap.keys()];
    if (catIds.length > 0) {
      const ownedCats = await db
        .select({ id: personalCategories.id })
        .from(personalCategories)
        .where(and(eq(personalCategories.userId, user.id), inArray(personalCategories.id, catIds)))
        .all();
      if (ownedCats.length !== catIds.length) {
        throw new ApiError('NOT_FOUND', 404, 'Category not found');
      }
    }

    const assetIds = [...assetMap.keys()];
    if (assetIds.length > 0) {
      const ownedAssets = await db
        .select({ id: personalAssets.id })
        .from(personalAssets)
        .where(and(eq(personalAssets.userId, user.id), inArray(personalAssets.id, assetIds)))
        .all();
      if (ownedAssets.length !== assetIds.length) {
        throw new ApiError('NOT_FOUND', 404, 'Asset not found');
      }
    }

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [];
      for (const [categoryId, visible] of catMap) {
        const visibleInt = visible ? 1 : 0;
        stmts.push(
          db
            .insert(personalCategoryVisibility)
            .values({
              userId: user.id,
              walletId,
              categoryId,
              visible: visibleInt,
            })
            .onConflictDoUpdate({
              target: [personalCategoryVisibility.walletId, personalCategoryVisibility.categoryId],
              set: { visible: visibleInt },
            }) as unknown as BatchItem<'sqlite'>,
        );
      }
      for (const [assetId, visible] of assetMap) {
        const visibleInt = visible ? 1 : 0;
        stmts.push(
          db
            .insert(personalAssetVisibility)
            .values({
              userId: user.id,
              walletId,
              assetId,
              visible: visibleInt,
            })
            .onConflictDoUpdate({
              target: [personalAssetVisibility.walletId, personalAssetVisibility.assetId],
              set: { visible: visibleInt },
            }) as unknown as BatchItem<'sqlite'>,
        );
      }
      return stmts;
    });

    return c.json({ ok: true }, 200);
  });

  app.put('/me/personal/categories/:id/wallets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const categoryId = c.req.param('id');
    const body = await parseBodyObject(c);
    const walletIds = parseWalletIds(body.walletIds);
    const wantedSet = new Set(walletIds);

    const db = getDb(c.env);

    const category = await db
      .select({ id: personalCategories.id })
      .from(personalCategories)
      .where(and(eq(personalCategories.id, categoryId), eq(personalCategories.userId, user.id)))
      .get();

    if (!category) {
      throw new ApiError('NOT_FOUND', 404, 'Category not found');
    }

    const activeWalletIds = await loadActiveWalletIds(db, user.id);
    const activeSet = new Set(activeWalletIds);
    for (const wid of wantedSet) {
      if (!activeSet.has(wid)) {
        throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
      }
    }

    const children = await db
      .select({ id: personalCategories.id })
      .from(personalCategories)
      .where(and(eq(personalCategories.parentId, categoryId), eq(personalCategories.userId, user.id)))
      .all();

    const targetCategoryIds = [categoryId, ...children.map((ch) => ch.id)];

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [];
      for (const wid of activeWalletIds) {
        const visibleInt = wantedSet.has(wid) ? 1 : 0;
        for (const cid of targetCategoryIds) {
          stmts.push(
            db
              .insert(personalCategoryVisibility)
              .values({
                userId: user.id,
                walletId: wid,
                categoryId: cid,
                visible: visibleInt,
              })
              .onConflictDoUpdate({
                target: [personalCategoryVisibility.walletId, personalCategoryVisibility.categoryId],
                set: { visible: visibleInt },
              }) as unknown as BatchItem<'sqlite'>,
          );
        }
      }
      return stmts;
    });

    return c.json({ ok: true }, 200);
  });

  app.put('/me/personal/assets/:id/wallets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const assetId = c.req.param('id');
    const body = await parseBodyObject(c);
    const walletIds = parseWalletIds(body.walletIds);
    const wantedSet = new Set(walletIds);

    const db = getDb(c.env);

    const asset = await db
      .select({ id: personalAssets.id })
      .from(personalAssets)
      .where(and(eq(personalAssets.id, assetId), eq(personalAssets.userId, user.id)))
      .get();

    if (!asset) {
      throw new ApiError('NOT_FOUND', 404, 'Asset not found');
    }

    const activeWalletIds = await loadActiveWalletIds(db, user.id);
    const activeSet = new Set(activeWalletIds);
    for (const wid of wantedSet) {
      if (!activeSet.has(wid)) {
        throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
      }
    }

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [];
      for (const wid of activeWalletIds) {
        const visibleInt = wantedSet.has(wid) ? 1 : 0;
        stmts.push(
          db
            .insert(personalAssetVisibility)
            .values({
              userId: user.id,
              walletId: wid,
              assetId,
              visible: visibleInt,
            })
            .onConflictDoUpdate({
              target: [personalAssetVisibility.walletId, personalAssetVisibility.assetId],
              set: { visible: visibleInt },
            }) as unknown as BatchItem<'sqlite'>,
        );
      }
      return stmts;
    });

    return c.json({ ok: true }, 200);
  });

  return app;
}
