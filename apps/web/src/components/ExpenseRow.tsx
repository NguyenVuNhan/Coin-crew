import { Link } from 'react-router';
import { formatVnd, isFundPaid, type ExpenseView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf, splitText } from '../lib/tripText';
import { Amount } from './Amount';
import { Pill } from './Pill';
import './ExpenseRow.css';

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

  const rowClasses = [
    'fsl-expense-row',
    href ? 'fsl-expense-row--interactive' : '',
    isDisabled ? 'fsl-expense-row--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <div className="fsl-expense-row__info">
        <div
          className="fsl-expense-row__desc"
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
        >
          {expense.description}
        </div>
        <div className="fsl-expense-row__sub">{subline}</div>
        {isRejected && expense.rejectReason && (
          <div className="fsl-expense-row__extra fsl-expense-row__extra--danger">
            {t('expense.rejectedBecause', { reason: expense.rejectReason })}
          </div>
        )}
        {isDisabled && expense.disabledByName && (
          <div className="fsl-expense-row__extra">
            {t('expenses.disabledBy', { name: expense.disabledByName })}
          </div>
        )}
      </div>

      <div className="fsl-expense-row__right">
        <Amount
          value={amount}
          style={isDisabled ? { textDecoration: 'line-through' } : undefined}
          className={[
            isDisabled ? 'fsl-expense-row__amount--disabled' : '',
            isFundPaid(expense) ? 'fsl-expense-row__amount--fund' : '',
            amount === 0 ? 'fsl-expense-row__amount--none' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {isPending && (
          <div className="fsl-expense-row__status">
            <Pill tone="warning">{t('status.waiting')}</Pill>
          </div>
        )}
        {isRejected && (
          <div className="fsl-expense-row__status">
            <Pill tone="danger">{t('status.rejected')}</Pill>
          </div>
        )}
        {isDisabled && (
          <div className="fsl-expense-row__status">
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
