import type { JSX } from 'react';
import { Link } from 'react-router';
import {
  formatMoney,
  type CategoryView,
  type EntryView,
  type ListRow,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { Pill } from '@cc/web-ui/components/Pill';
import { cn } from '@cc/web-ui/lib/utils';
import { ledgerDetailsPath } from '../lib/detailsNav';

const KNOWN_ICON_MAP: Record<string, IconName> = {
  home: 'home',
  wallet: 'wallet',
  receipt: 'receipt',
  bank: 'bank',
  landmark: 'bank',
  pie: 'pie',
  'pie-chart': 'pie',
  piggyBank: 'piggyBank',
  'piggy-bank': 'piggyBank',
  users: 'users',
  user: 'user',
  calendar: 'calendar',
  clock: 'clock',
  star: 'star',
  crown: 'crown',
  trophy: 'trophy',
  shield: 'shield',
  swap: 'swap',
  camera: 'camera',
  smartphone: 'smartphone',
  settings: 'settings',
  map: 'map',
  suitcase: 'suitcase',
  bell: 'bell',
  palette: 'palette',
};

export function resolveCategoryIcon(
  icon: string | undefined,
  type: 'expense' | 'income',
): IconName {
  if (icon && KNOWN_ICON_MAP[icon]) {
    return KNOWN_ICON_MAP[icon];
  }
  return type === 'income' ? 'wallet' : 'receipt';
}

export interface TransactionRowProps {
  row: ListRow;
  categories?: CategoryView[];
  wallets?: WalletDetailView[];
  onOpenEntry?: (entry: EntryView) => void;
}

const ROW_BASE_CLASS =
  'fsl-tx-row w-full text-left flex items-center gap-3 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0';

export function TransactionRow({
  row,
  categories = [],
  wallets = [],
  onOpenEntry,
}: TransactionRowProps): JSX.Element {
  const t = useT();
  const walletMap = new Map(wallets.map((w) => [w.id, w.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  if (row.kind === 'person') {
    const walletName = walletMap.get(row.walletId) ?? '';
    const metaParts = [row.note, walletName, t('transactions.yourShare')].filter(Boolean);
    const title = t('transactions.withPeople', { names: row.people.join(', ') });
    const href = ledgerDetailsPath(row.tripId, 'expense', row.id);

    return (
      <Link
        to={href}
        data-testid={`tx-row-${row.id}`}
        className={cn(ROW_BASE_CLASS, 'no-underline')}
      >
        <span
          aria-hidden="true"
          className="size-10 rounded-xl bg-secondary text-secondary-foreground grid place-items-center shrink-0"
        >
          <Icon name="users" size={18} />
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {metaParts.length > 0 && (
            <span className="text-xs text-muted-foreground truncate">
              {metaParts.join(' · ')}
            </span>
          )}
        </div>
        <span className="fsl-tx-row__amount text-sm font-semibold tabular-nums whitespace-nowrap text-danger shrink-0">
          {`\u2212${formatMoney(Math.abs(row.share), row.currency)}`}
        </span>
      </Link>
    );
  }

  const entry = row.entry;
  const isTransfer = entry.type === 'transfer_in' || entry.type === 'transfer_out';
  const isExpense = entry.type === 'expense';
  const category = entry.categoryId ? categoryMap.get(entry.categoryId) : undefined;
  const walletName = walletMap.get(entry.walletId) ?? '';
  const counterpartName = entry.counterpartWalletId
    ? walletMap.get(entry.counterpartWalletId) ?? ''
    : '';

  const title = isTransfer
    ? t('personalEntry.transfer')
    : category?.name ??
      (isExpense ? t('personalEntry.expense') : t('personalEntry.income'));

  const iconName: IconName = isTransfer
    ? 'swap'
    : resolveCategoryIcon(category?.icon, isExpense ? 'expense' : 'income');

  const tagText = entry.tags.length > 0 ? entry.tags.map((tag) => `#${tag}`).join(' ') : '';
  const metaParts = [entry.note ?? '', walletName, tagText].filter(Boolean);

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

  const content = (
    <>
      <span
        aria-hidden="true"
        className="size-10 rounded-xl bg-secondary text-secondary-foreground grid place-items-center shrink-0"
      >
        <Icon name={iconName} size={18} />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {entry.beforeStart && (
            <Pill tone="neutral" className="text-[11px] px-2 py-0 shrink-0">
              {t('wallet.beforeStart')}
            </Pill>
          )}
        </div>
        {metaParts.length > 0 && (
          <span className="text-xs text-muted-foreground truncate">
            {metaParts.join(' · ')}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span
          className={cn(
            'fsl-tx-row__amount text-sm font-semibold tabular-nums whitespace-nowrap',
            amountToneClass,
          )}
        >
          {signedText}
        </span>
        {isTransfer && counterpartName && (
          <span className="text-xs text-foreground tabular-nums whitespace-nowrap">
            {t('transactions.directionTo', { wallet: counterpartName })}
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
      className={cn(ROW_BASE_CLASS, 'no-underline')}
    >
      {content}
    </Link>
  );
}
