import { Hono } from "hono";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { AppBindings } from "@cc/api-db/env";
import { getDb } from "@cc/api-db/client";
import {
  personalAssets,
  personalCategories,
  personalTags,
  personalTransactions,
  personalTransactionTags,
  personalWallets,
  personalWalletSettings,
} from "@cc/api-db/schema";
import { getSessionUser } from "@cc/api-auth/session";
import { requirePersonal } from "@cc/api-auth/personal";
import { ApiError } from "@cc/api-util/errors";
import { nowIso } from "@cc/api-util/ids";
import {
  compareListRows,
  compareRecentRows,
  createGroupWalletResolver,
  filterGroupRows,
  groupRowEffect,
  groupRowsTotals,
  isBeforeStart,
  loanPaybacks,
  matchesNote,
  sumCounted,
  vndTotal,
  type CountedRow,
  type CurrencyCode,
  type EntryView,
  type GroupRow,
  type ListQuery,
  type ListResponse,
  type ListRow,
  type PersonalEntryType,
  type PersonalSummary,
} from "@cc/core";
import { loadGroupRows, loadGroupSettings } from "./groupShares";
import { loadCalc } from "./wallets";
import { loadPersonRows } from "./personRows";
import { requireDate } from "./validate";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_RANGE_DAYS = 366;

function monthBounds(month: string): { from: string; to: string } {
  if (!MONTH_RE.test(month)) {
    throw new ApiError("VALIDATION", 422, "Invalid month");
  }
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function parseListPeriod(query: {
  month: string | undefined;
  from: string | undefined;
  to: string | undefined;
}): { from: string; to: string } {
  if (query.month !== undefined) {
    if (query.from !== undefined || query.to !== undefined) {
      throw new ApiError("VALIDATION", 422, "Provide either month or from/to");
    }
    return monthBounds(query.month);
  }
  if (query.from === undefined || query.to === undefined) {
    throw new ApiError("VALIDATION", 422, "Provide month or from/to");
  }
  const from = requireDate(query.from);
  const to = requireDate(query.to);
  if (from > to) {
    throw new ApiError("VALIDATION", 422, "Invalid date range");
  }
  const diffDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000;
  if (diffDays > MAX_RANGE_DAYS) {
    throw new ApiError("VALIDATION", 422, "Date range exceeds 366 days");
  }
  return { from, to };
}

type ListTypeParam = NonNullable<ListQuery["type"]> | "group";

function parseListType(raw: string | undefined): ListTypeParam | undefined {
  if (raw === undefined) return undefined;
  if (
    raw === "expense" ||
    raw === "income" ||
    raw === "transfer" ||
    raw === "person" ||
    raw === "trade" ||
    raw === "group"
  ) {
    return raw;
  }
  throw new ApiError("VALIDATION", 422, "Invalid type");
}

function parseGroupsParam(raw: string | undefined): ListQuery["groups"] {
  if (raw === undefined) return undefined;
  if (raw === "show" || raw === "hide") return raw;
  throw new ApiError("VALIDATION", 422, "Invalid groups");
}

function toCountedRow(row: ListRow): CountedRow {
  if (row.kind === "person") {
    return { currency: row.currency, signedAmount: -row.share, counted: true };
  }
  const e = row.entry;
  const isTrade = e.type === "buy" || e.type === "sell";
  const isOut = e.type === "expense" || e.type === "transfer_out";
  return {
    currency: e.currency,
    signedAmount: isOut ? -e.amount : e.amount,
    counted: !e.excludeFromReports && !isTrade,
  };
}

export function listRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get("/me/personal/transactions", requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    // `recent=N`: "Giao dịch gần đây" wants the newest activity across all months, not one month by date.
    const recentRaw = c.req.query("recent");
    const recentParsed =
      recentRaw === undefined ? undefined : Number.parseInt(recentRaw, 10);
    if (
      recentParsed !== undefined &&
      (!Number.isSafeInteger(recentParsed) ||
        recentParsed < 1 ||
        recentParsed > 20)
    ) {
      throw new ApiError("VALIDATION", 422, "Invalid recent");
    }
    const recent = recentParsed;
    const { from, to } =
      recent !== undefined
        ? { from: "0000-01-01", to: "9999-12-31" }
        : parseListPeriod({
            month: c.req.query("month"),
            from: c.req.query("from"),
            to: c.req.query("to"),
          });
    const walletId = c.req.query("walletId") || undefined;
    const categoryId = c.req.query("categoryId") || undefined;
    const assetId = c.req.query("assetId") || undefined;
    const tagId = c.req.query("tagId") || undefined;
    const tripId = c.req.query("tripId") || undefined;
    const groups = parseGroupsParam(c.req.query("groups"));
    const showGroups = groups === "show";
    const type = parseListType(c.req.query("type"));
    const rawQ = c.req.query("q");
    const qTerm =
      rawQ !== undefined && rawQ.trim().length > 0 ? rawQ.trim() : undefined;

    const db = getDb(c.env);

    if (assetId) {
      const assetRow = await db
        .select({ id: personalAssets.id })
        .from(personalAssets)
        .where(
          and(
            eq(personalAssets.id, assetId),
            eq(personalAssets.userId, user.id),
          ),
        )
        .get();
      if (!assetRow) {
        throw new ApiError("NOT_FOUND", 404, "Asset not found");
      }
    }

    const walletRows = await db
      .select({
        id: personalWallets.id,
        currency: personalWallets.currency,
        startDate: personalWallets.startDate,
        isDefault: personalWallets.isDefault,
        kind: personalWalletSettings.kind,
        archivedAt: personalWalletSettings.archivedAt,
      })
      .from(personalWallets)
      .leftJoin(
        personalWalletSettings,
        eq(personalWalletSettings.walletId, personalWallets.id),
      )
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
    const defaultWalletId =
      walletRows.find((w) => w.isDefault === 1)?.id ?? null;

    const rows: ListRow[] = [];

    // Filtering by a group shows that group's rows only: personal entries belong to no group.
    if (type !== "person" && type !== "group" && !tripId) {
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
      if (type === "expense") {
        conditions.push(eq(personalTransactions.type, "expense"));
      } else if (type === "income") {
        conditions.push(eq(personalTransactions.type, "income"));
      } else if (type === "transfer") {
        conditions.push(
          inArray(personalTransactions.type, ["transfer_out", "transfer_in"]),
        );
      } else if (type === "trade") {
        conditions.push(inArray(personalTransactions.type, ["buy", "sell"]));
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
          counterpartWalletId: sql<
            string | null
          >`(SELECT pt2.wallet_id FROM personal_transactions pt2 WHERE pt2.transfer_id = personal_transactions.transfer_id AND pt2.id <> personal_transactions.id LIMIT 1)`,
          date: personalTransactions.date,
          time: personalTransactions.time,
          note: personalTransactions.note,
          excludeFromReports: personalTransactions.excludeFromReports,
          createdAt: personalTransactions.createdAt,
        })
        .from(personalTransactions)
        .where(and(...conditions))
        .orderBy(desc(personalTransactions.createdAt))
        .limit(recent ?? -1)
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
          .innerJoin(
            personalTags,
            eq(personalTags.id, personalTransactionTags.tagId),
          )
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
          source: "manual",
          beforeStart: isBeforeStart(
            { date: r.date },
            { startDate: wallet.startDate },
          ),
          createdAt: r.createdAt,
        };
        rows.push({ kind: "entry", entry });
      }
    }

    const includePersonRows =
      !showGroups &&
      !categoryId &&
      !assetId &&
      !tagId &&
      (type === undefined || type === "person") &&
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

    const filteredRows =
      qTerm !== undefined
        ? rows.filter((row) => {
            const text = row.kind === "entry" ? row.entry.note : row.note;
            return matchesNote(text, qTerm);
          })
        : rows;

    if (recent !== undefined) {
      filteredRows.sort(compareRecentRows);
      filteredRows.splice(recent);
    } else {
      filteredRows.sort(compareListRows);
    }

    if (!showGroups) {
      const totals = sumCounted(filteredRows.map(toCountedRow));
      return c.json<ListResponse>({ rows: filteredRows, totals }, 200);
    }

    const [allGroupRows, groupSettings] = await Promise.all([
      loadGroupRows(db, user.id, { from, to }),
      loadGroupSettings(db, user.id),
    ]);
    // A payback can repay a loan from an earlier month, so paybacks walk all history (only needed when loans count).
    const paybacks = groupSettings.countLoans
      ? loanPaybacks(await loadGroupRows(db, user.id))
      : new Map<string, number>();

    // Part 2 Task 1: every group row, direct-group expenses included (they no longer come as PersonRow).
    const groupCandidates = allGroupRows;

    const tagNameById = new Map<string, string>();
    if (qTerm !== undefined && groupCandidates.length > 0) {
      const neededTagIds = new Set<string>();
      for (const r of groupCandidates) {
        for (const tid of r.link?.tagIds ?? []) {
          neededTagIds.add(tid);
        }
      }
      if (neededTagIds.size > 0) {
        const linkTagRows = await db
          .select({ id: personalTags.id, name: personalTags.name })
          .from(personalTags)
          .where(
            and(
              eq(personalTags.userId, user.id),
              inArray(personalTags.id, [...neededTagIds]),
            ),
          )
          .all();
        for (const t of linkTagRows) {
          tagNameById.set(t.id, t.name);
        }
      }
    }

    const categoryParentById = new Map<string, string | null>();
    if (categoryId !== undefined) {
      const catRows = await db
        .select({
          id: personalCategories.id,
          parentId: personalCategories.parentId,
        })
        .from(personalCategories)
        .where(eq(personalCategories.userId, user.id))
        .all();
      for (const cat of catRows) {
        categoryParentById.set(cat.id, cat.parentId ?? null);
      }
    }

    const resolveWalletId = createGroupWalletResolver(
      walletRows.map((w) => ({
        id: w.id,
        currency: w.currency as CurrencyCode,
        startAmount: 0,
        startDate: w.startDate,
        startCostVnd: null,
        archived: w.archivedAt !== null && w.archivedAt !== undefined,
        kind: w.kind ?? "everyday",
        isDefault: w.isDefault === 1,
      })),
      defaultWalletId,
    );

    const groupRows = filterGroupRows(
      groupCandidates,
      {
        from,
        to,
        walletId,
        categoryId,
        assetId,
        tagId,
        type,
        tripId,
        groups,
        q: qTerm,
      },
      tagNameById,
      resolveWalletId,
      {
        settings: groupSettings,
        paybacks,
        fallbackGroupCategoryId: null,
        categoryParentOf:
          categoryId !== undefined
            ? (id) => categoryParentById.get(id) ?? null
            : undefined,
        period: { from, to },
      },
    );

    const countedRows: CountedRow[] = filteredRows.map(toCountedRow);

    const groupTotals = groupRowsTotals(groupRows, groupSettings, paybacks);
    if (groupTotals.spent > 0) {
      countedRows.push({
        currency: "VND",
        signedAmount: -groupTotals.spent,
        counted: true,
      });
    }
    if (groupTotals.income > 0) {
      countedRows.push({
        currency: "VND",
        signedAmount: groupTotals.income,
        counted: true,
      });
    }

    const totals = sumCounted(countedRows);

    if (recent !== undefined) {
      const newest = [...groupRows].sort(compareRecentRows).slice(0, recent);
      return c.json<ListResponse>(
        { rows: filteredRows, totals: [], groupRows: newest },
        200,
      );
    }
    return c.json<ListResponse>({ rows: filteredRows, totals, groupRows }, 200);
  });

  app.get("/me/personal/summary", requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const rawMonth = c.req.query("month");
    const month = rawMonth !== undefined ? rawMonth : nowIso().slice(0, 7);
    const { from, to } = monthBounds(month);

    const db = getDb(c.env);
    const { wallets, entries } = await loadCalc(db, user.id);
    const vnd = vndTotal(wallets, entries);

    const walletCurrency = new Map(wallets.map((w) => [w.id, w.currency]));
    const excludedWalletIds = new Set(wallets.filter((w) => w.excludeFromReports).map((w) => w.id));
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
      if (excludedWalletIds.has(e.walletId)) continue;
      const currency = walletCurrency.get(e.walletId);
      if (!currency) continue;
      const isTrade = e.type === "buy" || e.type === "sell";
      const isOut = e.type === "expense" || e.type === "transfer_out";
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
      ...(vnd.cashVnd !== undefined ? { cashVnd: vnd.cashVnd } : {}),
      approximate: vnd.approximate,
      perCurrency: vnd.perCurrency,
      unratedWalletIds: vnd.unratedWalletIds,
      month,
      spent: totals
        .filter((t) => t.spent > 0)
        .map((t) => ({ currency: t.currency, amount: t.spent })),
      income: totals
        .filter((t) => t.income > 0)
        .map((t) => ({ currency: t.currency, amount: t.income })),
    };

    return c.json<PersonalSummary>(summary, 200);
  });

  return app;
}
