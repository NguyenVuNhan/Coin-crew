import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import type { IncomeHistoryItem, IncomeView, TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { formatDay } from '../lib/time';
import { useTripAction } from '../lib/useTripAction';
import { fundOf, isFundAdmin } from '../lib/fund';
import { ApiClientError } from '../api/client';
import { Pill } from './Pill';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { InlineError } from './InlineError';
import { Icon } from './icons';
import './ExpenseDetails.css';
import './ExpenseHistoryList.css';
import './IncomeDetails.css';

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
        action={<Button onClick={onClose}>{t('details.backToTrip')}</Button>}
      />
    );
  }

  let errorElement = null;
  if (error instanceof ApiClientError && error.code === 'FUND_SHORT' && lastActionDisable) {
    const fundBalance = fundOf(view)?.balance ?? 0;
    const shortAmount = income.amount - fundBalance;
    errorElement = (
      <p className="fsl-details__error" role="alert">
        {t('fund.cantDisable', { amount: formatVnd(shortAmount) })}
      </p>
    );
  } else if (error) {
    errorElement = <InlineError error={error} />;
  }

  return (
    <article className="fsl-details">
      <div className="fsl-details__head">
        <h2 className="fsl-details__title" tabIndex={-1}>
          {income.description}
        </h2>
        {income.status === 'disabled' && (
          <Pill tone="neutral">{t('status.disabled')}</Pill>
        )}
      </div>

      <p
        className={`fsl-income__amount fsl-num${income.status === 'disabled' ? ' fsl-income__amount--off' : ''}`}
      >
        {`+${formatVnd(income.amount)}`}
      </p>

      {income.status === 'disabled' && income.disabledByName && (
        <p className="fsl-details__note">
          {t('expenses.disabledBy', { name: income.disabledByName })}
        </p>
      )}

      <dl className="fsl-details__facts">
        <div className="fsl-details__fact">
          <dt>{t('details.date')}</dt>
          <dd>{formatDay(income.spentOn)}</dd>
        </div>
        <div className="fsl-details__fact">
          <dt>{t('fund.addedBy')}</dt>
          <dd>{`${nameOf(view, income.addedById)} · ${formatDay(income.spentOn)}`}</dd>
        </div>
      </dl>

      {income.history.length > 0 && (
        <section className="fsl-history" aria-labelledby={historyTitleId}>
          <h3 id={historyTitleId} className="fsl-history__title">
            {t('expense.historyTitle')}
          </h3>
          <ul className="fsl-history__list">
            {income.history.map((item) => {
              const dateStr = item.createdAt ? item.createdAt.slice(0, 10) : '';
              const canRollback = admin && !isSameState(item, income);

              return (
                <li key={item.id} className="fsl-history-item">
                  <div className="fsl-history-item__content">
                    <div className="fsl-history-item__row">
                      <span className="fsl-history-item__desc">{item.description}</span>
                      <span className="fsl-history-item__amount">{formatVnd(item.amount)}</span>
                    </div>
                    <div className="fsl-history-item__meta">{formatDay(item.spentOn)}</div>
                    <div className="fsl-history-item__edited">
                      {t('expense.editedBy', {
                        name: nameOf(view, item.createdById),
                        date: dateStr,
                      })}
                    </div>
                  </div>
                  {canRollback && (
                    <button
                      type="button"
                      className="fsl-history-item__rollback-btn fsl-income__rollback"
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
        <div className="fsl-details__actions">
          <Button
            variant="secondary"
            className="fsl-details__action"
            onClick={() => navigate(`/t/${view.trip.id}/fund/${income.id}/edit`)}
          >
            <Icon name="edit" size={18} />
            {t('approvals.edit')}
          </Button>
          {income.status === 'disabled' ? (
            <Button
              variant="primary"
              className="fsl-details__action"
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
              className="fsl-details__action fsl-details__action--danger"
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
      ) : (
        <p className="fsl-details__note">{t('fund.readOnly')}</p>
      )}
    </article>
  );
}
