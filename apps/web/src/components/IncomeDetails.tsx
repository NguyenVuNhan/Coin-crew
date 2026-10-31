import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import type { IncomeHistoryItem, IncomeView, TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { formatDay } from '../lib/time';
import { useTripAction } from '../lib/useTripAction';
import { useTrip } from '../lib/tripBase';
import { fundOf, incomeMinimum, isFundAdmin } from '../lib/fund';
import { ApiClientError } from '../api/client';
import { Pill } from './Pill';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { InlineError } from './InlineError';
import { Icon } from './icons';
import { cn } from '@/lib/utils';

export interface IncomeDetailsProps {
  view: TripView;
  incomeId: string;
  onClose(): void;
}

function isSameState(item: IncomeHistoryItem, current: IncomeView): boolean {
  return (
    item.amount === current.amount &&
    item.description === current.description &&
    item.spentOn === current.spentOn
  );
}

/** The details of one fund income, shown as a full-screen phone page or wide right panel. */
export function IncomeDetails({ view, incomeId, onClose }: IncomeDetailsProps) {
  const t = useT();
  const navigate = useNavigate();
  const historyTitleId = useId();
  const { href } = useTrip(view.trip.id);
  const { busy, error, run } = useTripAction(view.trip.id);
  const [lastActionDisable, setLastActionDisable] = useState(false);

  const admin = isFundAdmin(view);
  const income = fundOf(view)?.incomes.find(
    (i) => i.id === incomeId || i.rootId === incomeId || i.history.some((h) => h.id === incomeId),
  );

  if (!income) {
    return (
      <EmptyState
        icon="receipt"
        title={t('details.gone')}
        action={<Button onClick={onClose} className="rounded-full">{t('details.backToTrip')}</Button>}
      />
    );
  }

  // What the fund has already spent of this income, from the trip refreshed after the error. If that says nothing is
  // (the fund moved again), the general fund message shows instead.
  const spent = incomeMinimum(view, income);
  let errorElement = null;
  if (error instanceof ApiClientError && error.code === 'FUND_SHORT' && lastActionDisable && spent > 0) {
    errorElement = (
      <p className="fsl-details__error text-sm text-danger m-0" role="alert">
        {t('fund.cantDisable', { amount: formatVnd(spent) })}
      </p>
    );
  } else if (error) {
    errorElement = <InlineError error={error} />;
  }

  return (
    <article className="fsl-details flex flex-col gap-4 min-w-0">
      <div className="fsl-details__head flex flex-row items-start justify-between gap-3">
        <h2 className="fsl-details__title text-lg font-semibold text-foreground m-0 break-words focus:outline-none" tabIndex={-1}>
          {income.description}
        </h2>
        {income.status === 'disabled' && (
          <Pill tone="neutral">{t('status.disabled')}</Pill>
        )}
      </div>

      <p
        className={cn(
          'fsl-income__amount fsl-num text-3xl font-bold tabular-nums text-success m-0',
          income.status === 'disabled' && 'fsl-income__amount--off text-muted-foreground line-through',
        )}
      >
        {`+${formatVnd(income.amount)}`}
      </p>

      {income.status === 'disabled' && income.disabledByName && (
        <p className="fsl-details__note text-sm text-muted-foreground m-0">
          {t('expenses.disabledBy', { name: income.disabledByName })}
        </p>
      )}

      <dl className="fsl-details__facts m-0 bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('details.date')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">{formatDay(income.spentOn)}</dd>
        </div>
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('fund.addedBy')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">{`${nameOf(view, income.addedById)} · ${formatDay(income.spentOn)}`}</dd>
        </div>
      </dl>

      {income.history.length > 0 && (
        <section className="fsl-history mt-4 flex flex-col gap-2" aria-labelledby={historyTitleId}>
          <h3 id={historyTitleId} className="fsl-history__title text-base font-semibold text-foreground m-0">
            {t('expense.historyTitle')}
          </h3>
          <ul className="fsl-history__list m-0 p-0 list-none flex flex-col gap-2">
            {income.history.map((item) => {
              const dateStr = item.createdAt ? item.createdAt.slice(0, 10) : '';
              const canRollback = admin && !isSameState(item, income);

              return (
                <li key={item.id} className="fsl-history-item flex items-start justify-between gap-3 p-3 bg-card border border-border rounded-xl">
                  <div className="fsl-history-item__content flex flex-col gap-1 min-w-0 flex-1">
                    <div className="fsl-history-item__row flex justify-between items-baseline gap-2">
                      <span className="fsl-history-item__desc font-medium text-foreground break-words">{item.description}</span>
                      <span className="fsl-history-item__amount font-semibold text-foreground whitespace-nowrap tabular-nums">{formatVnd(item.amount)}</span>
                    </div>
                    <div className="fsl-history-item__meta flex items-center gap-1 text-xs text-muted-foreground">{formatDay(item.spentOn)}</div>
                    <div className="fsl-history-item__edited text-xs text-muted-foreground italic">
                      {t('expense.editedBy', {
                        name: nameOf(view, item.createdById),
                        date: dateStr,
                      })}
                    </div>
                  </div>
                  {canRollback && (
                    <button
                      type="button"
                      className="fsl-history-item__rollback-btn fsl-income__rollback inline-flex items-center justify-center size-11 p-2 bg-card border border-border rounded-full text-foreground hover:bg-muted cursor-pointer shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
                      aria-label={t('expense.rollback')}
                      title={t('expense.rollback')}
                      disabled={busy}
                      onClick={() => {
                        setLastActionDisable(false);
                        void run(`/fund/incomes/${income.id}/rollback`, {
                          targetHistoryId: item.id,
                        });
                      }}
                    >
                      <Icon name="rotateCcw" size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {errorElement}

      {admin ? (
        <div className="fsl-details__actions flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="fsl-details__action flex-1 min-w-[140px] rounded-full"
            onClick={() => navigate(href(`/fund/${income.id}/edit`))}
          >
            <Icon name="edit" size={18} />
            {t('approvals.edit')}
          </Button>
          {income.status === 'disabled' ? (
            <Button
              variant="primary"
              className="fsl-details__action flex-1 min-w-[140px] rounded-full"
              loading={busy}
              onClick={() => {
                setLastActionDisable(false);
                void run(`/fund/incomes/${income.id}/enable`);
              }}
            >
              <Icon name="circleCheck" size={18} />
              {t('expenses.enable')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="fsl-details__action fsl-details__action--danger flex-1 min-w-[140px] rounded-full text-danger border-border hover:bg-danger-soft hover:text-danger"
              loading={busy}
              onClick={() => {
                setLastActionDisable(true);
                void run(`/fund/incomes/${income.id}/disable`);
              }}
            >
              <Icon name="ban" size={18} />
              {t('expenses.disable')}
            </Button>
          )}
        </div>
      ) : view.trip.archived ? null : (
        <p className="fsl-details__note text-sm text-muted-foreground m-0">{t('fund.readOnly')}</p>
      )}
    </article>
  );
}
