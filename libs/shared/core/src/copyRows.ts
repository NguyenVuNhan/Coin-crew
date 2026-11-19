import type {
  CategoryView,
  EntryView,
  ListQuery,
  ListRow,
  SyncEntryRow,
  SyncLedgerRow,
  TagView,
  WalletDetailView,
} from './api-types';
import { compareListRows, matchesListQuery, resolveListPeriod } from './listFilter';
import { isBeforeStart } from './wallets';

/**
 * Raw sync rows stored in the browser's local copy.
 */
export interface CopyRows {
  entries: SyncEntryRow[];
  ledger: SyncLedgerRow[];
}

/**
 * Reference tables used to hydrate and filter raw sync rows into list views.
 */
export interface CopyLookups {
  wallets: WalletDetailView[];
  categories: CategoryView[];
  tags: TagView[];
}

/**
 * Converts raw sync rows from a local copy into the sorted `ListRow[]`
 * matching the `/me/personal/transactions` endpoint for the given query.
 */
export function listFromCopy(
  rows: CopyRows,
  query: ListQuery,
  lookups: CopyLookups,
  today: string,
): ListRow[] {
  const period = resolveListPeriod(query, today);
  const walletById = new Map<string, WalletDetailView>(
    lookups.wallets.map((w) => [w.id, w]),
  );
  const defaultWalletId = lookups.wallets.find((w) => w.isDefault)?.id ?? null;
  const categoryParentById = new Map<string, string | null>(
    lookups.categories.map((c) => [c.id, c.parentId ?? null]),
  );
  const tagNameById = new Map<string, string>(
    lookups.tags.map((t) => [t.id, t.name]),
  );

  const tagIdsByEntry = new Map<string, string[]>();
  const candidates: ListRow[] = [];

  for (const r of rows.entries) {
    const wallet = walletById.get(r.walletId);
    if (!wallet) continue;

    tagIdsByEntry.set(r.id, r.tagIds);

    const tags: string[] = [];
    for (const tagId of r.tagIds) {
      const name = tagNameById.get(tagId);
      if (name !== undefined) {
        tags.push(name);
      }
    }

    const entry: EntryView = {
      id: r.id,
      walletId: r.walletId,
      type: r.type,
      amount: r.amount,
      currency: wallet.currency,
      categoryId: r.categoryId,
      assetId: r.assetId,
      quantity: r.quantity,
      transferId: r.transferId,
      counterpartWalletId: r.counterpartWalletId,
      date: r.date,
      time: r.time,
      note: r.note,
      tags,
      excludeFromReports: r.excludeFromReports,
      source: 'manual',
      beforeStart: isBeforeStart({ date: r.date }, { startDate: wallet.startDate }),
      createdAt: r.createdAt,
    };

    candidates.push({ kind: 'entry', entry });
  }

  if (defaultWalletId !== null) {
    for (const r of rows.ledger) {
      candidates.push({
        kind: 'person',
        ...r,
        walletId: defaultWalletId,
        currency: 'VND',
      });
    }
  }

  const ctx = {
    period,
    tagIdsOf: (entryId: string) => tagIdsByEntry.get(entryId) ?? [],
    categoryParentOf: (categoryId: string) => categoryParentById.get(categoryId) ?? null,
    defaultWalletId,
  };

  const filtered = candidates.filter((row) => matchesListQuery(row, query, ctx));
  filtered.sort(compareListRows);
  return filtered;
}
