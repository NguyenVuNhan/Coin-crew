import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { formatVnd, type ExpenseView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { useTripAction } from '../lib/useTripAction';
import { expenseActions } from '../lib/rowActions';
import { SwipeGroupProvider } from '../lib/useSwipeReveal';
import { ActionRow } from './ActionRow';
import { ExpenseRow } from './ExpenseRow';
import { EmptyState } from './EmptyState';
import { InlineError } from './InlineError';
import './ExpenseList.css';

const STATUS: Record<'pending' | 'rejected' | 'disabled', MessageKey> = {
  pending: 'status.waiting',
  rejected: 'status.rejected',
  disabled: 'status.disabled',
};

function ExpenseItem({
  view,
  expense,
  selected,
  hintable,
  onOpen,
}: {
  view: TripView;
  expense: ExpenseView;
  selected: boolean;
  hintable: boolean;
  onOpen(): void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { busy, error, run } = useTripAction(view.trip.id);

  const guardedRun = (path: string, body?: unknown) => (busy ? Promise.resolve() : run(path, body));
  const actions = expenseActions(view, expense, { t, navigate, run: guardedRun });

  const label = [
    expense.description,
    formatVnd(expense.amount),
    expense.status === 'approved' ? null : t(STATUS[expense.status]),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <li className="fsl-expense-list__item">
      <ActionRow label={label} actions={actions} onOpen={onOpen} selected={selected} hintable={hintable}>
        <ExpenseRow expense={expense} view={view} />
      </ActionRow>
      {error ? <InlineError error={error} className="fsl-expense-list__error" /> : null}
    </li>
  );
}

/** The trip's expense list, with shortcut swipe and hover actions on each row. */
export function ExpenseList({
  view,
  selectedId,
  onOpen,
  hintable = false,
  add,
  addInHeading = false,
}: {
  view: TripView;
  selectedId?: string;
  onOpen(id: string): void;
  hintable?: boolean;
  add?: ReactNode;
  addInHeading?: boolean;
}) {
  const t = useT();

  return (
    <section className="fsl-expense-list" aria-label={t('trip.expenses')}>
      <div className="fsl-expense-list__head">
        <h2 className="fsl-expense-list__heading">{t('trip.expenses')}</h2>
        {addInHeading && view.expenses.length > 0 ? add : null}
      </div>
      {view.expenses.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={t('expenses.emptyTitle')}
          body={t('expenses.emptyBody')}
          action={add ?? null}
        />
      ) : (
        <SwipeGroupProvider>
          <ul className="fsl-expense-list__rows">
            {view.expenses.map((e, i) => (
              <ExpenseItem
                key={e.id}
                view={view}
                expense={e}
                selected={e.id === selectedId}
                hintable={hintable && i === 0}
                onOpen={() => onOpen(e.id)}
              />
            ))}
          </ul>
        </SwipeGroupProvider>
      )}
    </section>
  );
}
