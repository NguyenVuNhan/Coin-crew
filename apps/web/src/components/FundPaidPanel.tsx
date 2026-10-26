import type { JSX } from 'react';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { Icon } from './icons';
import './FundPaidPanel.css';

/** Stands in for the split section when an expense is paid from the group fund (spec §7.3): nobody owes a share. */
export function FundPaidPanel({ available, amount }: { available: number; amount: number | null }): JSX.Element {
  const t = useT();
  const over = amount !== null && amount > available;

  return (
    <div className="fsl-fund-paid">
      <p className="fsl-fund-paid__title">
        <Icon name="piggyBank" size={20} className="fsl-fund-paid__icon" />
        <span>{t('fund.paidTitle')}</span>
      </p>
      <p className="fsl-fund-paid__line">{t('fund.noShares')}</p>
      {amount !== null && !over && (
        <p className="fsl-fund-paid__line fsl-fund-paid__line--after">{t('fund.after', { amount: formatVnd(available - amount) })}</p>
      )}
      {over && (
        <p role="alert" className="fsl-fund-paid__over">{t('fund.overLimit', { amount: formatVnd(available) })}</p>
      )}
    </div>
  );
}
