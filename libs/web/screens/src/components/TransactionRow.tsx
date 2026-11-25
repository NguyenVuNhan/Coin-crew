import type { JSX } from 'react';
import { Link } from 'react-router';
import {
  assetQuantityLabel,
  formatMoney,
  type AssetView,
  type BookRow,
  type CategoryView,
  type EntryView,
  type GroupRow,
  type GroupSettingsView,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { ledgerDetailsPath } from '../lib/detailsNav';

import { AssetIcon } from './AssetIcon';
import { categoryIconName } from './categoryIcon';
import { GroupTxRow } from './GroupTxRow';
import { formatCompactRowDate, shouldShowWalletName } from './transactions/rowHelpers';

export { categoryIconName as resolveCategoryIcon };

export interface TransactionRowProps {
  row: BookRow;
  categories?: CategoryView[];
  wallets?: WalletDetailView[];
  assets?: AssetView[];
  settings?: GroupSettingsView;
  showDate?: boolean;
  showBeforeStartCue?: boolean;
  hideWalletName?: boolean;
  titleMode?: 'category' | 'detail';
  onOpenEntry?: (entry: EntryView) => void;
  onOpenGroup?: (row: GroupRow) => void;
}

export const ROW_BASE_CLASS =
  'fsl-tx-row w-full text-left flex items-center gap-3 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0';

export function TransactionRow({
  row,
  categories = [],
  wallets = [],
  assets = [],
  settings,
  showDate = false,
  showBeforeStartCue = true,
  hideWalletName = false,
  titleMode = 'category',
  onOpenEntry,
  onOpenGroup,
}: TransactionRowProps): JSX.Element {
  const t = useT();
  if (row.kind === 'group') {
    return (
      <GroupTxRow
        row={row}
        wallets={wallets}
        categories={categories}
        settings={settings}
        showDate={showDate}
        showBeforeStartCue={showBeforeStartCue}
        hideWalletName={hideWalletName}
        onOpen={onOpenGroup}
      />
    );
  }
  const walletById = new Map(wallets.map((w) => [w.id, w]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  if (row.kind === 'person') {
    const personWallet = walletById.get(row.walletId);
    const walletName = personWallet?.name ?? '';
    const showWallet = Boolean(
      walletName && shouldShowWalletName(wallets, personWallet, hideWalletName),
    );
    const beforeStart =
      personWallet !== undefined && row.date < personWallet.startDate;
    const metaParts = [
      showDate ? formatCompactRowDate(row.date, t) : '',
      row.note,
      showWallet ? walletName : '',
      beforeStart && showBeforeStartCue ? t('wallet.beforeStart') : '',
    ].filter(Boolean);
    const title = t('transactions.withPeople', {
      names: row.people.join(', '),
    });
    const href = ledgerDetailsPath(row.tripId, 'expense', row.id);
    const amountText = `\u2212${formatMoney(Math.abs(row.share), row.currency)}`;
    const ariaLabel = [
      title,
      amountText,
      t('transactions.yourShare'),
      ...metaParts,
    ]
      .filter(Boolean)
      .join('. ');

    return (
      <Link
        to={href}
        data-testid={`tx-row-${row.id}`}
        aria-label={ariaLabel}
        className={cn(ROW_BASE_CLASS, 'no-underline')}
      >
        <span
          aria-hidden="true"
          className="size-10 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
        >
          <Icon name="users" size={18} />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {metaParts.length > 0 && (
            <span className="text-xs text-muted-foreground truncate">
              {metaParts.join(' · ')}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="fsl-tx-row__amount text-sm font-semibold tabular-nums whitespace-nowrap text-danger">
            {`\u2212${formatMoney(Math.abs(row.share), row.currency)}`}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {t('transactions.yourShare')}
          </span>
        </div>
      </Link>
    );
  }

  const entry = row.entry;
  const isTransfer = entry.type === 'transfer_in' || entry.type === 'transfer_out';
  const isTrade = entry.type === 'buy' || entry.type === 'sell';
  const isBuy = entry.type === 'buy';
  const isExpense = entry.type === 'expense';
  const category = entry.categoryId ? categoryMap.get(entry.categoryId) : undefined;
  const asset = entry.assetId ? assetMap.get(entry.assetId) : undefined;
  const assetName = asset?.name ?? entry.assetId ?? '';
  const entryWallet = walletById.get(entry.walletId);
  const walletName = entryWallet?.name ?? '';
  const showWallet = Boolean(
    walletName && shouldShowWalletName(wallets, entryWallet, hideWalletName),
  );
  const counterpartName = entry.counterpartWalletId
    ? walletById.get(entry.counterpartWalletId)?.name ?? ''
    : '';

  const trimmedNote = entry.note?.trim() ?? '';
  const genericEntryLabel = isExpense ? t('personalEntry.expense') : t('personalEntry.income');
  const isDetailStandard = titleMode === 'detail' && !isTransfer && !isTrade;
  const noteUsedAsTitle = isDetailStandard && Boolean(trimmedNote);
  const walletUsedAsTitle = isDetailStandard && !trimmedNote && Boolean(walletName);

  const title = isTransfer
    ? t('personalEntry.transfer')
    : isTrade
      ? isBuy
        ? t('transactions.buyAssetTitle', { asset: assetName })
        : t('transactions.sellAssetTitle', { asset: assetName })
      : isDetailStandard
        ? trimmedNote || walletName || genericEntryLabel
        : (category?.name ?? genericEntryLabel);

  const iconName: IconName = isTransfer
    ? 'swap'
    : isTrade
      ? 'trending-up'
      : categoryIconName(category?.icon, isExpense ? 'expense' : 'income');

  const datePart = showDate ? formatCompactRowDate(entry.date, t) : '';
  const beforeStartPart =
    entry.beforeStart && showBeforeStartCue ? t('wallet.beforeStart') : '';
  const tagText = entry.tags.length > 0 ? entry.tags.map((tag) => `#${tag}`).join(' ') : '';
  const qtyPart =
    isTrade && asset && entry.quantity != null
      ? assetQuantityLabel(entry.quantity, asset)
      : '';
  const metaParts = isTrade
    ? [
        datePart,
        qtyPart,
        showWallet ? walletName : '',
        entry.note ?? '',
        tagText,
        beforeStartPart,
      ].filter(Boolean)
    : [
        datePart,
        noteUsedAsTitle ? '' : (entry.note ?? ''),
        showWallet && !walletUsedAsTitle ? walletName : '',
        tagText,
        beforeStartPart,
      ].filter(Boolean);

  const formattedAmount = formatMoney(Math.abs(entry.amount), entry.currency);
  const signedText = isTransfer
    ? formattedAmount
    : isExpense
      ? `\u2212${formattedAmount}`
      : `+${formattedAmount}`;

  const amountToneClass = isTransfer
    ? 'text-foreground'
    : isExpense
      ? 'text-danger'
      : 'text-success';

  const directionText =
    isTransfer && counterpartName
      ? entry.type === 'transfer_in'
        ? t('transactions.directionFrom', { wallet: counterpartName })
        : t('transactions.directionTo', { wallet: counterpartName })
      : '';
  const ariaAmountText = isTrade
    ? `${isBuy ? '\u2212' : '+'}${formattedAmount}`
    : signedText;
  const ariaLabel = [title, ariaAmountText, directionText, ...metaParts]
    .filter(Boolean)
    .join('. ');

  const content = (
    <>
      {isTrade ? (
        <span aria-hidden="true" className="relative size-10 shrink-0">
          <AssetIcon
            asset={asset ?? { id: entry.assetId ?? entry.id, name: assetName }}
            size="md"
          />
          <span
            data-testid={isBuy ? 'trade-direction-buy' : 'trade-direction-sell'}
            className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-card ring-2 ring-card grid place-items-center text-foreground"
          >
            <Icon name={isBuy ? 'arrow-down-left' : 'arrow-up-right'} size={12} />
          </span>
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="size-10 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
        >
          <Icon name={iconName} size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1 overflow-hidden flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground truncate">{title}</span>
        {metaParts.length > 0 && (
          <span className="text-xs text-muted-foreground truncate">
            {metaParts.join(' · ')}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {isTrade ? (
          <span className="fsl-tx-row__amount inline-flex items-baseline text-sm font-semibold tabular-nums whitespace-nowrap text-foreground">
            <span>{isBuy ? '\u2212' : '+'}</span>
            <Amount value={Math.abs(entry.amount)} currency={entry.currency} tone="neutral" size="sm" />
          </span>
        ) : (
          <span
            className={cn(
              'fsl-tx-row__amount text-sm font-semibold tabular-nums whitespace-nowrap',
              amountToneClass,
            )}
          >
            {signedText}
          </span>
        )}
        {directionText && (
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap max-w-28 truncate">
            {directionText}
          </span>
        )}
      </div>
    </>
  );

  if (onOpenEntry) {
    return (
      <button
        type="button"
        data-testid={`tx-row-${entry.id}`}
        aria-label={ariaLabel}
        onClick={() => onOpenEntry(entry)}
        className={ROW_BASE_CLASS}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      to={`/entries/${encodeURIComponent(entry.id)}`}
      state={{ entry }}
      data-testid={`tx-row-${entry.id}`}
      aria-label={ariaLabel}
      className={cn(ROW_BASE_CLASS, 'no-underline')}
    >
      {content}
    </Link>
  );
}
