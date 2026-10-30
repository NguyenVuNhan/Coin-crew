import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExpenseHistoryItem, ExpenseView, TripView } from '@fsl/core';
import { can, formatVnd, isFundPaid } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { actorOf } from '../lib/rowActions';
import { formatDay } from '../lib/time';
import { apiSend } from '../api/client';
import { Icon } from './icons';
import { InlineError } from './InlineError';

export interface ExpenseHistoryListProps {
  view: TripView;
  expense: ExpenseView;
}

function isSameState(item: ExpenseHistoryItem, current: ExpenseView): boolean {
  if (
    item.amount !== current.amount ||
    item.description !== current.description ||
    item.payerId !== current.payerId ||
    item.spentOn !== current.spentOn
  ) {
    return false;
  }
  const itemShares = item.shares ?? [];
  const currentShares = current.shares ?? [];
  if (itemShares.length !== currentShares.length) return false;
  for (const s of currentShares) {
    const match = itemShares.find((x) => x.participantId === s.participantId);
    if (!match || match.amount !== s.amount) return false;
  }
  return true;
}

export function ExpenseHistoryList({ view, expense }: ExpenseHistoryListProps) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const rollbackMutation = useMutation({
    mutationFn: async (targetHistoryId: string) => {
      return apiSend<{ expenseId: string; rootId: string }>(
        `/api/trips/${view.trip.id}/expenses/${expense.id}/rollback`,
        'POST',
        { targetHistoryId },
        view.trip.id,
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trip', view.trip.id] });
      if (data?.expenseId) {
        navigate(`/t/${view.trip.id}/expenses/${data.expenseId}`, { replace: true });
      }
    },
  });

  if (!expense.history || expense.history.length === 0) {
    return null;
  }

  const canRollback =
    !view.trip.archived &&
    (view.me.kind === 'member' ||
      (view.me.participantId === expense.createdById && expense.status === 'pending'));
  // A roll back to or from a fund-paid version is a fund write (spec §9.4).
  const fundWriter = can(actorOf(view), 'manage_fund');

  return (
    <section className="fsl-history mt-4 flex flex-col gap-2" aria-labelledby="fsl-history-title">
      <h3 id="fsl-history-title" className="fsl-history__title text-sm font-semibold text-muted-foreground">
        {t('expense.historyTitle')}
      </h3>
      {rollbackMutation.error && <InlineError error={rollbackMutation.error} />}
      <ul className="fsl-history__list divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {expense.history.map((item) => {
          const sharesSummary = (item.shares ?? [])
            .map((s) => `${nameOf(view, s.participantId)}: ${formatVnd(s.amount)}`)
            .join(' · ');
          const dateStr = item.createdAt ? item.createdAt.slice(0, 10) : '';
          const editedBy = t('expense.editedBy', {
            name: nameOf(view, item.createdById),
            date: dateStr,
          });
          const itemCanRollback =
            canRollback && !isSameState(item, expense) && (fundWriter || (!isFundPaid(expense) && !isFundPaid(item)));

          return (
            <li key={item.id} className="fsl-history-item flex items-start justify-between gap-3 p-3">
              <div className="fsl-history-item__content flex min-w-0 flex-1 flex-col gap-1">
                <div className="fsl-history-item__row flex items-baseline justify-between gap-2">
                  <span className="fsl-history-item__desc text-sm font-medium text-foreground [overflow-wrap:anywhere]">{item.description}</span>
                  <span className="fsl-history-item__amount whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{formatVnd(item.amount)}</span>
                </div>
                <div className="fsl-history-item__meta flex items-center gap-1 text-xs text-muted-foreground">
                  {/* A fund-paid version names the admin who recorded it, never shown as the payer (spec §4.2). */}
                  <span>{isFundPaid(item) ? t('fund.title') : nameOf(view, item.payerId)}</span>
                  <span>·</span>
                  <span>{formatDay(item.spentOn)}</span>
                </div>
                {sharesSummary && (
                  <div className="fsl-history-item__shares text-xs text-muted-foreground [overflow-wrap:anywhere]">{sharesSummary}</div>
                )}
                <div className="fsl-history-item__edited text-xs italic text-muted-foreground">{editedBy}</div>
              </div>
              {itemCanRollback && (
                <button
                  type="button"
                  className="fsl-history-item__rollback-btn inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t('expense.rollback')}
                  title={t('expense.rollback')}
                  disabled={rollbackMutation.isPending}
                  onClick={() => rollbackMutation.mutate(item.id)}
                >
                  <Icon name="rotateCcw" size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
