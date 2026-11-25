import { Hono } from 'hono';
import { asc, eq, sql } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  personalCategories,
  personalTags,
  personalTransactions,
  personalTransactionTags,
  personalWalletOptions,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';
import {
  buildCategoryDrilldown,
  buildReport,
  type CalcEntry,
  type CategoryView,
  type CurrencyCode,
  type GroupRow,
  type GroupSettingsView,
  type PersonalEntryType,
  type ReportPeriodMode,
  type ReportQuery,
  type TagView,
  type WalletDetailView,
  type WalletKind,
} from '@cc/core';
import { loadGroupRows, loadGroupSettings } from './groupShares';
import { requireDate } from './validate';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR_RE = /^\d{4}$/;
const MAX_RANGE_DAYS = 366;

function starterKeyOf(userId: string, id: string): string | null {
  const prefix = `${userId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

export interface LoadedReportInput {
  wallets: WalletDetailView[];
  entries: Array<CalcEntry & { categoryId: string | null; tagIds: string[]; source?: string }>;
  categories: CategoryView[];
  tags: TagView[];
  groupRows: GroupRow[];
  groupSettings: GroupSettingsView;
}

export async function loadReportInput(db: Db, userId: string): Promise<LoadedReportInput> {
  const [walletRows, entryRows, tagRows, categoryRows, tagListRows, groupRows, groupSettings] =
    await Promise.all([
      db
        .select({
          id: personalWallets.id,
          userId: personalWallets.userId,
          name: personalWallets.name,
          currency: personalWallets.currency,
          startAmount: personalWallets.startAmount,
          startDate: personalWallets.startDate,
          isDefault: personalWallets.isDefault,
          createdAt: personalWallets.createdAt,
          updatedAt: personalWallets.updatedAt,
          kind: personalWalletSettings.kind,
          startCostVnd: personalWalletSettings.startCostVnd,
          icon: personalWalletSettings.icon,
          sortOrder: personalWalletSettings.sortOrder,
          archivedAt: personalWalletSettings.archivedAt,
          excludeFromReports: personalWalletOptions.excludeFromReports,
        })
        .from(personalWallets)
        .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
        .leftJoin(personalWalletOptions, eq(personalWalletOptions.walletId, personalWallets.id))
        .where(eq(personalWallets.userId, userId))
        .orderBy(sql`coalesce(${personalWalletSettings.sortOrder}, 0) asc`, asc(personalWallets.createdAt))
        .all(),

      db
        .select({
          id: personalTransactions.id,
          walletId: personalTransactions.walletId,
          type: personalTransactions.type,
          amount: personalTransactions.amount,
          categoryId: personalTransactions.categoryId,
          transferId: personalTransactions.transferId,
          assetId: personalTransactions.assetId,
          quantity: personalTransactions.quantity,
          date: personalTransactions.date,
          time: personalTransactions.time,
          excludeFromReports: personalTransactions.excludeFromReports,
          source: personalTransactions.source,
          createdAt: personalTransactions.createdAt,
        })
        .from(personalTransactions)
        .where(eq(personalTransactions.userId, userId))
        .all(),

      db
        .select({
          transactionId: personalTransactionTags.transactionId,
          tagId: personalTransactionTags.tagId,
        })
        .from(personalTransactionTags)
        .innerJoin(personalTransactions, eq(personalTransactions.id, personalTransactionTags.transactionId))
        .where(eq(personalTransactions.userId, userId))
        .all(),

      db
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
        .where(eq(personalCategories.userId, userId))
        .orderBy(asc(personalCategories.sortOrder), asc(personalCategories.createdAt))
        .all(),

      db
        .select({
          id: personalTags.id,
          name: personalTags.name,
        })
        .from(personalTags)
        .where(eq(personalTags.userId, userId))
        .orderBy(asc(personalTags.name))
        .all(),

      loadGroupRows(db, userId),
      loadGroupSettings(db, userId),
    ]);

  const tagIdsByTxId = new Map<string, string[]>();
  const tagUseCount = new Map<string, number>();
  for (const row of tagRows) {
    let list = tagIdsByTxId.get(row.transactionId);
    if (!list) {
      list = [];
      tagIdsByTxId.set(row.transactionId, list);
    }
    list.push(row.tagId);
    tagUseCount.set(row.tagId, (tagUseCount.get(row.tagId) ?? 0) + 1);
  }

  const wallets: WalletDetailView[] = walletRows.map((r) => ({
    id: r.id,
    name: r.name,
    currency: r.currency as CurrencyCode,
    balance: 0,
    isDefault: Boolean(r.isDefault),
    kind: (r.kind ?? 'everyday') as WalletKind,
    startAmount: r.startAmount,
    startDate: r.startDate,
    startCostVnd: r.startCostVnd ?? null,
    vndValue: null,
    icon: r.icon ?? null,
    sortOrder: r.sortOrder ?? 0,
    archived: r.archivedAt !== null && r.archivedAt !== undefined,
    entryCount: 0,
    excludeFromReports: Boolean(r.excludeFromReports),
  }));

  const entries = entryRows.map((e) => ({
    id: e.id,
    walletId: e.walletId,
    type: e.type as PersonalEntryType,
    amount: e.amount,
    date: e.date,
    time: e.time ?? null,
    createdAt: e.createdAt,
    transferId: e.transferId ?? null,
    excludeFromReports: Boolean(e.excludeFromReports),
    assetId: e.assetId ?? null,
    quantity: e.quantity ?? null,
    categoryId: e.categoryId ?? null,
    source: e.source,
    tagIds: tagIdsByTxId.get(e.id) ?? [],
  }));

  const categories: CategoryView[] = categoryRows.map((r) => ({
    id: r.id,
    parentId: r.parentId ?? null,
    type: r.type as 'expense' | 'income',
    name: r.name,
    icon: r.icon,
    hidden: Boolean(r.hidden),
    sortOrder: r.sortOrder,
    starterKey: starterKeyOf(userId, r.id),
    walletOverrides: [],
  }));

  const tags: TagView[] = tagListRows.map((r) => ({
    id: r.id,
    name: r.name,
    useCount: tagUseCount.get(r.id) ?? 0,
  }));

  return {
    wallets,
    entries,
    categories,
    tags,
    groupRows,
    groupSettings,
  };
}

interface ParsedReportParams {
  query: ReportQuery;
  today: string;
  walletId?: string;
}

function parseReportQueryParams(c: { req: { query: (name: string) => string | undefined } }): ParsedReportParams {
  const modeRaw = c.req.query('mode');
  let mode: ReportPeriodMode = 'month';
  if (modeRaw !== undefined) {
    if (modeRaw === 'month' || modeRaw === 'week' || modeRaw === 'year' || modeRaw === 'custom') {
      mode = modeRaw;
    } else {
      throw new ApiError('VALIDATION', 422, 'Invalid mode');
    }
  }

  const monthRaw = c.req.query('month');
  let month: string | undefined;
  if (monthRaw !== undefined) {
    if (!MONTH_RE.test(monthRaw)) {
      throw new ApiError('VALIDATION', 422, 'Invalid month');
    }
    month = monthRaw;
  }

  const weekRaw = c.req.query('week');
  let week: string | undefined;
  if (weekRaw !== undefined) {
    week = requireDate(weekRaw);
  }

  const yearRaw = c.req.query('year');
  let year: string | undefined;
  if (yearRaw !== undefined) {
    if (!YEAR_RE.test(yearRaw)) {
      throw new ApiError('VALIDATION', 422, 'Invalid year');
    }
    year = yearRaw;
  }

  const fromRaw = c.req.query('from');
  const toRaw = c.req.query('to');
  let from: string | undefined;
  let to: string | undefined;

  if (mode === 'custom') {
    if (fromRaw === undefined || toRaw === undefined) {
      throw new ApiError('VALIDATION', 422, 'Provide from and to');
    }
    from = requireDate(fromRaw);
    to = requireDate(toRaw);
    if (from > to) {
      throw new ApiError('VALIDATION', 422, 'Invalid date range');
    }
    const diffDays =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (diffDays + 1 > MAX_RANGE_DAYS) {
      throw new ApiError('VALIDATION', 422, 'Date range exceeds 366 days');
    }
  } else {
    if (fromRaw !== undefined) {
      from = requireDate(fromRaw);
    }
    if (toRaw !== undefined) {
      to = requireDate(toRaw);
    }
  }

  const groupsRaw = c.req.query('groups');
  let includeGroups = true;
  if (groupsRaw !== undefined) {
    if (groupsRaw === 'show') {
      includeGroups = true;
    } else if (groupsRaw === 'hide') {
      includeGroups = false;
    } else {
      throw new ApiError('VALIDATION', 422, 'Invalid groups');
    }
  }

  const todayRaw = c.req.query('today');
  const today = todayRaw !== undefined ? requireDate(todayRaw) : nowIso().slice(0, 10);

  const walletIdRaw = c.req.query('walletId');
  const walletId = walletIdRaw !== undefined && walletIdRaw.trim().length > 0 ? walletIdRaw.trim() : undefined;

  return {
    query: {
      mode,
      month,
      week,
      year,
      from,
      to,
      walletId,
      includeGroups,
    },
    today,
    walletId,
  };
}

export function reportRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/report', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const { query, today, walletId } = parseReportQueryParams(c);
    const db = getDb(c.env);
    const loaded = await loadReportInput(db, user.id);

    if (walletId && !loaded.wallets.some((w) => w.id === walletId)) {
      throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
    }

    const report = buildReport({ ...loaded, query, today });
    return c.json(report, 200);
  });

  app.get('/me/personal/report/category/:categoryId', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const categoryId = c.req.param('categoryId');
    if (!categoryId) {
      throw new ApiError('NOT_FOUND', 404, 'Category not found');
    }

    const { query, today, walletId } = parseReportQueryParams(c);
    const db = getDb(c.env);
    const loaded = await loadReportInput(db, user.id);

    if (walletId && !loaded.wallets.some((w) => w.id === walletId)) {
      throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
    }

    const report = buildReport({ ...loaded, query, today });
    const drilldown = buildCategoryDrilldown(report, { ...loaded, query, today, categoryId });
    if (!drilldown) {
      throw new ApiError('NOT_FOUND', 404, 'Category not found');
    }

    return c.json(drilldown, 200);
  });

  return app;
}
