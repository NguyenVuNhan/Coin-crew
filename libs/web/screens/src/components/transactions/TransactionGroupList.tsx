import { useMemo, type JSX } from 'react';
import type {
  AssetView,
  CategoryView,
  EntryView,
  GroupRow,
  GroupSettingsView,
  WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { TransactionRow } from '../TransactionRow';
import { CurrencyNetList, rowKey, type RowGroup } from './groupRows';
import { formatShortCalendarDate, resolveSingleBoundaryWallet } from './rowHelpers';

const DEFAULT_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

export interface TransactionGroupListProps {
  groups: RowGroup[];
  viewMode: 'day' | 'category';
  wallets: WalletDetailView[];
  categories: CategoryView[];
  assets: AssetView[];
  settings?: GroupSettingsView;
  headingLevel?: 'h2' | 'h3';
  suppressBoundaryDivider?: boolean;
  onOpenEntry?: (entry: EntryView) => void;
  onOpenGroup?: (row: GroupRow) => void;
}

export function TransactionGroupList({
  groups,
  viewMode,
  wallets,
  categories,
  assets,
  settings = DEFAULT_SETTINGS,
  headingLevel = 'h2',
  suppressBoundaryDivider = false,
  onOpenEntry,
  onOpenGroup,
}: TransactionGroupListProps): JSX.Element {
  const t = useT();
  const Heading = headingLevel;

  const boundaryWallet = useMemo(() => {
    if (viewMode !== 'day') return null;
    const allRows = groups.flatMap((g) => g.rows);
    return resolveSingleBoundaryWallet(wallets, allRows);
  }, [groups, viewMode, wallets]);

  let dividerRendered = false;

  return (
    <>
      {groups.map((group) => {
        const isBeforeBoundary = Boolean(
          boundaryWallet && viewMode === 'day' && group.id < boundaryWallet.startDate,
        );
        const showDividerHere =
          isBeforeBoundary && !dividerRendered && !suppressBoundaryDivider;
        if (showDividerHere) {
          dividerRendered = true;
        }
        const showBeforeStartCue = !isBeforeBoundary;

        return (
          <div key={group.id} className="contents">
            {showDividerHere && boundaryWallet && (
              <div
                data-testid="tx-before-start-divider"
                className="fsl-tx-boundary flex items-center gap-2 px-1 py-1"
              >
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground text-center">
                  {t('transactions.beforeStartDivider', {
                    wallet: boundaryWallet.name,
                    date: formatShortCalendarDate(boundaryWallet.startDate),
                  })}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </div>
            )}
            <section
              data-testid={`tx-group-${group.id}`}
              className="fsl-tx-group flex flex-col gap-1.5"
            >
              <div className="fsl-tx-group__header flex items-center justify-between gap-2 px-1">
                <Heading className="m-0 text-sm font-semibold text-muted-foreground">
                  {group.title}
                </Heading>
                <CurrencyNetList
                  nets={group.nets}
                  hasExcludedMovements={group.hasExcludedMovements}
                />
              </div>
              <div className="bg-card rounded-xl overflow-hidden divide-y divide-border">
                {group.rows.map((row) => (
                  <TransactionRow
                    key={rowKey(row)}
                    row={row}
                    wallets={wallets}
                    categories={categories}
                    assets={assets}
                    settings={settings}
                    showDate={viewMode === 'category'}
                    showBeforeStartCue={showBeforeStartCue}
                    titleMode={viewMode === 'category' ? 'detail' : 'category'}
                    onOpenEntry={onOpenEntry}
                    onOpenGroup={onOpenGroup}
                  />
                ))}
              </div>
            </section>
          </div>
        );
      })}
    </>
  );
}
