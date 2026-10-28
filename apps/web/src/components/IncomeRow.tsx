import { formatVnd, type IncomeView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { cn } from '@/lib/utils';
import { Icon } from './icons';
import { Pill } from './Pill';

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

  const rowClasses = cn(
    'fsl-income-row flex-1 min-w-0 flex items-center gap-3 text-foreground',
    isDisabled && 'fsl-income-row--disabled text-muted-foreground',
    className,
  );

  return (
    <div className={rowClasses}>
      <div
        className={cn(
          'size-[38px] rounded-xl flex items-center justify-center shrink-0',
          isDisabled ? 'bg-muted text-muted-foreground' : 'bg-secondary text-secondary-foreground',
        )}
        aria-hidden="true"
      >
        <Icon name="piggyBank" size={20} />
      </div>

      <div className="fsl-income-row__info min-w-0 flex-1 flex flex-col gap-0.5">
        <div
          className={cn(
            'fsl-income-row__desc truncate font-semibold text-base',
            isDisabled && 'line-through text-muted-foreground',
          )}
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
        >
          {income.description}
        </div>
        <div className="fsl-income-row__sub text-sm text-muted-foreground">{subline}</div>
        {isDisabled && income.disabledByName && (
          <div className="fsl-income-row__extra text-xs text-muted-foreground">
            {t('expenses.disabledBy', { name: income.disabledByName })}
          </div>
        )}
      </div>

      <div className="fsl-income-row__right shrink-0 text-right flex flex-col items-end gap-1">
        <span
          className={cn(
            'fsl-income-row__amount inline-block whitespace-nowrap tabular-nums font-semibold text-success',
            isDisabled && 'fsl-income-row__amount--disabled line-through text-muted-foreground',
          )}
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
        >
          +{formatVnd(income.amount)}
        </span>
        {isDisabled && (
          <div className="fsl-income-row__status flex justify-end">
            <Pill tone="neutral">{t('status.disabled')}</Pill>
          </div>
        )}
      </div>
    </div>
  );
}
