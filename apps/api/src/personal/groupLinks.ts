import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  participants,
  personalCategories,
  personalGroupLinkTags,
  personalGroupLinks,
  personalGroupSettings,
  personalTags,
  personalWallets,
  transactions,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';
import type { GroupLinkView, GroupSettingsView } from '@cc/core';
import { loadGroupSettings } from './groupShares';
import { parseJson } from './validate';

/** Categories for group rows and loans, added to every user's own list on first use (spec section 5). */
const GROUP_STARTERS = [
  { key: 'group', type: 'expense', name: 'Nhóm', icon: 'users', sortOrder: 8 }, // REVIEW
  { key: 'lend', type: 'expense', name: 'Cho vay', icon: 'arrow-up-right', sortOrder: 9 }, // REVIEW
  { key: 'borrow', type: 'income', name: 'Đi vay', icon: 'arrow-down-left', sortOrder: 4 }, // REVIEW
] as const;

async function ensureGroupStarterCategories(db: Db, userId: string): Promise<void> {
  const starters = GROUP_STARTERS;
  const existing = await db
    .select({
      name: personalCategories.name,
      type: personalCategories.type,
    })
    .from(personalCategories)
    .where(eq(personalCategories.userId, userId))
    .all();

  const missing = starters.filter(
    (s) => !existing.some((c) => c.name === s.name && c.type === s.type),
  );
  if (missing.length === 0) return;

  const now = nowIso();
  const stmts = missing.map(
    (s) =>
      db
        .insert(personalCategories)
        .values({
          id: `${userId}:${s.key}`,
          userId,
          parentId: null,
          type: s.type,
          name: s.name,
          icon: s.icon,
          hidden: 0,
          sortOrder: s.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
  );
  await db.batch([stmts[0]!, ...stmts.slice(1)]);
}

function parseOptionalId(v: unknown, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new ApiError('VALIDATION', 422, `Invalid ${field}`);
  }
  return v;
}

function parseIntent(v: unknown): 'shared' | 'loan' | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === 'shared' || v === 'loan') return v;
  throw new ApiError('VALIDATION', 422, 'Invalid intent');
}

function parseTagIds(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid tagIds');
  }
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid tagIds');
    }
    seen.add(item);
  }
  return Array.from(seen).sort();
}

export function groupLinkRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.put('/me/personal/group-links/:rootId', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const rootId = c.req.param('rootId');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const walletIdInput = parseOptionalId(body.walletId, 'walletId');
    const categoryIdInput = parseOptionalId(body.categoryId, 'categoryId');
    const tagIdsInput = parseTagIds(body.tagIds);
    const intentInput = parseIntent(body.intent);

    let excludeInput: boolean | undefined;
    if (body.excludeFromReports !== undefined) {
      if (typeof body.excludeFromReports !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid excludeFromReports');
      }
      excludeInput = body.excludeFromReports;
    }

    const db = getDb(c.env);

    const ownedTx = await db
      .select({ tripId: transactions.tripId })
      .from(transactions)
      .innerJoin(participants, eq(participants.tripId, transactions.tripId))
      .where(
        and(
          eq(transactions.rootId, rootId),
          eq(participants.userId, user.id),
          eq(participants.status, 'active'),
        ),
      )
      .limit(1)
      .get();

    if (!ownedTx) {
      throw new ApiError('NOT_FOUND', 404, 'Group transaction not found');
    }

    if (typeof walletIdInput === 'string') {
      const wallet = await db
        .select({
          id: personalWallets.id,
          currency: personalWallets.currency,
        })
        .from(personalWallets)
        .where(and(eq(personalWallets.id, walletIdInput), eq(personalWallets.userId, user.id)))
        .get();

      if (!wallet) {
        throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
      }
      if (wallet.currency !== 'VND') {
        throw new ApiError('VALIDATION', 422, 'Wallet must be VND');
      }
    }

    if (typeof categoryIdInput === 'string') {
      const cat = await db
        .select({ id: personalCategories.id })
        .from(personalCategories)
        .where(and(eq(personalCategories.id, categoryIdInput), eq(personalCategories.userId, user.id)))
        .get();

      if (!cat) {
        throw new ApiError('NOT_FOUND', 404, 'Category not found');
      }
    }

    if (tagIdsInput && tagIdsInput.length > 0) {
      const foundTags = await db
        .select({ id: personalTags.id })
        .from(personalTags)
        .where(and(eq(personalTags.userId, user.id), inArray(personalTags.id, tagIdsInput)))
        .all();

      if (foundTags.length !== tagIdsInput.length) {
        throw new ApiError('NOT_FOUND', 404, 'Tag not found');
      }
    }

    const existing = await db
      .select({
        walletId: personalGroupLinks.walletId,
        categoryId: personalGroupLinks.categoryId,
        intent: personalGroupLinks.intent,
        excludeFromReports: personalGroupLinks.excludeFromReports,
      })
      .from(personalGroupLinks)
      .where(and(eq(personalGroupLinks.userId, user.id), eq(personalGroupLinks.rootId, rootId)))
      .get();

    const nextWalletId = walletIdInput !== undefined ? walletIdInput : (existing?.walletId ?? null);
    const nextCategoryId =
      categoryIdInput !== undefined ? categoryIdInput : (existing?.categoryId ?? null);
    const existingIntent =
      existing?.intent === 'shared' || existing?.intent === 'loan' ? existing.intent : null;
    const nextIntent = intentInput !== undefined ? intentInput : existingIntent;
    const nextExclude =
      excludeInput !== undefined ? excludeInput : existing?.excludeFromReports === 1;

    let nextTagIds: string[];
    if (tagIdsInput !== undefined) {
      nextTagIds = tagIdsInput;
    } else {
      const existingTags = await db
        .select({ tagId: personalGroupLinkTags.tagId })
        .from(personalGroupLinkTags)
        .where(
          and(
            eq(personalGroupLinkTags.userId, user.id),
            eq(personalGroupLinkTags.rootId, rootId),
          ),
        )
        .all();
      nextTagIds = existingTags.map((t) => t.tagId).sort();
    }

    const now = nowIso();
    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [
        db
          .insert(personalGroupLinks)
          .values({
            userId: user.id,
            rootId,
            tripId: ownedTx.tripId,
            walletId: nextWalletId,
            categoryId: nextCategoryId,
            intent: nextIntent,
            excludeFromReports: nextExclude ? 1 : 0,
            createdAt: now,
            updatedAt: now,
            syncVersion: v as unknown as number,
          })
          .onConflictDoUpdate({
            target: [personalGroupLinks.userId, personalGroupLinks.rootId],
            set: {
              tripId: ownedTx.tripId,
              walletId: nextWalletId,
              categoryId: nextCategoryId,
              intent: nextIntent,
              excludeFromReports: nextExclude ? 1 : 0,
              updatedAt: now,
              syncVersion: v as unknown as number,
            },
          }) as unknown as BatchItem<'sqlite'>,
      ];

      if (tagIdsInput !== undefined) {
        stmts.push(
          db
            .delete(personalGroupLinkTags)
            .where(
              and(
                eq(personalGroupLinkTags.userId, user.id),
                eq(personalGroupLinkTags.rootId, rootId),
              ),
            ) as unknown as BatchItem<'sqlite'>,
        );
        for (const tagId of tagIdsInput) {
          stmts.push(
            db
              .insert(personalGroupLinkTags)
              .values({ userId: user.id, rootId, tagId }) as unknown as BatchItem<'sqlite'>,
          );
        }
      }

      return stmts;
    });

    const link: GroupLinkView = {
      walletId: nextWalletId,
      categoryId: nextCategoryId,
      tagIds: nextTagIds,
      intent: nextIntent,
      excludeFromReports: nextExclude,
    };

    return c.json({ link }, 200);
  });

  app.get('/me/personal/group-settings', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    await ensureGroupStarterCategories(db, user.id);
    const settings = await loadGroupSettings(db, user.id);

    return c.json({ settings }, 200);
  });

  app.put('/me/personal/group-settings', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const defaultCategoryInput = parseOptionalId(
      body.defaultGroupCategoryId,
      'defaultGroupCategoryId',
    );

    let countLoansInput: boolean | undefined;
    if (body.countLoans !== undefined) {
      if (typeof body.countLoans !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid countLoans');
      }
      countLoansInput = body.countLoans;
    }

    const db = getDb(c.env);

    if (typeof defaultCategoryInput === 'string') {
      const cat = await db
        .select({ id: personalCategories.id })
        .from(personalCategories)
        .where(
          and(
            eq(personalCategories.id, defaultCategoryInput),
            eq(personalCategories.userId, user.id),
          ),
        )
        .get();

      if (!cat) {
        throw new ApiError('NOT_FOUND', 404, 'Category not found');
      }
    }

    const current = await loadGroupSettings(db, user.id);
    const nextDefaultCategoryId =
      defaultCategoryInput !== undefined ? defaultCategoryInput : current.defaultGroupCategoryId;
    const nextCountLoans =
      countLoansInput !== undefined ? countLoansInput : current.countLoans;

    const now = nowIso();
    await commitPersonalWrite(db, user.id, () => [
      db
        .insert(personalGroupSettings)
        .values({
          userId: user.id,
          defaultGroupCategoryId: nextDefaultCategoryId,
          countLoans: nextCountLoans ? 1 : 0,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: personalGroupSettings.userId,
          set: {
            defaultGroupCategoryId: nextDefaultCategoryId,
            countLoans: nextCountLoans ? 1 : 0,
            updatedAt: now,
          },
        }) as unknown as BatchItem<'sqlite'>,
    ]);

    const settings: GroupSettingsView = {
      defaultGroupCategoryId: nextDefaultCategoryId,
      countLoans: nextCountLoans,
    };

    return c.json({ settings }, 200);
  });

  return app;
}
