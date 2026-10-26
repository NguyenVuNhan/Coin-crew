import type { JSX } from 'react';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { Icon } from './icons';
import './FundPaidPanel.css';

/**
 * Stands in for the split section when an expense is paid from the group fund (spec §7.3): nobody owes a share.
 * `after` is the fund once saved (null until an amount is typed); `over` means the fund can't cover the expense.
 */
export function FundPaidPanel({ available, after, over }: { available: number; after: number | null; over: boolean }): JSX.Element {
  const t = useT();

  return (
    <div className="fsl-fund-paid">
      <p className="fsl-fund-paid__title">
        <Icon name="piggyBank" size={20} className="fsl-fund-paid__icon" />
        <span>{t('fund.paidTitle')}</span>
      </p>
      <p className="fsl-fund-paid__line">{t('fund.noShares')}</p>
      {after !== null && !over && (
        <p className="fsl-fund-paid__line fsl-fund-paid__line--after">{t('fund.after', { amount: formatVnd(after) })}</p>
      )}
      {over && (
        <p role="alert" className="fsl-fund-paid__over">{t('fund.overLimit', { amount: formatVnd(available) })}</p>
      )}
    </div>
  );
}
