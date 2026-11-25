import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import {
  participants,
  personalGroupLinkTags,
  personalGroupLinks,
  personalGroupSettings,
  transactionShares,
  transactions,
  trips,
} from '@cc/api-db/schema';
import {
  isFundPaid,
  isPlanningExpense,
  type ExpenseMeta,
  type GroupLinkView,
  type GroupRow,
  type GroupSettingsView,
} from '@cc/core';
import { fixedCategoryId } from './fixedCategories';

const TRIP_CHUNK_SIZE = 90;

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Stable hash of every active group's version and the user's latest group-link write. Two queries. */
export async function computeGroupsKey(db: Db, userId: string): Promise<string> {
  const [groupVersionRows, linkVerRow] = await Promise.all([
    db
      .select({
        tripId: trips.id,
        version: trips.version,
      })
      .from(participants)
      .innerJoin(trips, eq(trips.id, participants.tripId))
      .where(
        and(
          eq(participants.userId, userId),
          eq(participants.status, 'active'),
          isNull(trips.deleteAfter),
        ),
      )
      .all(),
    db
      .select({
        maxSyncVersion: sql<number | null>`max(${personalGroupLinks.syncVersion})`,
      })
      .from(personalGroupLinks)
      .where(eq(personalGroupLinks.userId, userId))
      .get(),
  ]);

  const versionByTrip = new Map<string, number>();
  for (const row of groupVersionRows) {
    versionByTrip.set(row.tripId, row.version);
  }
  const pairs = Array.from(versionByTrip.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([tripId, version]) => `${tripId}:${version}`);
  const maxLinkSyncVersion = linkVerRow?.maxSyncVersion ?? 0;
  return fnv1aHex(`${pairs.join(',')}|${maxLinkSyncVersion}`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseMeta(metaJson: string | null): ExpenseMeta | null {
  if (!metaJson) return null;
  try {
    return JSON.parse(metaJson) as ExpenseMeta;
  } catch {
    return null;
  }
}

function resolveSurvivor(pid: string, mergedIntoByPid: Map<string, string | null>): string {
  let cur = pid;
  const seen = new Set<string>();
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = mergedIntoByPid.get(cur);
    if (!next) return cur;
    cur = next;
  }
  return cur;
}

export async function loadGroupRows(
  db: Db,
  userId: string,
  range?: { from: string; to: string },
): Promise<GroupRow[]> {
  const mine = await db
    .select({
      myPid: participants.id,
      tripId: trips.id,
      tripName: trips.name,
      preset: trips.preset,
      version: trips.version,
    })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .where(
      and(
        eq(participants.userId, userId),
        eq(participants.status, 'active'),
        isNull(trips.deleteAfter),
      ),
    )
    .all();

  if (mine.length === 0) return [];

  const tripById = new Map<string, { tripId: string; tripName: string; preset: string; version: number }>();
  const myActivePidsByTrip = new Map<string, Set<string>>();
  for (const m of mine) {
    if (!tripById.has(m.tripId)) {
      tripById.set(m.tripId, {
        tripId: m.tripId,
        tripName: m.tripName,
        preset: m.preset,
        version: m.version,
      });
    }
    let set = myActivePidsByTrip.get(m.tripId);
    if (!set) {
      set = new Set();
      myActivePidsByTrip.set(m.tripId, set);
    }
    set.add(m.myPid);
  }

  const tripIds = Array.from(tripById.keys());
  const tripChunks = chunk(tripIds, TRIP_CHUNK_SIZE);

  const [participantChunks, txChunks, shareChunks, linkRows, linkTagRows] = await Promise.all([
    Promise.all(
      tripChunks.map((ids) =>
        db
          .select({
            id: participants.id,
            tripId: participants.tripId,
            name: participants.name,
            status: participants.status,
            mergedInto: participants.mergedInto,
            sortOrder: participants.sortOrder,
          })
          .from(participants)
          .where(inArray(participants.tripId, ids))
          .all(),
      ),
    ),
    Promise.all(
      tripChunks.map((ids) => {
        const conds = [
          inArray(transactions.tripId, ids),
          sql`${transactions.isLatest} = 1`,
          sql`${transactions.type} IN ('expense', 'income', 'payment')`,
          sql`${transactions.status} IN ('approved', 'pending', 'confirmed', 'says_paid')`,
        ];
        if (range) {
          conds.push(gte(transactions.spentOn, range.from), lte(transactions.spentOn, range.to));
        }
        return db
          .select({
            id: transactions.id,
            rootId: transactions.rootId,
            tripId: transactions.tripId,
            type: transactions.type,
            description: transactions.description,
            amount: transactions.amount,
            amountConfirmed: transactions.amountConfirmed,
            spentOn: transactions.spentOn,
            payerId: transactions.payerId,
            toId: transactions.toId,
            status: transactions.status,
            categoryKey: transactions.categoryKey,
            metaJson: transactions.metaJson,
            createdAt: transactions.createdAt,
            updatedAt: transactions.updatedAt,
          })
          .from(transactions)
          .where(and(...conds))
          .all();
      }),
    ),
    Promise.all(
      tripChunks.map((ids) => {
        const conds = [
          inArray(transactions.tripId, ids),
          sql`${transactions.isLatest} = 1`,
          sql`${transactions.type} = 'expense'`,
          sql`${transactions.status} IN ('approved', 'pending')`,
        ];
        if (range) {
          conds.push(gte(transactions.spentOn, range.from), lte(transactions.spentOn, range.to));
        }
        return db
          .select({
            transactionId: transactionShares.transactionId,
            participantId: transactionShares.participantId,
            amount: transactionShares.amount,
          })
          .from(transactionShares)
          .innerJoin(transactions, eq(transactions.id, transactionShares.transactionId))
          .where(and(...conds))
          .all();
      }),
    ),
    db
      .select({
        rootId: personalGroupLinks.rootId,
        walletId: personalGroupLinks.walletId,
        categoryId: personalGroupLinks.categoryId,
        intent: personalGroupLinks.intent,
        excludeFromReports: personalGroupLinks.excludeFromReports,
      })
      .from(personalGroupLinks)
      .where(eq(personalGroupLinks.userId, userId))
      .all(),
    db
      .select({
        rootId: personalGroupLinkTags.rootId,
        tagId: personalGroupLinkTags.tagId,
      })
      .from(personalGroupLinkTags)
      .where(eq(personalGroupLinkTags.userId, userId))
      .all(),
  ]);

  const allParticipants = participantChunks.flat();
  const participantById = new Map(allParticipants.map((p) => [p.id, p]));
  const mergedIntoByPid = new Map<string, string | null>(
    allParticipants.map((p) => [p.id, p.status === 'merged' ? p.mergedInto : null]),
  );

  // Expand my participant IDs per trip to include any participant whose merged_into chain resolves to me.
  const myPidsByTrip = new Map<string, Set<string>>();
  for (const [tripId, activeSet] of myActivePidsByTrip) {
    myPidsByTrip.set(tripId, new Set(activeSet));
  }
  for (const p of allParticipants) {
    const mySet = myPidsByTrip.get(p.tripId);
    if (!mySet) continue;
    const survivor = resolveSurvivor(p.id, mergedIntoByPid);
    if (mySet.has(survivor)) {
      mySet.add(p.id);
    }
  }

  const nameOf = (pid: string): string | null => {
    const survivor = resolveSurvivor(pid, mergedIntoByPid);
    return participantById.get(survivor)?.name ?? participantById.get(pid)?.name ?? null;
  };

  const sharesByTxId = new Map<string, { participantId: string; amount: number }[]>();
  for (const s of shareChunks.flat()) {
    let list = sharesByTxId.get(s.transactionId);
    if (!list) {
      list = [];
      sharesByTxId.set(s.transactionId, list);
    }
    list.push({ participantId: s.participantId, amount: s.amount });
  }

  const tagsByRootId = new Map<string, string[]>();
  for (const t of linkTagRows) {
    let list = tagsByRootId.get(t.rootId);
    if (!list) {
      list = [];
      tagsByRootId.set(t.rootId, list);
    }
    list.push(t.tagId);
  }
  for (const list of tagsByRootId.values()) {
    list.sort();
  }

  const linkByRootId = new Map<string, GroupLinkView>();
  for (const l of linkRows) {
    linkByRootId.set(l.rootId, {
      walletId: l.walletId,
      categoryId: l.categoryId,
      tagIds: tagsByRootId.get(l.rootId) ?? [],
      intent: l.intent === 'shared' || l.intent === 'loan' ? l.intent : null,
      excludeFromReports: l.excludeFromReports === 1,
    });
  }

  const rows: GroupRow[] = [];

  for (const tx of txChunks.flat()) {
    const trip = tripById.get(tx.tripId);
    const myTripPids = myPidsByTrip.get(tx.tripId);
    if (!trip || !myTripPids) continue;

    const isDirect = trip.preset === 'direct';
    const link = linkByRootId.get(tx.rootId) ?? null;
    const activityAt = tx.updatedAt > tx.createdAt ? tx.updatedAt : tx.createdAt;

    if (tx.type === 'expense') {
      if (tx.status !== 'approved' && tx.status !== 'pending') continue;
      const meta = parseMeta(tx.metaJson);
      if (isFundPaid({ meta }) || isPlanningExpense({ meta })) continue;

      const iPaid = myTripPids.has(tx.payerId);
      const txShares = sharesByTxId.get(tx.id) ?? [];

      let hasMyShare = false;
      let myShare = 0;
      const otherParticipants: { id: string; name: string; sortOrder: number }[] = [];
      const seenOther = new Set<string>();

      for (const s of txShares) {
        if (myTripPids.has(s.participantId)) {
          hasMyShare = true;
          myShare += s.amount;
        } else {
          const resolvedId = resolveSurvivor(s.participantId, mergedIntoByPid);
          if (seenOther.has(resolvedId)) continue;
          seenOther.add(resolvedId);
          const p = participantById.get(resolvedId) ?? participantById.get(s.participantId);
          if (p) {
            otherParticipants.push({ id: p.id, name: p.name, sortOrder: p.sortOrder });
          }
        }
      }

      if (!iPaid && !hasMyShare) continue;

      otherParticipants.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

      rows.push({
        kind: 'group',
        id: tx.id,
        rootId: tx.rootId,
        tripId: tx.tripId,
        tripName: trip.tripName,
        isDirect,
        source: 'expense',
        date: tx.spentOn,
        title: tx.description,
        total: tx.amount,
        myShare,
        iPaid,
        payerName: nameOf(tx.payerId),
        counterpartName: null,
        people: otherParticipants.map((p) => p.name),
        pending: tx.status === 'pending',
        link,
        groupCategoryId: tx.categoryKey ? fixedCategoryId(userId, tx.categoryKey) : null,
        createdAt: tx.createdAt,
        activityAt,
      });
    } else if (tx.type === 'income') {
      if (tx.status !== 'approved') continue;
      if (!myTripPids.has(tx.payerId)) continue;

      rows.push({
        kind: 'group',
        id: tx.id,
        rootId: tx.rootId,
        tripId: tx.tripId,
        tripName: trip.tripName,
        isDirect,
        source: 'fund',
        date: tx.spentOn,
        title: tx.description,
        total: tx.amount,
        myShare: 0,
        iPaid: true,
        payerName: nameOf(tx.payerId),
        counterpartName: null,
        people: [],
        pending: false,
        link,
        groupCategoryId: null,
        createdAt: tx.createdAt,
        activityAt,
      });
    } else if (tx.type === 'payment') {
      if (tx.status !== 'confirmed' && tx.status !== 'says_paid') continue;
      const fromMine = myTripPids.has(tx.payerId);
      const toMine = tx.toId !== null && myTripPids.has(tx.toId);
      if (!fromMine && !toMine) continue;

      const otherId = fromMine ? tx.toId : tx.payerId;

      rows.push({
        kind: 'group',
        id: tx.id,
        rootId: tx.rootId,
        tripId: tx.tripId,
        tripName: trip.tripName,
        isDirect,
        source: 'payment',
        date: tx.spentOn,
        title: tx.description,
        total: tx.amountConfirmed ?? tx.amount,
        myShare: 0,
        iPaid: fromMine,
        payerName: nameOf(tx.payerId),
        counterpartName: otherId ? nameOf(otherId) : null,
        people: [],
        pending: tx.status === 'says_paid',
        link,
        groupCategoryId: null,
        createdAt: tx.createdAt,
        activityAt,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    return b.id.localeCompare(a.id);
  });

  return rows;
}

/** The user's group settings; defaults when no row exists yet. One query. */
export async function loadGroupSettings(db: Db, userId: string): Promise<GroupSettingsView> {
  const row = await db
    .select({
      defaultGroupCategoryId: personalGroupSettings.defaultGroupCategoryId,
      countLoans: personalGroupSettings.countLoans,
    })
    .from(personalGroupSettings)
    .where(eq(personalGroupSettings.userId, userId))
    .get();
  return {
    defaultGroupCategoryId: row?.defaultGroupCategoryId ?? null,
    countLoans: row?.countLoans === 1,
  };
}
