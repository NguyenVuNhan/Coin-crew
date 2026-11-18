import { Hono } from 'hono';
import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  personalAssets,
  personalTags,
  personalTransactions,
  personalTransactionTags,
  personalWallets,
} from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';
import {
  isBeforeStart,
  sumCounted,
  vndTotal,
  type CountedRow,
  type CurrencyCode,
  type EntryView,
  type ListQuery,
  type ListResponse,
  type ListRow,
  type PersonalEntryType,
  type PersonalSummary,
} from '@cc/core';
import { loadCalc } from './wallets';
import { loadPersonRows } from './personRows';
import { requireDate } from './validate';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_RANGE_DAYS = 366;

function monthBounds(month: string): { from: string; to: string } {
  if (!MONTH_RE.test(month)) {
    throw new ApiError('VALIDATION', 422, 'Invalid month');
  }
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function parseListPeriod(query: {
  month: string | undefined;
  from: string | undefined;
  to: string | undefined;
}): { from: string; to: string } {
  if (query.month !== undefined) {
    if (query.from !== undefined || query.to !== undefined) {
      throw new ApiError('VALIDATION', 422, 'Provide either month or from/to');
    }
    return monthBounds(query.month);
  }
  if (query.from === undefined || query.to === undefined) {
    throw new ApiError('VALIDATION', 422, 'Provide month or from/to');
  }
  const from = requireDate(query.from);
  const to = requireDate(query.to);
  if (from > to) {
    throw new ApiError('VALIDATION', 422, 'Invalid date range');
  }
  const diffDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (diffDays > MAX_RANGE_DAYS) {
    throw new ApiError('VALIDATION', 422, 'Date range exceeds 366 days');
  }
  return { from, to };
}

function parseListType(raw: string | undefined): ListQuery['type'] {
  if (raw === undefined) return undefined;
  if (
    raw === 'expense' ||
    raw === 'income' ||
    raw === 'transfer' ||
    raw === 'person' ||
    raw === 'trade'
  ) {
    return raw;
  }
  throw new ApiError('VALIDATION', 422, 'Invalid type');
}

function rowSortFields(row: ListRow): { date: string; time: string | null; createdAt: string } {
  if (row.kind === 'entry') {
    return { date: row.entry.date, time: row.entry.time, createdAt: row.entry.createdAt };
  }
  return { date: row.date, time: null, createdAt: row.createdAt };
}

function compareListRows(a: ListRow, b: ListRow): number {
  const ka = rowSortFields(a);
  const kb = rowSortFields(b);
  if (ka.date !== kb.date) return ka.date > kb.date ? -1 : 1;
  if (ka.time !== kb.time) {
    if (ka.time === null) return 1;
    if (kb.time === null) return -1;
    return ka.time > kb.time ? -1 : 1;
  }
  if (ka.createdAt !== kb.createdAt) return ka.createdAt > kb.createdAt ? -1 : 1;
  return 0;
}

function toCountedRow(row: ListRow): CountedRow {
  if (row.kind === 'person') {
    return { currency: row.currency, signedAmount: -row.share, counted: true };
  }
  const e = row.entry;
  const isTrade = e.type === 'buy' || e.type === 'sell';
  const isOut = e.type === 'expense' || e.type === 'transfer_out';
  return {
    currency: e.currency,
    signedAmount: isOut ? -e.amount : e.amount,
    counted: !e.excludeFromReports && !isTrade,
  };
}

export function listRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/transactions', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const { from, to } = parseListPeriod({
      month: c.req.query('month'),
      from: c.req.query('from'),
      to: c.req.query('to'),
    });
    const walletId = c.req.query('walletId') || undefined;
    const categoryId = c.req.query('categoryId') || undefined;
    const assetId = c.req.query('assetId') || undefined;
    const tagId = c.req.query('tagId') || undefined;
    const type = parseListType(c.req.query('type'));
    const rawQ = c.req.query('q');
    const qTerm = rawQ !== undefined && rawQ.trim().length > 0 ? rawQ.trim() : undefined;

    const db = getDb(c.env);

    if (assetId) {
      const assetRow = await db
        .select({ id: personalAssets.id })
        .from(personalAssets)
        .where(and(eq(personalAssets.id, assetId), eq(personalAssets.userId, user.id)))
        .get();
      if (!assetRow) {
        throw new ApiError('NOT_FOUND', 404, 'Asset not found');
      }
    }

    const walletRows = await db
      .select({
        id: personalWallets.id,
        currency: personalWallets.currency,
        startDate: personalWallets.startDate,
        isDefault: personalWallets.isDefault,
      })
      .from(personalWallets)
      .where(eq(personalWallets.userId, user.id))
      .all();

    const walletMap = new Map(
      walletRows.map((w) => [
        w.id,
        {
          id: w.id,
          currency: w.currency as CurrencyCode,
          startDate: w.startDate,
          isDefault: w.isDefault === 1,
        },
      ]),
    );
    const defaultWalletId = walletRows.find((w) => w.isDefault === 1)?.id ?? null;

    const rows: ListRow[] = [];

    if (type !== 'person') {
      const conditions = [
        eq(personalTransactions.userId, user.id),
        gte(personalTransactions.date, from),
        lte(personalTransactions.date, to),
      ];

      if (walletId) {
        conditions.push(eq(personalTransactions.walletId, walletId));
      }
      if (categoryId) {
        conditions.push(
          or(
            eq(personalTransactions.categoryId, categoryId),
            sql`${personalTransactions.categoryId} IN (SELECT id FROM personal_categories WHERE parent_id = ${categoryId} AND user_id = ${user.id})`,
          )!,
        );
      }
      if (assetId) {
        conditions.push(eq(personalTransactions.assetId, assetId));
      }
      if (tagId) {
        conditions.push(
          sql`${personalTransactions.id} IN (SELECT transaction_id FROM personal_transaction_tags WHERE tag_id = ${tagId})`,
        );
      }
      if (type === 'expense') {
        conditions.push(eq(personalTransactions.type, 'expense'));
      } else if (type === 'income') {
        conditions.push(eq(personalTransactions.type, 'income'));
      } else if (type === 'transfer') {
        conditions.push(inArray(personalTransactions.type, ['transfer_out', 'transfer_in']));
      } else if (type === 'trade') {
        conditions.push(inArray(personalTransactions.type, ['buy', 'sell']));
      }

      const entryRows = await db
        .select({
          id: personalTransactions.id,
          walletId: personalTransactions.walletId,
          type: personalTransactions.type,
          amount: personalTransactions.amount,
          categoryId: personalTransactions.categoryId,
          assetId: personalTransactions.assetId,
          quantity: personalTransactions.quantity,
          transferId: personalTransactions.transferId,
          counterpartWalletId: sql<string | null>`(SELECT pt2.wallet_id FROM personal_transactions pt2 WHERE pt2.transfer_id = personal_transactions.transfer_id AND pt2.id <> personal_transactions.id LIMIT 1)`,
          date: personalTransactions.date,
          time: personalTransactions.time,
          note: personalTransactions.note,
          excludeFromReports: personalTransactions.excludeFromReports,
          createdAt: personalTransactions.createdAt,
        })
        .from(personalTransactions)
        .where(and(...conditions))
        .all();

      const tagsByTx = new Map<string, string[]>();
      if (entryRows.length > 0) {
        const entryIdSet = new Set(entryRows.map((e) => e.id));
        const tagRows = await db
          .select({
            transactionId: personalTransactionTags.transactionId,
            name: personalTags.name,
          })
          .from(personalTransactionTags)
          .innerJoin(
            personalTransactions,
            eq(personalTransactions.id, personalTransactionTags.transactionId),
          )
          .innerJoin(personalTags, eq(personalTags.id, personalTransactionTags.tagId))
          .where(and(...conditions))
          .orderBy(sql`${personalTransactionTags}.rowid asc`)
          .all();

        for (const tr of tagRows) {
          if (!entryIdSet.has(tr.transactionId)) continue;
          const list = tagsByTx.get(tr.transactionId) ?? [];
          list.push(tr.name);
          tagsByTx.set(tr.transactionId, list);
        }
      }

      for (const r of entryRows) {
        const wallet = walletMap.get(r.walletId);
        if (!wallet) continue;
        const entry: EntryView = {
          id: r.id,
          walletId: r.walletId,
          type: r.type as PersonalEntryType,
          amount: r.amount,
          currency: wallet.currency,
          categoryId: r.categoryId ?? null,
          assetId: r.assetId ?? null,
          quantity: r.quantity ?? null,
          transferId: r.transferId ?? null,
          counterpartWalletId: r.counterpartWalletId ?? null,
          date: r.date,
          time: r.time ?? null,
          note: r.note ?? null,
          tags: tagsByTx.get(r.id) ?? [],
          excludeFromReports: Boolean(r.excludeFromReports),
          source: 'manual',
          beforeStart: isBeforeStart({ date: r.date }, { startDate: wallet.startDate }),
          createdAt: r.createdAt,
        };
        rows.push({ kind: 'entry', entry });
      }
    }

    const includePersonRows =
      !categoryId &&
      !assetId &&
      !tagId &&
      (type === undefined || type === 'person') &&
      defaultWalletId !== null &&
      (!walletId || walletId === defaultWalletId);

    if (includePersonRows) {
      const personRows = await loadPersonRows(db, {
        userId: user.id,
        defaultWalletId,
        from,
        to,
      });
      rows.push(...personRows);
    }

    const needle = qTerm !== undefined ? qTerm.toLocaleLowerCase('vi') : null;
    const filteredRows =
      needle !== null
        ? rows.filter((row) => {
            const text = row.kind === 'entry' ? row.entry.note : row.note;
            return (text ?? '').toLocaleLowerCase('vi').includes(needle);
          })
        : rows;

    filteredRows.sort(compareListRows);
    const totals = sumCounted(filteredRows.map(toCountedRow));

    return c.json<ListResponse>({ rows: filteredRows, totals }, 200);
  });

  app.get('/me/personal/summary', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const rawMonth = c.req.query('month');
    const month = rawMonth !== undefined ? rawMonth : nowIso().slice(0, 7);
    const { from, to } = monthBounds(month);

    const db = getDb(c.env);
    const { wallets, entries } = await loadCalc(db, user.id);
    const vnd = vndTotal(wallets, entries);

    const walletCurrency = new Map(wallets.map((w) => [w.id, w.currency]));
    const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? null;

    const personRows = await loadPersonRows(db, {
      userId: user.id,
      defaultWalletId,
      from,
      to,
    });

    const counted: CountedRow[] = [];
    for (const e of entries) {
      if (e.date < from || e.date > to) continue;
      const currency = walletCurrency.get(e.walletId);
      if (!currency) continue;
      const isTrade = e.type === 'buy' || e.type === 'sell';
      const isOut = e.type === 'expense' || e.type === 'transfer_out';
      counted.push({
        currency,
        signedAmount: isOut ? -e.amount : e.amount,
        counted: !e.excludeFromReports && !isTrade,
      });
    }
    for (const p of personRows) {
      counted.push({
        currency: p.currency,
        signedAmount: -p.share,
        counted: true,
      });
    }

    const totals = sumCounted(counted);

    const summary: PersonalSummary = {
      totalVnd: vnd.totalVnd,
      approximate: vnd.approximate,
      perCurrency: vnd.perCurrency,
      unratedWalletIds: vnd.unratedWalletIds,
      month,
      spent: totals.filter((t) => t.spent > 0).map((t) => ({ currency: t.currency, amount: t.spent })),
      income: totals.filter((t) => t.income > 0).map((t) => ({ currency: t.currency, amount: t.income })),
    };

    return c.json<PersonalSummary>(summary, 200);
  });

  return app;
}
