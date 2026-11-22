import { Hono } from 'hono';
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  personalSyncDeletions,
  personalSyncState,
  personalTransactions,
  personalTransactionTags,
  trips,
} from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import type {
  GroupRow,
  PersonalEntryType,
  SyncCursor,
  SyncEntryRow,
  SyncLedgerRow,
  SyncResponse,
} from '@cc/core';
import { findLedger } from '../me/ledger';
import { computeGroupsKey, loadGroupRows } from './groupShares';
import { loadLedgerRows } from './personRows';

const PAGE_SIZE = 500;
const TAG_CHUNK = 90;

function parseOptionalInt(val: string | undefined): number | undefined {
  if (val === undefined) return undefined;
  if (!/^-?\d+$/.test(val)) {
    throw new ApiError('VALIDATION', 422, 'Invalid sync query');
  }
  const n = Number(val);
  if (!Number.isSafeInteger(n)) {
    throw new ApiError('VALIDATION', 422, 'Invalid sync query');
  }
  return n;
}

export function syncRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/sync', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const epochParam = c.req.query('epoch');
    const since = parseOptionalInt(c.req.query('since'));
    const ledgerVersion = parseOptionalInt(c.req.query('ledgerVersion'));
    // Group rows are opt-in (`groups=show`) so today's clients get exactly today's responses.
    const wantGroups = c.req.query('groups') === 'show';
    const groupsKey = c.req.query('groupsKey');
    const cursorV = parseOptionalInt(c.req.query('cursorV'));
    const cursorId = c.req.query('cursorId');

    if ((cursorV !== undefined && cursorId === undefined) || (cursorV === undefined && cursorId !== undefined)) {
      throw new ApiError('VALIDATION', 422, 'Invalid sync query');
    }
    if (cursorId !== undefined && cursorId.length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid sync query');
    }

    const stateRow = await db
      .select({
        version: personalSyncState.version,
        epoch: personalSyncState.epoch,
        purgedVersion: personalSyncState.purgedVersion,
      })
      .from(personalSyncState)
      .where(eq(personalSyncState.userId, user.id))
      .get();

    const state = stateRow ?? { version: 0, epoch: 0, purgedVersion: 0 };
    const serverEpoch = `${c.env.PERSONAL_SYNC_EPOCH ?? '1'}.${state.epoch}`;

    const isReset = since === undefined || epochParam !== serverEpoch || since < state.purgedVersion;
    const isFirstPage = cursorV === undefined && cursorId === undefined;

    const ledger = wantGroups ? null : await findLedger(db, user.id);
    let ledgerTripVersion = 0;
    if (ledger) {
      const tripRow = await db
        .select({ version: trips.version })
        .from(trips)
        .where(eq(trips.id, ledger.tripId))
        .get();
      ledgerTripVersion = tripRow?.version ?? 0;
    }

    let currentGroupsKey: string | null = null;
    if (isFirstPage && wantGroups) {
      currentGroupsKey = await computeGroupsKey(db, user.id);
    }

    if (
      !isReset &&
      since === state.version &&
      (wantGroups || Number(ledgerVersion) === ledgerTripVersion) &&
      isFirstPage &&
      (!wantGroups || groupsKey === currentGroupsKey)
    ) {
      const currentResponse: SyncResponse = {
        status: 'current',
        epoch: serverEpoch,
        version: state.version,
        entries: [],
        removedIds: [],
        cursor: null,
        ledger: null,
        ...(wantGroups ? { groups: null } : {}),
      };
      return c.json(currentResponse, 200);
    }

    const conditions = [
      eq(personalTransactions.userId, user.id),
      gt(personalTransactions.syncVersion, isReset ? -1 : since!),
    ];

    if (!isFirstPage) {
      conditions.push(
        or(
          gt(personalTransactions.syncVersion, cursorV!),
          and(
            eq(personalTransactions.syncVersion, cursorV!),
            gt(personalTransactions.id, cursorId!),
          ),
        )!,
      );
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
        syncVersion: personalTransactions.syncVersion,
      })
      .from(personalTransactions)
      .where(and(...conditions))
      .orderBy(asc(personalTransactions.syncVersion), asc(personalTransactions.id))
      .limit(PAGE_SIZE + 1)
      .all();

    let cursor: SyncCursor | null = null;
    if (entryRows.length === PAGE_SIZE + 1) {
      entryRows.pop();
      const lastRow = entryRows[entryRows.length - 1]!;
      cursor = { v: lastRow.syncVersion, id: lastRow.id };
    }

    const tagsByTx = new Map<string, string[]>();
    if (entryRows.length > 0) {
      // D1 allows at most 100 bound parameters per query, so look tags up in chunks.
      const txIds = entryRows.map((e) => e.id);
      const tagRows: { transactionId: string; tagId: string }[] = [];
      for (let i = 0; i < txIds.length; i += TAG_CHUNK) {
        const chunk = await db
          .select({
            transactionId: personalTransactionTags.transactionId,
            tagId: personalTransactionTags.tagId,
          })
          .from(personalTransactionTags)
          .where(inArray(personalTransactionTags.transactionId, txIds.slice(i, i + TAG_CHUNK)))
          .orderBy(sql`${personalTransactionTags}.rowid asc`)
          .all();
        tagRows.push(...chunk);
      }

      for (const tr of tagRows) {
        const list = tagsByTx.get(tr.transactionId) ?? [];
        list.push(tr.tagId);
        tagsByTx.set(tr.transactionId, list);
      }
    }

    const entries: SyncEntryRow[] = entryRows.map((r) => ({
      id: r.id,
      walletId: r.walletId,
      type: r.type as PersonalEntryType,
      amount: r.amount,
      categoryId: r.categoryId ?? null,
      assetId: r.assetId ?? null,
      quantity: r.quantity ?? null,
      transferId: r.transferId ?? null,
      counterpartWalletId: r.counterpartWalletId ?? null,
      date: r.date,
      time: r.time ?? null,
      note: r.note ?? null,
      tagIds: tagsByTx.get(r.id) ?? [],
      excludeFromReports: r.excludeFromReports === 1,
      createdAt: r.createdAt,
      syncVersion: r.syncVersion,
    }));

    let removedIds: string[] = [];
    if (isFirstPage && !isReset) {
      const delRows = await db
        .select({ transactionId: personalSyncDeletions.transactionId })
        .from(personalSyncDeletions)
        .where(
          and(
            eq(personalSyncDeletions.userId, user.id),
            gt(personalSyncDeletions.version, since!),
          ),
        )
        .all();
      removedIds = delRows.map((d) => d.transactionId);
    }

    let ledgerField: { version: number; rows: SyncLedgerRow[] } | null = null;
    if (!wantGroups && isFirstPage && (isReset || Number(ledgerVersion) !== ledgerTripVersion)) {
      ledgerField = {
        version: ledgerTripVersion,
        rows: ledger ? await loadLedgerRows(db, ledger) : [],
      };
    }

    let groupsField: { key: string; rows: GroupRow[] } | null = null;
    if (isFirstPage && currentGroupsKey !== null && (isReset || groupsKey !== currentGroupsKey)) {
      groupsField = {
        key: currentGroupsKey,
        rows: await loadGroupRows(db, user.id),
      };
    }

    const response: SyncResponse = {
      status: isReset ? 'reset' : 'delta',
      epoch: serverEpoch,
      version: state.version,
      entries,
      removedIds,
      cursor,
      ledger: ledgerField,
      ...(wantGroups ? { groups: groupsField } : {}),
    };

    return c.json(response, 200);
  });

  return app;
}
