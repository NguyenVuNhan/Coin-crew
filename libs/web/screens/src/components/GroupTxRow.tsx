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

const DEFAULT_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

export interface GroupTxRowProps {
  row: GroupRow;
  wallets?: WalletDetailView[];
  categories?: CategoryView[];
  settings?: GroupSettingsView;
  onOpen?: (row: GroupRow) => void;
}

export function GroupTxRow({
  row,
  wallets = [],
  categories = [],
  settings = DEFAULT_SETTINGS,
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

  const resolveWalletId = createGroupWalletResolver(wallets, null);
  const resolvedWalletId = resolveWalletId(row);
  const walletName = resolvedWalletId
    ? (wallets.find((w) => w.id === resolvedWalletId)?.name ?? '')
    : '';

  const counterpart = row.counterpartName ?? '';
  const title =
    row.source === 'payment'
      ? row.iPaid
        ? t('groupRow.paymentTo', { name: counterpart })
        : t('groupRow.paymentFrom', { name: counterpart })
      : row.title;

  const tripLabel = row.isDirect ? t('transactions.typePerson') : row.tripName;

  const metaParts: string[] = [];
  if (row.pending) {
    metaParts.push(t('groupRow.pending'));
  } else if (row.source === 'fund') {
    metaParts.push(t('groupRow.fund'));
    if (walletName) metaParts.push(walletName);
  } else if (row.source === 'payment') {
    metaParts.push(t('groupRow.payment'));
    if (walletName) metaParts.push(walletName);
  } else {
    if (row.iPaid) {
      const rest = row.total - row.myShare;
      if (rest > 0) {
        metaParts.push(
          t('groupRow.youPaid', {
            total: formatMoney(row.total, 'VND'),
            rest: formatMoney(rest, 'VND'),
          }),
        );
      }
    } else if (row.payerName) {
      metaParts.push(t('groupRow.paidBy', { name: row.payerName }));
    }
    if (walletName) metaParts.push(walletName);
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

  return (
    <button
      type="button"
      data-testid={`tx-row-g-${row.id}`}
      onClick={() => onOpen?.(row)}
      className={cn(ROW_BASE_CLASS, 'fsl-tx-row--group')}
    >
      <span
        aria-hidden="true"
        className="size-10 rounded-xl bg-secondary text-secondary-foreground grid place-items-center shrink-0"
      >
        <Icon name={iconName} size={18} />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'text-sm font-semibold truncate',
              row.pending ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {title}
          </span>
          <Pill tone="accent" className="text-[11px] px-2 py-0 shrink-0">
            {tripLabel}
          </Pill>
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
          {`${sign}${formatMoney(Math.abs(displayAmount), 'VND')}`}
        </span>
        {row.pending && (
          <Pill tone="warning" className="text-[11px] px-2 py-0 mt-0.5">
            {t('history.notApproved')}
          </Pill>
        )}
        {showYourShare && (
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {t('groupRow.yourShare')}
          </span>
        )}
      </div>
    </button>
  );
}
