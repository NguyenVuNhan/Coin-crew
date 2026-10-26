import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { formatVnd, type ExpenseView, type IncomeView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { useListMode } from '../lib/useListMode';
import { useTripAction } from '../lib/useTripAction';
import { expenseActions, incomeActions } from '../lib/rowActions';
import { fundOf, incomeMinimum, mergeFeed } from '../lib/fund';
import { SwipeGroupProvider } from '../lib/useSwipeReveal';
import { ApiClientError } from '../api/client';
import { ActionRow } from './ActionRow';
import { ExpenseRow, rowAmount } from './ExpenseRow';
import { EmptyState } from './EmptyState';
import { IncomeRow } from './IncomeRow';
import { InlineError } from './InlineError';
import { ListModeChip } from './ListModeChip';
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

  const amount = rowAmount(expense, view);
  const label = [
    expense.description,
    formatVnd(amount),
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

function IncomeItem({
  view,
  income,
  hintable,
  onOpen,
}: {
  view: TripView;
  income: IncomeView;
  hintable: boolean;
  onOpen(): void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { busy, error, run } = useTripAction(view.trip.id);

  const guardedRun = (path: string, body?: unknown) => (busy ? Promise.resolve() : run(path, body));
  const actions = incomeActions(view, income, { t, navigate, run: guardedRun });
  const label = [
    income.description,
    `+${formatVnd(income.amount)}`,
    income.status === 'approved' ? null : t(STATUS[income.status]),
  ]
    .filter(Boolean)
    .join(', ');

  // A Disable the fund can't cover says how much is already spent, as the details do (only Disable lowers the fund
  // here). InlineError shows our own message for a validation error.
  const spent = incomeMinimum(view, income);
  const shown =
    error instanceof ApiClientError && error.code === 'FUND_SHORT' && spent > 0
      ? { code: 'VALIDATION', message: t('fund.cantDisable', { amount: formatVnd(spent) }) }
      : error;

  return (
    <li className="fsl-expense-list__item">
      <ActionRow label={label} actions={actions} onOpen={onOpen} hintable={hintable}>
        <IncomeRow income={income} view={view} />
      </ActionRow>
      {shown ? <InlineError error={shown} className="fsl-expense-list__error" /> : null}
    </li>
  );
}

/** The trip's expense list, with shortcut swipe and hover actions on each row. */
export function ExpenseList({
  view,
  selectedId,
  onOpen,
  onOpenIncome,
  hintable = false,
  add,
  addInHeading = false,
}: {
  view: TripView;
  selectedId?: string;
  onOpen(id: string): void;
  onOpenIncome?(id: string): void;
  hintable?: boolean;
  add?: ReactNode;
  addInHeading?: boolean;
}) {
  const t = useT();
  const [mode, toggle] = useListMode('fsl.expenses.mode');
  const me = view.me.participantId;
  const effective = me === null ? null : mode;
  const involves = (e: ExpenseView) => e.payerId === me || e.createdById === me || e.shares.some((s) => s.participantId === me);
  const feed = mergeFeed(view.expenses, fundOf(view)?.incomes ?? []);
  const rows =
    effective === 'mine'
      ? feed.filter((f) => (f.kind === 'expense' ? involves(f.item) : f.item.addedById === me || f.item.createdById === me))
      : feed;
  const title = effective === null ? t('trip.expenses') : effective === 'mine' ? t('expenses.mine') : t('expenses.all');

  return (
    <section className="fsl-expense-list" aria-label={title}>
      <div className="fsl-expense-list__head">
        <h2 className="fsl-expense-list__heading">{title}</h2>
        {feed.length > 0 && (effective !== null || addInHeading) ? (
          <span className="fsl-expense-list__actions">
            {effective !== null && <ListModeChip mode={effective} onToggle={toggle} />}
            {addInHeading ? add : null}
          </span>
        ) : null}
      </div>
      {feed.length === 0 ? (
        // Nobody can add here (a view-only link, an archived trip): no invitation to add the first expense.
        <EmptyState
          icon="receipt"
          title={add ? t('expenses.emptyTitle') : t('expenses.emptyViewer')}
          body={add ? t('expenses.emptyBody') : undefined}
          action={add ?? null}
        />
      ) : rows.length === 0 ? (
        <p className="fsl-expense-list__empty">{t('expenses.emptyMine')}</p>
      ) : (
        <SwipeGroupProvider>
          <ul className="fsl-expense-list__rows">
            {rows.map((f, i) =>
              f.kind === 'expense' ? (
                <ExpenseItem
                  key={f.item.id}
                  view={view}
                  expense={f.item}
                  selected={f.item.id === selectedId}
                  hintable={hintable && i === 0}
                  onOpen={() => onOpen(f.item.id)}
                />
              ) : (
                <IncomeItem
                  key={f.item.id}
                  view={view}
                  income={f.item}
                  hintable={hintable && i === 0}
                  onOpen={() => onOpenIncome?.(f.item.id)}
                />
              ),
            )}
          </ul>
        </SwipeGroupProvider>
      )}
    </section>
  );
}

