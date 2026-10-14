import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ExpenseView, TripView } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { nameOf, splitText } from '../lib/tripText';
import { formatDay } from '../lib/time';
import { useTripAction } from '../lib/useTripAction';
import { expenseActions } from '../lib/rowActions';
import { ApiClientError } from '../api/client';
import { Amount } from './Amount';
import { Pill, type PillProps } from './Pill';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { InlineError } from './InlineError';
import { Icon } from './icons';
import './ExpenseDetails.css';

const STATUS: Record<ExpenseView['status'], { tone: PillProps['tone']; label: MessageKey }> = {
  approved: { tone: 'success', label: 'status.approved' },
  pending: { tone: 'warning', label: 'status.waiting' },
  rejected: { tone: 'danger', label: 'status.rejected' },
  disabled: { tone: 'neutral', label: 'status.disabled' },
};

/** The details of one expense, shown as a full-screen phone page or wide right panel. */
export function ExpenseDetails({
  view,
  expenseId,
  onClose,
}: {
  view: TripView;
  expenseId: string;
  onClose(): void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { busy, error, run } = useTripAction(view.trip.id);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const reasonId = useId();

  const e = view.expenses.find((x) => x.id === expenseId);

  if (!e) {
    return (
      <EmptyState
        icon="receipt"
        title={t('details.gone')}
        action={<Button onClick={onClose}>{t('details.backToTrip')}</Button>}
      />
    );
  }

  const status = STATUS[e.status];

  const whoText = (id: string) => (id === view.me.participantId ? t('trip.you') : nameOf(view, id));

  let errorElement = null;
  if (error instanceof ApiClientError && error.code === 'PERSON_PENDING') {
    const pendingId = [e.payerId, ...e.shares.map((s) => s.participantId)].find(
      (id) => view.people.find((p) => p.id === id)?.status === 'pending',
    );
    if (pendingId) {
      errorElement = (
        <p className="fsl-details__error" role="alert">
          {t('approvals.approveNameFirst', { name: nameOf(view, pendingId) })}
        </p>
      );
    } else {
      errorElement = <InlineError error={error} />;
    }
  } else if (error) {
    errorElement = <InlineError error={error} />;
  }

  const actions = expenseActions(view, e, {
    t,
    navigate,
    run,
    onReject: () => setRejecting(true),
  });
  const showReason = rejecting && e.status === 'pending';

  return (
    <article className="fsl-details">
      <div className="fsl-details__head">
        <h2 className="fsl-details__title" tabIndex={-1}>{e.description}</h2>
        <Pill tone={status.tone}>{t(status.label)}</Pill>
      </div>

      <Amount value={e.amount} size="xl" />

      {e.status === 'rejected' && e.rejectReason ? (
        <p className="fsl-details__note fsl-details__note--danger">
          {t('expense.rejectedBecause', { reason: e.rejectReason })}
        </p>
      ) : null}
      {e.status === 'disabled' && e.disabledByName ? (
        <p className="fsl-details__note">
          {t('expenses.disabledBy', { name: e.disabledByName })}
        </p>
      ) : null}

      <dl className="fsl-details__facts">
        <div className="fsl-details__fact">
          <dt>{t('details.date')}</dt>
          <dd>{formatDay(e.spentOn)}</dd>
        </div>
        <div className="fsl-details__fact">
          <dt>{t('details.paidBy')}</dt>
          <dd>{whoText(e.payerId)}</dd>
        </div>
        <div className="fsl-details__fact">
          <dt>{t('details.addedBy')}</dt>
          <dd>{whoText(e.createdById)}</dd>
        </div>
        <div className="fsl-details__fact">
          <dt>{t('details.split')}</dt>
          <dd>
            {e.mode === 'equal'
              ? `${t('split.tab.equal')}, ${t('trip.people', { n: e.shares.length })}`
              : splitText(e, t)}
          </dd>
        </div>
      </dl>

      <ul className="fsl-details__shares" aria-label={t('details.split')}>
        {e.shares.map((s) => {
          const isMe = s.participantId === view.me.participantId;
          return (
            <li
              key={s.participantId}
              className={`fsl-details__share${isMe ? ' fsl-details__share--me' : ''}`}
            >
              <span className="fsl-details__share-name">
                {isMe
                  ? t('details.you', { name: nameOf(view, s.participantId) })
                  : nameOf(view, s.participantId)}
              </span>
              <Amount value={s.amount} />
            </li>
          );
        })}
      </ul>

      {errorElement}

      {showReason ? (
        <div className="fsl-details__reject">
          <label htmlFor={reasonId}>{t('approvals.rejectReason')}</label>
          <input
            id={reasonId}
            className="fsl-details__input"
            value={reason}
            maxLength={140}
            onChange={(ev) => setReason(ev.target.value)}
          />
          <div className="fsl-details__reject-row">
            <Button
              variant="danger"
              disabled={!reason.trim()}
              loading={busy}
              onClick={() => run(`/expenses/${e.id}/reject`, { reason: reason.trim() })}
            >
              {t('approvals.reject')}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : actions.length > 0 ? (
        <div className="fsl-details__actions">
          {actions.map((a) => (
            <Button
              key={a.id}
              variant={a.tone === 'success' ? 'primary' : 'secondary'}
              className={`fsl-details__action${a.tone === 'danger' ? ' fsl-details__action--danger' : ''}`}
              loading={busy}
              onClick={a.onSelect}
            >
              <Icon name={a.icon} size={18} />
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
