import { formatVnd, type IncomeView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { Pill } from './Pill';
import './IncomeRow.css';

export interface IncomeRowProps {
  income: IncomeView;
  view: TripView;
  className?: string;
}

export function IncomeRow({ income, view, className = '' }: IncomeRowProps) {
  const t = useT();

  const isDisabled = income.status === 'disabled';

  const subline =
    income.addedById === view.me.participantId
      ? t('fund.rowIncomeMe')
      : t('fund.rowIncome', { name: nameOf(view, income.addedById) });

  const rowClasses = [
    'fsl-income-row',
    isDisabled ? 'fsl-income-row--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClasses}>
      <div className="fsl-income-row__info">
        <div
          className="fsl-income-row__desc"
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
        >
          {income.description}
        </div>
        <div className="fsl-income-row__sub">{subline}</div>
        {isDisabled && income.disabledByName && (
          <div className="fsl-income-row__extra">
            {t('expenses.disabledBy', { name: income.disabledByName })}
          </div>
        )}
      </div>

      <div className="fsl-income-row__right">
        <span
          className={[
            'fsl-income-row__amount',
            isDisabled ? 'fsl-income-row__amount--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
        >
          +{formatVnd(income.amount)}
        </span>
        {isDisabled && (
          <div className="fsl-income-row__status">
            <Pill tone="neutral">{t('status.disabled')}</Pill>
          </div>
        )}
      </div>
    </div>
  );
}
