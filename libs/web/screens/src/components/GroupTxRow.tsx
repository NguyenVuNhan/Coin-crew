import type { JSX } from 'react';
import {
  createGroupWalletResolver,
  formatMoney,
  groupRowCategoryId,
  groupRowEffect,
  type CategoryView,
  type GroupRow,
  type GroupSettingsView,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { Pill } from '@cc/web-ui/components/Pill';
import { cn } from '@cc/web-ui/lib/utils';

import { categoryIconName } from './categoryIcon';
import { ROW_BASE_CLASS } from './TransactionRow';
import { formatCompactRowDate, shouldShowWalletName } from './transactions/rowHelpers';

const DEFAULT_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

export interface GroupTxRowProps {
  row: GroupRow;
  wallets?: WalletDetailView[];
  categories?: CategoryView[];
  settings?: GroupSettingsView;
  showDate?: boolean;
  showBeforeStartCue?: boolean;
  hideWalletName?: boolean;
  onOpen?: (row: GroupRow) => void;
}

export function GroupTxRow({
  row,
  wallets = [],
  categories = [],
  settings = DEFAULT_SETTINGS,
  showDate = false,
  showBeforeStartCue = true,
  hideWalletName = false,
  onOpen,
}: GroupTxRowProps): JSX.Element {
  const t = useT();

  const categoryId = groupRowCategoryId(row, settings, null);
  const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
  const iconName: IconName =
    row.source === 'payment'
      ? 'swap'
      : category
        ? categoryIconName(category.icon, 'expense')
        : 'users';

  const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? null;
  const resolveWalletId = createGroupWalletResolver(wallets, defaultWalletId);
  const resolvedWalletId = resolveWalletId(row);
  const resolvedWallet = resolvedWalletId
    ? wallets.find((w) => w.id === resolvedWalletId)
    : undefined;
  const walletName = resolvedWallet?.name ?? '';
  const beforeStart = resolvedWallet !== undefined && row.date < resolvedWallet.startDate;
  const showWallet = Boolean(
    walletName && shouldShowWalletName(wallets, resolvedWallet, hideWalletName),
  );

  const counterpart = row.counterpartName ?? '';
  const title =
    row.source === 'payment'
      ? row.iPaid
        ? t('groupRow.paymentTo', { name: counterpart })
        : t('groupRow.paymentFrom', { name: counterpart })
      : row.title;

  const tripLabel = row.isDirect ? t('transactions.typePerson') : row.tripName;

  const metaParts: string[] = [];
  if (showDate) {
    metaParts.push(formatCompactRowDate(row.date, t));
  }
  metaParts.push(tripLabel);
  if (row.pending) {
    metaParts.push(t('groupRow.pendingShort'));
  } else if (row.source === 'fund') {
    metaParts.push(t('groupRow.fund'));
  } else if (row.source === 'payment') {
    metaParts.push(
      row.iPaid ? t('groupRow.paymentOutMeta') : t('groupRow.paymentInMeta'),
    );
  } else {
    if (row.iPaid) {
      const rest = row.total - row.myShare;
      if (rest > 0) {
        metaParts.push(
          t('groupRow.youPaidShort', {
            total: formatMoney(row.total, 'VND'),
          }),
        );
      }
    } else if (row.payerName) {
      metaParts.push(t('groupRow.paidBy', { name: row.payerName }));
    }
  }
  if (showWallet) {
    metaParts.push(walletName);
  }
  if (beforeStart && showBeforeStartCue) {
    metaParts.push(t('wallet.beforeStart'));
  }

  const eff = groupRowEffect(row, settings);
  let displayAmount: number;
  let sign = '';
  let amountToneClass = 'text-foreground';

  if (row.pending) {
    displayAmount = row.source === 'expense' && row.myShare > 0 ? row.myShare : row.total;
    amountToneClass = 'text-muted-foreground';
  } else if (eff.spending > 0) {
    displayAmount = eff.spending;
    sign = '\u2212';
    amountToneClass = 'text-danger';
  } else if (eff.income > 0) {
    displayAmount = eff.income;
    sign = '+';
    amountToneClass = 'text-success';
  } else {
    displayAmount =
      eff.walletDelta !== 0
        ? Math.abs(eff.walletDelta)
        : row.source === 'expense' && row.myShare > 0
          ? row.myShare
          : row.total;
    sign = eff.walletDelta > 0 ? '+' : eff.walletDelta < 0 ? '\u2212' : '';
    amountToneClass = 'text-foreground';
  }

  const showYourShare =
    !row.pending &&
    row.source === 'expense' &&
    row.myShare > 0 &&
    row.total !== row.myShare &&
    !(row.link?.intent === 'loan' && row.iPaid);

  const amountText = `${sign}${formatMoney(Math.abs(displayAmount), 'VND')}`;
  const ariaLabel = [
    title,
    amountText,
    showYourShare ? t('groupRow.yourShare') : '',
    row.pending ? t('history.notApproved') : '',
    ...metaParts,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <button
      type="button"
      data-testid={`tx-row-g-${row.id}`}
      aria-label={ariaLabel}
      onClick={() => onOpen?.(row)}
      className={cn(ROW_BASE_CLASS, 'fsl-tx-row--group')}
    >
      <span
        aria-hidden="true"
        className="size-10 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
      >
        <Icon name={iconName} size={18} />
      </span>
      <div className="min-w-0 flex-1 overflow-hidden flex flex-col gap-0.5">
        <span
          className={cn(
            'text-sm font-semibold truncate',
            row.pending ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {title}
        </span>
        {metaParts.length > 0 && (
          <span className="text-xs text-muted-foreground truncate">
            {metaParts.join(' · ')}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span
          className={cn(
            'fsl-tx-row__amount text-sm font-semibold tabular-nums whitespace-nowrap',
            amountToneClass,
          )}
        >
          {`${sign}${formatMoney(Math.abs(displayAmount), 'VND')}`}
        </span>
        {row.pending && (
          <Pill tone="warning" className="px-2 py-0.5 text-xs">
            {t('history.notApproved')}
          </Pill>
        )}
        {showYourShare && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {t('groupRow.yourShare')}
          </span>
        )}
      </div>
    </button>
  );
}
