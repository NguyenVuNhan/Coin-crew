import { Link } from 'react-router';
import { formatVnd, isFundPaid, type ExpenseView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf, splitText } from '../lib/tripText';
import { cn } from '@/lib/utils';
import { Amount } from './Amount';
import { Icon } from './icons';
import { Pill } from './Pill';

export function rowAmount(expense: ExpenseView, view: TripView): number {
  const me = view.me.participantId;
  if (me === null || isFundPaid(expense)) {
    return expense.amount;
  }
  return expense.shares.find((s) => s.participantId === me)?.amount ?? 0;
}

export interface ExpenseRowProps {
  expense: ExpenseView;
  view: TripView;
  href?: string;
  className?: string;
}

export function ExpenseRow({
  expense,
  view,
  href,
  className = '',
}: ExpenseRowProps) {
  const t = useT();

  const me = view.me.participantId;
  const amount = rowAmount(expense, view);
  const isMe = me !== null && expense.payerId === me;
  const payerText =
    me !== null
      ? isMe
        ? t('expense.youPaidTotal', { amount: formatVnd(expense.amount) })
        : t('expense.personPaidTotal', {
            name: nameOf(view, expense.payerId),
            amount: formatVnd(expense.amount),
          })
      : isMe
        ? t('expense.youPaid')
        : t('expense.personPaid', { name: nameOf(view, expense.payerId) });

  const subline = isFundPaid(expense) ? t('fund.rowPaid') : `${payerText} · ${splitText(expense, t)}`;

  const isDisabled = expense.status === 'disabled';
  const isPending = expense.status === 'pending';
  const isRejected = expense.status === 'rejected';

  const rowClasses = cn(
    'fsl-expense-row flex-1 min-w-0 flex items-center gap-3 text-foreground',
    href && 'fsl-expense-row--interactive px-4 py-3 min-h-11 cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    isDisabled && 'fsl-expense-row--disabled text-muted-foreground',
    className,
  );

  const content = (
    <>
      <div
        className={cn(
          'size-[38px] rounded-xl flex items-center justify-center shrink-0',
          isDisabled ? 'bg-muted text-muted-foreground' : 'bg-secondary text-secondary-foreground',
        )}
        aria-hidden="true"
      >
        <Icon name="receipt" size={20} />
      </div>

      <div className="fsl-expense-row__info min-w-0 flex-1 flex flex-col gap-0.5">
        <div
          className={cn(
            'fsl-expense-row__desc truncate font-semibold text-base',
            isDisabled && 'line-through text-muted-foreground',
          )}
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
        >
          {expense.description}
        </div>
        <div className="fsl-expense-row__sub text-sm text-muted-foreground">{subline}</div>
        {isRejected && expense.rejectReason && (
          <div className="fsl-expense-row__extra fsl-expense-row__extra--danger text-xs text-danger">
            {t('expense.rejectedBecause', { reason: expense.rejectReason })}
          </div>
        )}
        {isDisabled && expense.disabledByName && (
          <div className="fsl-expense-row__extra text-xs text-muted-foreground">
            {t('expenses.disabledBy', { name: expense.disabledByName })}
          </div>
        )}
      </div>

      <div className="fsl-expense-row__right shrink-0 text-right flex flex-col items-end gap-1">
        <Amount
          value={amount}
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
          className={cn(
            isDisabled && 'fsl-expense-row__amount--disabled line-through text-muted-foreground',
            isFundPaid(expense) && 'fsl-expense-row__amount--fund text-muted-foreground',
            amount === 0 && 'fsl-expense-row__amount--none text-muted-foreground',
          )}
        />
        {isPending && (
          <div className="fsl-expense-row__status flex justify-end">
            <Pill tone="warning">{t('status.waiting')}</Pill>
          </div>
        )}
        {isRejected && (
          <div className="fsl-expense-row__status flex justify-end">
            <Pill tone="danger">{t('status.rejected')}</Pill>
          </div>
        )}
        {isDisabled && (
          <div className="fsl-expense-row__status flex justify-end">
            <Pill tone="neutral">{t('status.disabled')}</Pill>
          </div>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link to={href} className={rowClasses}>
        {content}
      </Link>
    );
  }

  return <div className={rowClasses}>{content}</div>;
}
