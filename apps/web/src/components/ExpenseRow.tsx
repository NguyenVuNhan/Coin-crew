import { Link } from 'react-router';
import type { ExpenseView, TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf, splitText } from '../lib/tripText';
import { Amount } from './Amount';
import { Pill } from './Pill';
import './ExpenseRow.css';

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

  const isMe =
    view.me.participantId !== null &&
    expense.payerId === view.me.participantId;
  const payerText = isMe
    ? t('expense.youPaid')
    : t('expense.personPaid', { name: nameOf(view, expense.payerId) });

  const subline = `${payerText} · ${splitText(expense, t)}`;

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
        <div className="fsl-expense-row__desc">{expense.description}</div>
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
          value={expense.amount}
          className={isDisabled ? 'fsl-expense-row__amount--disabled' : ''}
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
