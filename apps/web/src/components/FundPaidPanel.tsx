import type { JSX } from 'react';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { Icon } from './icons';

/**
 * Stands in for the split section when an expense is paid from the group fund (spec §7.3): nobody owes a share.
 * `after` is the fund once saved (null until an amount is typed); `over` means the fund can't cover the expense.
 */
export function FundPaidPanel({ available, after, over }: { available: number; after: number | null; over: boolean }): JSX.Element {
  const t = useT();

  return (
    <div className="fsl-fund-paid flex flex-col gap-1 rounded-xl bg-secondary p-4 text-left text-secondary-foreground break-words shadow-xs">
      <p className="fsl-fund-paid__title m-0 flex items-center gap-2 text-base font-semibold text-secondary-foreground">
        <Icon name="piggyBank" size={20} className="fsl-fund-paid__icon shrink-0 text-secondary-foreground/80" />
        <span>{t('fund.paidTitle')}</span>
      </p>
      <p className="fsl-fund-paid__line m-0 text-sm text-secondary-foreground/85">{t('fund.noShares')}</p>
      {after !== null && !over && (
        <p className="fsl-fund-paid__line fsl-fund-paid__line--after m-0 text-sm tabular-nums text-secondary-foreground/85">{t('fund.after', { amount: formatVnd(after) })}</p>
      )}
      {over && (
        <p role="alert" className="fsl-fund-paid__over m-0 mt-1 text-sm font-semibold text-danger">{t('fund.overLimit', { amount: formatVnd(available) })}</p>
      )}
    </div>
  );
}
