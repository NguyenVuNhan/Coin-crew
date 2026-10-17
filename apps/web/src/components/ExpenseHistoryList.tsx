import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExpenseView, TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { formatDay } from '../lib/time';
import { apiSend } from '../api/client';
import { Icon } from './icons';
import { InlineError } from './InlineError';
import './ExpenseHistoryList.css';

export interface ExpenseHistoryListProps {
  view: TripView;
  expense: ExpenseView;
}

export function ExpenseHistoryList({ view, expense }: ExpenseHistoryListProps) {
  const t = useT();
  const queryClient = useQueryClient();

  const rollbackMutation = useMutation({
    mutationFn: async (targetHistoryId: string) => {
      return apiSend(
        `/api/trips/${view.trip.id}/expenses/${expense.id}/rollback`,
        'POST',
        { targetHistoryId },
        view.trip.id,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', view.trip.id] });
    },
  });

  if (!expense.history || expense.history.length === 0) {
    return null;
  }

  const canRollback =
    !view.trip.archived &&
    (view.me.kind === 'member' ||
      (view.me.participantId === expense.createdById && expense.status === 'pending'));

  return (
    <section className="fsl-history" aria-labelledby="fsl-history-title">
      <h3 id="fsl-history-title" className="fsl-history__title">
        {t('expense.historyTitle')}
      </h3>
      {rollbackMutation.error && <InlineError error={rollbackMutation.error} />}
      <ul className="fsl-history__list">
        {expense.history.map((item) => {
          const sharesSummary = item.shares
            .map((s) => `${nameOf(view, s.participantId)}: ${formatVnd(s.amount)}`)
            .join(' · ');
          const dateStr = item.createdAt.slice(0, 10);
          const editedBy = t('expense.editedBy', {
            name: nameOf(view, item.createdById),
            date: dateStr,
          });

          return (
            <li key={item.id} className="fsl-history-item">
              <div className="fsl-history-item__content">
                <div className="fsl-history-item__row">
                  <span className="fsl-history-item__desc">{item.description}</span>
                  <span className="fsl-history-item__amount">{formatVnd(item.amount)}</span>
                </div>
                <div className="fsl-history-item__meta">
                  <span>{nameOf(view, item.payerId)}</span>
                  <span>·</span>
                  <span>{formatDay(item.spentOn)}</span>
                </div>
                {sharesSummary && (
                  <div className="fsl-history-item__shares">{sharesSummary}</div>
                )}
                <div className="fsl-history-item__edited">{editedBy}</div>
              </div>
              {canRollback && (
                <button
                  type="button"
                  className="fsl-history-item__rollback-btn"
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
