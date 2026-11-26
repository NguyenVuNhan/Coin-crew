import { useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router';
import {
  compareBookRows,
  formatMoney,
  type AssetView,
  type BookRow,
  type BudgetDef,
  type BudgetPeriod,
  type CategoryView,
  type CountedSpendRow,
  type EntryView,
  type GroupRow,
  type GroupSettingsView,
  type TagView,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { usePersonalList } from '@cc/web-data-access/personalMoney';
import { hydrateEntryView } from '@cc/web-data-access/reports';
import { useGroupCopy } from '@cc/web-data-access/txCopy/groupCopy';
import { useTxCopy } from '@cc/web-data-access/txCopy/hooks';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { GroupRowSheet } from '../GroupRowSheet';
import { TransactionRow } from '../TransactionRow';
import { categoryIconName } from '../categoryIcon';
import { formatCompactRowDate, shouldShowWalletName } from '../transactions/rowHelpers';
import { TransactionDetailContent } from '../../screens/TransactionDetail';

export interface BudgetTransactionsProps {
  def: BudgetDef;
  period: BudgetPeriod;
  source: 'copy' | 'server' | 'pending';
  countedRows: CountedSpendRow[];
  wallets: WalletDetailView[];
  categories: CategoryView[];
  tags: TagView[];
  assets: AssetView[];
  groupSettings: GroupSettingsView;
}

type DisplayItem =
  | { kind: 'book'; key: string; date: string; row: BookRow }
  | { kind: 'static'; key: string; date: string; row: CountedSpendRow };

function StaticSpendRow({
  row,
  categoriesById,
  wallets,
  walletsById,
}: {
  row: CountedSpendRow;
  categoriesById: Map<string, CategoryView>;
  wallets: WalletDetailView[];
  walletsById: Map<string, WalletDetailView>;
}): JSX.Element {
  const t = useT();
  const category = categoriesById.get(row.categoryId);
  const title = category?.name ?? t('personalEntry.expense');
  const iconName = categoryIconName(category?.icon, 'expense');
  const wallet = row.walletId ? walletsById.get(row.walletId) : undefined;
  const showWallet = Boolean(
    wallet?.name && shouldShowWalletName(wallets, wallet, false),
  );
  const metaParts = [
    formatCompactRowDate(row.date, t),
    showWallet && wallet ? wallet.name : '',
  ].filter(Boolean);

  return (
    <div
      data-testid={`tx-row-${row.id}`}
      className="fsl-tx-row w-full text-left flex items-center gap-3 min-h-14 px-4 py-3 text-foreground"
    >
      <span
        aria-hidden="true"
        className="size-10 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
      >
        <Icon name={iconName} size={18} />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground truncate">
          {title}
        </span>
        {metaParts.length > 0 && (
          <span className="text-xs text-muted-foreground truncate">
            {metaParts.join(' · ')}
          </span>
        )}
      </div>
      <span className="fsl-tx-row__amount text-sm font-semibold tabular-nums whitespace-nowrap text-danger shrink-0">
        {`\u2212${formatMoney(Math.abs(row.amount), row.currency)}`}
      </span>
    </div>
  );
}

/** Lists counted transactions for the shown budget period and opens their detail sheets on tap. */
export function BudgetTransactions({
  def,
  period,
  source,
  countedRows,
  wallets,
  categories,
  tags,
  assets,
  groupSettings,
}: BudgetTransactionsProps): JSX.Element {
  const t = useT();
  const [selectedEntry, setSelectedEntry] = useState<EntryView | null>(null);
  const [selectedGroupRow, setSelectedGroupRow] = useState<GroupRow | null>(
    null,
  );

  const txCopy = useTxCopy();
  const groupCopy = useGroupCopy({ enabled: true });

  const listEnabled = source === 'server' && countedRows.length > 0;
  const listQuery = usePersonalList(
    { from: period.from, to: period.to, groups: 'show' },
    { enabled: listEnabled, groups: true },
  );

  const walletsById = useMemo(
    () => new Map(wallets.map((w) => [w.id, w])),
    [wallets],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const items = useMemo<DisplayItem[]>(() => {
    if (countedRows.length === 0) return [];
    const tagNameById = new Map(tags.map((tg) => [tg.id, tg.name]));

    const entryById = new Map<string, EntryView>();
    const groupById = new Map<string, GroupRow>();

    if (source === 'copy') {
      if (txCopy.snapshot) {
        for (const e of txCopy.snapshot.entries) {
          entryById.set(e.id, hydrateEntryView(e, walletsById, tagNameById));
        }
      }
      if (groupCopy.snapshot) {
        for (const g of groupCopy.snapshot.rows) {
          groupById.set(g.id, g);
        }
      }
    } else if (listQuery.data) {
      for (const r of listQuery.data.rows) {
        if (r.kind === 'entry') {
          entryById.set(r.entry.id, r.entry);
        }
      }
      for (const g of listQuery.data.groupRows ?? []) {
        groupById.set(g.id, g);
      }
    }

    const result: DisplayItem[] = [];
    for (const row of countedRows) {
      if (row.kind === 'group') {
        const g = groupById.get(row.id);
        if (g) {
          result.push({ kind: 'book', key: `group-${g.id}`, date: g.date, row: g });
        } else {
          result.push({ kind: 'static', key: `static-group-${row.id}`, date: row.date, row });
        }
      } else {
        const entry = entryById.get(row.id);
        if (entry) {
          result.push({
            kind: 'book',
            key: `entry-${entry.id}`,
            date: entry.date,
            row: { kind: 'entry', entry },
          });
        } else {
          result.push({ kind: 'static', key: `static-entry-${row.id}`, date: row.date, row });
        }
      }
    }

    return result.sort((a, b) => {
      if (a.kind === 'book' && b.kind === 'book') {
        return compareBookRows(a.row, b.row);
      }
      if (a.date !== b.date) return a.date > b.date ? -1 : 1;
      return a.key.localeCompare(b.key);
    });
  }, [
    countedRows,
    walletsById,
    tags,
    source,
    txCopy.snapshot,
    groupCopy.snapshot,
    listQuery.data,
  ]);

  const allTxHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('from', period.from);
    params.set('to', period.to);
    if (def.target.kind === 'category') {
      params.set('categoryId', def.target.categoryId);
    } else {
      params.set('tagId', def.target.tagId);
    }
    return `/transactions?${params.toString()}`;
  }, [def, period]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="m-0 text-sm font-semibold text-muted-foreground">
            {t('budgets.periodTx', { count: countedRows.length })}
          </h2>
          <Link
            to={allTxHref}
            data-testid="budget-tx-see-all"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-2 -my-2 -mr-2 no-underline"
          >
            {t('budgets.seeAll')}
          </Link>
        </div>

        {countedRows.length === 0 ? (
          <p className="m-0 px-1 text-sm text-muted-foreground">
            {t('budgets.noTxInPeriod')}
          </p>
        ) : (
          <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
            {items.map((item) =>
              item.kind === 'book' ? (
                <TransactionRow
                  key={item.key}
                  row={item.row}
                  wallets={wallets}
                  categories={categories}
                  assets={assets}
                  settings={groupSettings}
                  showDate
                  onOpenEntry={setSelectedEntry}
                  onOpenGroup={setSelectedGroupRow}
                />
              ) : (
                <StaticSpendRow
                  key={item.key}
                  row={item.row}
                  categoriesById={categoriesById}
                  wallets={wallets}
                  walletsById={walletsById}
                />
              ),
            )}
          </div>
        )}
      </section>

      <Sheet
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={t('transactions.detailTitle')}
      >
        {selectedEntry && (
          <TransactionDetailContent
            entry={selectedEntry}
            wallets={wallets}
            categories={categories}
            assets={assets}
            onDone={() => setSelectedEntry(null)}
          />
        )}
      </Sheet>
      <GroupRowSheet
        row={selectedGroupRow}
        open={selectedGroupRow !== null}
        onClose={() => setSelectedGroupRow(null)}
      />
    </>
  );
}
