import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import type {
  ExpenseHistoryItem,
  ExpenseStatus,
  ExpenseView,
  IncomeHistoryItem,
  IncomeStatus,
  IncomeView,
  LedgerExpense,
  LedgerPayment,
  PaymentStatus,
  PaymentView,
  PersonView,
  RatingsView,
  SplitMode,
  Transfer,
  TripListItem,
  TripLocationView,
  TripView,
} from '@cc/core';
import {
  computeBalances,
  fundSummary,
  isFundPaid,
  isPlanningExpense,
  isThemeId,
  maxStarsForGroup,
  pairwiseTransfers,
  suggestTransfers,
} from '@cc/core';
import type { Db } from '@cc/api-db/client';
import type { TripRow } from '@cc/api-auth/actor';
import {
  bankDetails,
  participants,
  playerRatings,
  transactionShares,
  transactions,
  tripLocations,
  trips,
  tripViews,
  users,
} from '@cc/api-db/schema';
import { nowIso } from '@cc/api-util/ids';

export type TripSnapshot = Omit<TripView, 'me' | 'myBalance' | 'approvals' | 'links'>;

/** What `toLedger` reads: a snapshot, or the money rows of one loaded without the rest. */
export interface LedgerSource {
  people: { id: string }[];
  expenses: (Pick<ExpenseView, 'id' | 'payerId' | 'amount' | 'status' | 'createdById' | 'meta'> & {
    shares: { participantId: string; amount: number }[];
  })[];
  payments: Pick<PaymentView, 'id' | 'fromId' | 'toId' | 'amountClaimed' | 'amountConfirmed' | 'status'>[];
}

export function toLedger(s: LedgerSource): {
  order: string[];
  expenses: LedgerExpense[];
  payments: LedgerPayment[];
} {
  const order = s.people.map((p) => p.id);
  const ledgerExpenses: LedgerExpense[] = s.expenses.filter((e) => !isFundPaid(e) && !isPlanningExpense(e)).map((e) => ({
    id: e.id,
    payerId: e.payerId,
    amount: e.amount,
    status: e.status,
    createdById: e.createdById,
    shares: e.shares.map((sh) => ({
      participantId: sh.participantId,
      amount: sh.amount,
    })),
  }));
  const ledgerPayments: LedgerPayment[] = s.payments.map((p) => ({
    id: p.id,
    fromId: p.fromId,
    toId: p.toId,
    amount: p.amountConfirmed ?? p.amountClaimed,
    status: p.status,
  }));
  return { order, expenses: ledgerExpenses, payments: ledgerPayments };
}

/**
 * The group's balances and suggested transfers: the money rules shared by `buildSnapshot` and the
 * group list. `previous` (the last saved suggestions) keeps fewest-transfers suggestions stable.
 */
export function settleLedger(
  trip: Pick<TripRow, 'fewestTransfers' | 'roundTransfers'>,
  source: LedgerSource,
  previous?: Transfer[],
): { balances: Record<string, number>; suggestions: Transfer[] } {
  const ledger = toLedger(source);
  const balances = computeBalances(ledger.order, ledger.expenses, ledger.payments);
  const rawSuggestions =
    trip.fewestTransfers === 1
      ? suggestTransfers(
          computeBalances(ledger.order, ledger.expenses, ledger.payments, { includeSaysPaid: true }),
          ledger.order,
          previous,
        )
      : pairwiseTransfers(ledger.order, ledger.expenses, ledger.payments);

  const suggestions =
    trip.roundTransfers === 1
      ? rawSuggestions
          .map((s) => ({
            ...s,
            amount: s.amount <= 500 ? 0 : Math.round(s.amount / 1000) * 1000,
          }))
          .filter((s) => s.amount > 0)
      : rawSuggestions;

  return { balances, suggestions };
}

/** One person's balance in a group: rounded groups count the (rounded) suggested transfers. */
export function myBalanceIn(
  trip: Pick<TripRow, 'roundTransfers'>,
  s: Pick<TripSnapshot, 'balances' | 'suggestions'>,
  participantId: string,
): number {
  if (trip.roundTransfers !== 1) return s.balances[participantId] ?? 0;
  const owedToMe = s.suggestions
    .filter((t) => t.toId === participantId)
    .reduce((sum, t) => sum + t.amount, 0);
  const iOwe = s.suggestions
    .filter((t) => t.fromId === participantId)
    .reduce((sum, t) => sum + t.amount, 0);
  return owedToMe - iOwe;
}

/** True when a saved view has every field the current snapshot has (older views get rebuilt once). */
function hasCurrentFields(view: TripSnapshot): boolean {
  // Views cached before the group fund, player ratings, or trip locations lack those fields.
  return 'fund' in view && 'ratings' in view && 'locations' in view;
}

function expenseMeta(metaJson: string | null): ExpenseView['meta'] {
  return metaJson ? (JSON.parse(metaJson) as ExpenseView['meta']) : null;
}

export async function buildSnapshot(
  db: Db,
  trip: TripRow,
  previous?: Transfer[],
): Promise<TripSnapshot> {
  const participantRows = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.tripId, trip.id),
        // People who left stay in balances and on past expenses.
        inArray(participants.status, ['active', 'pending', 'left']),
      ),
    )
    .orderBy(asc(participants.sortOrder));

  const memberUserIds = participantRows
    .map((p) => p.userId)
    .filter((id): id is string => id !== null);

  const guestParticipantIds = participantRows
    .filter((p) => p.userId === null)
    .map((p) => p.id);

  let approvedUserSet = new Set<string>();
  const userAvatarMap = new Map<string, string | null>();
  if (memberUserIds.length > 0) {
    const memberBanks = await db
      .select({ userId: bankDetails.userId })
      .from(bankDetails)
      .where(
        and(
          inArray(bankDetails.userId, memberUserIds),
          eq(bankDetails.status, 'approved'),
        ),
      );
    approvedUserSet = new Set(
      memberBanks.map((b) => b.userId).filter((id): id is string => id !== null),
    );

    const userAvatars = await db
      .select({ id: users.id, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, memberUserIds));
    for (const u of userAvatars) {
      userAvatarMap.set(u.id, u.avatarUrl ?? null);
    }
  }

  const guestApprovedSet = new Set<string>();
  const guestPendingSet = new Set<string>();
  if (guestParticipantIds.length > 0) {
    const guestBanks = await db
      .select({ participantId: bankDetails.participantId, status: bankDetails.status })
      .from(bankDetails)
      .where(
        and(
          inArray(bankDetails.participantId, guestParticipantIds),
          inArray(bankDetails.status, ['approved', 'pending']),
        ),
      );
    for (const b of guestBanks) {
      if (b.participantId) {
        if (b.status === 'approved') {
          guestApprovedSet.add(b.participantId);
        } else if (b.status === 'pending') {
          guestPendingSet.add(b.participantId);
        }
      }
    }
  }

  const people: PersonView[] = participantRows.map((p) => {
    let bank: PersonView['bank'] = 'none';
    if (p.userId !== null) {
      bank = approvedUserSet.has(p.userId) ? 'approved' : 'none';
    } else if (guestApprovedSet.has(p.id)) {
      bank = 'approved';
    } else if (guestPendingSet.has(p.id)) {
      bank = 'pending';
    }
    const isOrganiser = p.userId !== null && p.userId === trip.organiserUserId;
    const isAdmin = p.isAdmin === 1 || isOrganiser;
    return {
      id: p.id,
      name: p.name,
      gender: (p.gender as 'M' | 'F' | null) ?? null,
      avatarUrl: p.userId !== null ? (userAvatarMap.get(p.userId) ?? null) : null,
      status: p.status as 'active' | 'pending' | 'left',
      isMember: p.userId !== null && p.status !== 'left',
      zaloLinked: p.zaloSub !== null,
      isOrganiser,
      isAdmin,
      bank,
    };
  });

  const txRows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.tripId, trip.id))
    .orderBy(desc(transactions.createdAt));

  const sharesByTxId = new Map<string, ExpenseView['shares']>();
  if (txRows.length > 0) {
    // A subquery, not a list of ids: D1 allows only 100 bound parameters per query.
    const shareRows = await db
      .select()
      .from(transactionShares)
      .where(
        inArray(
          transactionShares.transactionId,
          db.select({ id: transactions.id }).from(transactions).where(eq(transactions.tripId, trip.id)),
        ),
      );
    for (const s of shareRows) {
      let list = sharesByTxId.get(s.transactionId);
      if (!list) {
        list = [];
        sharesByTxId.set(s.transactionId, list);
      }
      list.push({
        participantId: s.participantId,
        amount: s.amount,
        inputValue: s.inputAuto === 1 ? null : s.inputValue,
      });
    }
  }

  const historyByRootId = new Map<string, ExpenseHistoryItem[]>();
  for (const tx of txRows) {
    if (tx.type === 'expense' && tx.isLatest === 0) {
      let list = historyByRootId.get(tx.rootId);
      if (!list) {
        list = [];
        historyByRootId.set(tx.rootId, list);
      }
      list.push({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        spentOn: tx.spentOn,
        payerId: tx.payerId,
        mode: tx.splitMode as SplitMode,
        createdById: tx.createdByParticipantId,
        createdAt: tx.createdAt,
        shares: sharesByTxId.get(tx.id) ?? [],
        meta: expenseMeta(tx.metaJson),
      });
    }
  }

  // Ensure history items are sorted newest-first (createdAt DESC)
  for (const list of historyByRootId.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const incomeHistoryByRootId = new Map<string, IncomeHistoryItem[]>();
  for (const tx of txRows) {
    if (tx.type === 'income' && tx.isLatest === 0) {
      let list = incomeHistoryByRootId.get(tx.rootId);
      if (!list) {
        list = [];
        incomeHistoryByRootId.set(tx.rootId, list);
      }
      list.push({
        id: tx.id,
        amount: tx.amount,
        spentOn: tx.spentOn,
        description: tx.description,
        createdById: tx.createdByParticipantId,
        createdAt: tx.createdAt,
      });
    }
  }
  for (const list of incomeHistoryByRootId.values()) {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const activeExpenseRows = txRows.filter((tx) => tx.type === 'expense' && tx.isLatest === 1);
  const activeIncomeRows = txRows.filter((tx) => tx.type === 'income' && tx.isLatest === 1);
  const activePaymentRows = txRows.filter((tx) => tx.type === 'payment' && tx.isLatest === 1);
  const disabledUserIds = Array.from(
    new Set(
      [...activeExpenseRows, ...activeIncomeRows, ...activePaymentRows]
        .map((e) => e.disabledByUserId)
        .filter((id): id is string => id !== null),
    ),
  );

  const disabledNameMap = new Map<string, string>();
  if (disabledUserIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, disabledUserIds));
    for (const u of userRows) {
      disabledNameMap.set(u.id, u.name);
    }
  }

  const expenseViews: ExpenseView[] = activeExpenseRows.map((e) => ({
    id: e.id,
    rootId: e.rootId,
    description: e.description,
    amount: e.amount,
    spentOn: e.spentOn,
    payerId: e.payerId,
    mode: e.splitMode as SplitMode,
    status: e.status as ExpenseStatus,
    rejectReason: e.rejectReason,
    disabledByName: e.disabledByUserId ? (disabledNameMap.get(e.disabledByUserId) ?? null) : null,
    createdById: e.createdByParticipantId,
    createdAt: e.createdAt,
    shares: sharesByTxId.get(e.id) ?? [],
    meta: expenseMeta(e.metaJson),
    history: historyByRootId.get(e.rootId) ?? [],
  }));

  const incomes: IncomeView[] = activeIncomeRows.map((i) => ({
    id: i.id,
    rootId: i.rootId,
    amount: i.amount,
    spentOn: i.spentOn,
    description: i.description,
    addedById: i.payerId,
    createdById: i.createdByParticipantId,
    createdAt: i.createdAt,
    status: i.status as IncomeStatus,
    disabledByName: i.disabledByUserId ? (disabledNameMap.get(i.disabledByUserId) ?? null) : null,
    meta: i.metaJson ? (JSON.parse(i.metaJson) as IncomeView['meta']) : { category: null },
    history: incomeHistoryByRootId.get(i.rootId) ?? [],
  }));

  const paymentViews: PaymentView[] = activePaymentRows.map((p) => {
    let meta: { expenseId?: string; paidBy?: 'self' | 'friend' } | null = null;
    if (p.metaJson) {
      try {
        meta = JSON.parse(p.metaJson) as { expenseId?: string; paidBy?: 'self' | 'friend' };
      } catch {
        meta = null;
      }
    }
    return {
      id: p.id,
      fromId: p.payerId,
      toId: p.toId!,
      amountClaimed: p.amount,
      amountConfirmed: p.amountConfirmed,
      status: p.status as PaymentStatus,
      notArrived: p.notArrivedAt !== null,
      disabledByName: p.disabledByUserId ? (disabledNameMap.get(p.disabledByUserId) ?? null) : null,
      createdAt: p.createdAt,
      confirmedById: p.confirmedByParticipantId,
      ...(isOffsetPart(p.metaJson) ? { throughPeople: true } : {}),
      ...(typeof meta?.expenseId === 'string' ? { expenseId: meta.expenseId } : {}),
      ...(meta?.paidBy === 'self' || meta?.paidBy === 'friend' ? { paidBy: meta.paidBy } : {}),
      ...(p.claimRequestId !== null ? { claimPending: true as const } : {}),
    };
  });

  const { balances, suggestions } = settleLedger(
    trip,
    { people, expenses: expenseViews, payments: paymentViews },
    previous,
  );

  const total = expenseViews
    .filter((e) => e.status === 'approved')
    .reduce((sum, e) => sum + e.amount, 0);

  const fund =
    trip.preset === 'sport'
      ? { ...fundSummary(incomes, expenseViews), incomes }
      : null;

  let ratings: RatingsView | null = null;
  if (trip.preset === 'sport') {
    const activeIds = new Set(people.filter((p) => p.status === 'active').map((p) => p.id));
    const totalStars: Record<string, number> = {};
    for (const id of activeIds) {
      totalStars[id] = 0;
    }
    const ratingRows = await db
      .select({
        raterParticipantId: playerRatings.raterParticipantId,
        targetParticipantId: playerRatings.targetParticipantId,
        stars: playerRatings.stars,
      })
      .from(playerRatings)
      .where(eq(playerRatings.tripId, trip.id));

    for (const r of ratingRows) {
      if (activeIds.has(r.raterParticipantId) && activeIds.has(r.targetParticipantId) && r.stars > 0) {
        totalStars[r.targetParticipantId] = (totalStars[r.targetParticipantId] ?? 0) + r.stars;
      }
    }

    ratings = {
      enabled: trip.ratingsEnabled === 1,
      totalStars,
      maxStars: maxStarsForGroup(activeIds.size),
      myAllocations: {},
    };
  }

  const locationRows = await db
    .select()
    .from(tripLocations)
    .where(eq(tripLocations.tripId, trip.id))
    .orderBy(asc(tripLocations.createdAt));

  const locations: TripLocationView[] = locationRows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    phone: r.phone ?? null,
    mapUrl: r.mapUrl ?? null,
    notes: r.notes ?? null,
  }));

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      preset: (trip.preset as 'trip' | 'sport') ?? 'trip',
      currency: 'VND',
      fewestTransfers: trip.fewestTransfers === 1,
      roundTransfers: trip.roundTransfers === 1,
      ratingsEnabled: trip.ratingsEnabled === 1,
      theme: isThemeId(trip.theme) ? trip.theme : null,
      defaultLang: trip.defaultLang === 'en' ? 'en' : 'vi',
      archived: trip.archivedAt !== null,
      deleteAfter: trip.deleteAfter ?? null,
      version: trip.version,
      total,
    },
    people,
    balances,
    suggestions,
    expenses: expenseViews,
    payments: paymentViews,
    fund,
    ratings,
    locations,
  };
}

/**
 * `cached` is the trip's `trip_views` row (or null when it has none) when the caller already
 * read it, which saves the lookup.
 */
export async function getSnapshot(
  db: Db,
  trip: TripRow,
  cached?: { version: number; json: string } | null,
): Promise<TripSnapshot> {
  const row =
    cached !== undefined
      ? cached
      : await db
          .select()
          .from(tripViews)
          .where(eq(tripViews.tripId, trip.id))
          .get();

  if (row && row.version === trip.version) {
    const view = JSON.parse(row.json) as TripSnapshot;
    if (hasCurrentFields(view)) return view;
  }

  let previous: Transfer[] | undefined;
  if (row) {
    try {
      const prev = JSON.parse(row.json) as TripSnapshot;
      previous = prev.suggestions;
    } catch {
      previous = undefined;
    }
  }

  const snapshot = await buildSnapshot(db, trip, previous);
  const json = JSON.stringify(snapshot);
  const updatedAt = nowIso();

  await db
    .insert(tripViews)
    .values({
      tripId: trip.id,
      version: trip.version,
      json,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: tripViews.tripId,
      set: {
        version: trip.version,
        json,
        updatedAt,
      },
      // A slow request still holding an older trip version must not replace a newer saved view.
      setWhere: lte(tripViews.version, trip.version),
    });

  return snapshot;
}

/**
 * SQL twin of the saved-view check in `getSnapshot`: the `trip_views` row (joined next to `trips`)
 * has the trip's version and every field the current snapshot has.
 */
const viewIsCurrent = sql<number>`CASE WHEN ${tripViews.json} IS NOT NULL AND ${tripViews.version} = ${trips.version} AND json_valid(${tripViews.json}) THEN (json_type(${tripViews.json}, '$.fund') IS NOT NULL AND json_type(${tripViews.json}, '$.ratings') IS NOT NULL AND json_type(${tripViews.json}, '$.locations') IS NOT NULL) ELSE 0 END`;

/** The caller's groups for the list: active, and never the personal ('direct') ledger. */
function myGroupsWhere(userId: string) {
  return and(
    eq(participants.userId, userId),
    eq(participants.status, 'active'),
    ne(trips.preset, 'direct'),
  );
}

/**
 * The caller's group list with their balance in each group, in a fixed number of queries however
 * many groups they have (D1 allows 50 per request): one for the groups and their saved views, then,
 * only when some saved views are out of date, three that load the money rows of all those groups
 * at once. Balances come from the same rules as the snapshot (`settleLedger`). Nothing is written:
 * opening a group refreshes its saved view.
 */
export async function loadTripList(db: Db, userId: string): Promise<TripListItem[]> {
  const rows = await db
    .select({
      participantId: participants.id,
      trip: trips,
      viewJson: tripViews.json,
      viewCurrent: viewIsCurrent,
    })
    .from(participants)
    .innerJoin(trips, eq(participants.tripId, trips.id))
    .leftJoin(tripViews, eq(tripViews.tripId, trips.id))
    .where(myGroupsWhere(userId))
    .orderBy(desc(trips.createdAt));

  const fresh = new Map<string, TripSnapshot>();
  for (const row of rows) {
    if (row.viewCurrent !== 1 || row.viewJson === null) continue;
    try {
      const view = JSON.parse(row.viewJson) as TripSnapshot;
      if (hasCurrentFields(view)) fresh.set(row.trip.id, view);
    } catch {
      // Rebuilt below like any other out-of-date view.
    }
  }

  const sources = new Map<string, LedgerSource>();
  if (rows.some((r) => !fresh.has(r.trip.id))) {
    // Subqueries, not lists of ids: D1 allows only 100 bound parameters per query.
    const staleTripIds = db
      .select({ id: trips.id })
      .from(participants)
      .innerJoin(trips, eq(participants.tripId, trips.id))
      .leftJoin(tripViews, eq(tripViews.tripId, trips.id))
      .where(and(myGroupsWhere(userId), sql`NOT (${viewIsCurrent})`));

    const people = await db
      .select({ id: participants.id, tripId: participants.tripId })
      .from(participants)
      .where(
        and(
          inArray(participants.tripId, staleTripIds),
          // People who left stay in balances, as in the snapshot.
          inArray(participants.status, ['active', 'pending', 'left']),
        ),
      )
      .orderBy(asc(participants.sortOrder));

    const txRows = await db
      .select({
        id: transactions.id,
        tripId: transactions.tripId,
        type: transactions.type,
        amount: transactions.amount,
        amountConfirmed: transactions.amountConfirmed,
        payerId: transactions.payerId,
        toId: transactions.toId,
        status: transactions.status,
        createdById: transactions.createdByParticipantId,
        metaJson: transactions.metaJson,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.tripId, staleTripIds),
          eq(transactions.isLatest, 1),
          inArray(transactions.type, ['expense', 'payment']),
        ),
      )
      .orderBy(desc(transactions.createdAt));

    const shareRows = await db
      .select({
        transactionId: transactionShares.transactionId,
        participantId: transactionShares.participantId,
        amount: transactionShares.amount,
      })
      .from(transactionShares)
      .where(
        inArray(
          transactionShares.transactionId,
          db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
              and(
                inArray(transactions.tripId, staleTripIds),
                eq(transactions.isLatest, 1),
                eq(transactions.type, 'expense'),
              ),
            ),
        ),
      );

    const sourceOf = (tripId: string): LedgerSource => {
      let source = sources.get(tripId);
      if (!source) {
        source = { people: [], expenses: [], payments: [] };
        sources.set(tripId, source);
      }
      return source;
    };
    for (const p of people) sourceOf(p.tripId).people.push({ id: p.id });

    const sharesByTxId = new Map<string, { participantId: string; amount: number }[]>();
    for (const s of shareRows) {
      let list = sharesByTxId.get(s.transactionId);
      if (!list) {
        list = [];
        sharesByTxId.set(s.transactionId, list);
      }
      list.push({ participantId: s.participantId, amount: s.amount });
    }

    for (const tx of txRows) {
      if (tx.type === 'expense') {
        sourceOf(tx.tripId).expenses.push({
          id: tx.id,
          payerId: tx.payerId,
          amount: tx.amount,
          status: tx.status as ExpenseStatus,
          createdById: tx.createdById,
          meta: expenseMeta(tx.metaJson),
          shares: sharesByTxId.get(tx.id) ?? [],
        });
      } else {
        sourceOf(tx.tripId).payments.push({
          id: tx.id,
          fromId: tx.payerId,
          toId: tx.toId!,
          amountClaimed: tx.amount,
          amountConfirmed: tx.amountConfirmed,
          status: tx.status as PaymentStatus,
        });
      }
    }
  }

  const list: TripListItem[] = [];
  for (const row of rows) {
    let money: Pick<TripSnapshot, 'balances' | 'suggestions'> | undefined = fresh.get(row.trip.id);
    if (!money) {
      let previous: Transfer[] | undefined;
      if (row.viewJson !== null) {
        try {
          previous = (JSON.parse(row.viewJson) as TripSnapshot).suggestions;
        } catch {
          previous = undefined;
        }
      }
      const source = sources.get(row.trip.id);
      // The caller is always one of the group's people, so a group with nobody loaded means the
      // SQL and JS view checks disagreed: build that one group in full instead (still no write).
      money =
        source && source.people.length > 0
          ? settleLedger(row.trip, source, previous)
          : await buildSnapshot(db, row.trip, previous);
    }
    list.push({
      id: row.trip.id,
      name: row.trip.name,
      preset: (row.trip.preset as 'trip' | 'sport') ?? 'trip',
      archived: row.trip.archivedAt !== null,
      ...(row.trip.deleteAfter ? { deleteAfter: row.trip.deleteAfter } : {}),
      myBalance: myBalanceIn(row.trip, money, row.participantId),
    });
  }
  return list;
}

/** A settlement part marked `{"offset":true}` in metaJson (settled through the People total). */
function isOffsetPart(metaJson: string | null): boolean {
  if (!metaJson || !metaJson.includes('"offset"')) return false;
  try {
    return (JSON.parse(metaJson) as { offset?: unknown }).offset === true;
  } catch {
    return false;
  }
}
