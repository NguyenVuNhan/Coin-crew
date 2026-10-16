import { useNavigate } from 'react-router';
import type { PaymentView, TripView } from '@fsl/core';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { nameOf } from '../lib/tripText';
import { formatWhen } from '../lib/time';
import { useTripAction } from '../lib/useTripAction';
import { paymentActions } from '../lib/rowActions';
import { Amount } from './Amount';
import { Pill, type PillProps } from './Pill';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { InlineError } from './InlineError';
import { Icon } from './icons';
import './ExpenseDetails.css';

/** A payment's status as a pill: the payments list and the details say the same thing. */
export function paymentStatus(p: PaymentView): { tone: PillProps['tone']; label: MessageKey } {
  if (p.notArrived) return { tone: 'warning', label: 'payments.reported' };
  switch (p.status) {
    case 'confirmed': return { tone: 'success', label: 'whoPays.paid' };
    case 'says_paid': return { tone: 'warning', label: 'status.waiting' };
    case 'rejected': return { tone: 'neutral', label: 'payments.notArrivedPill' };
    case 'disabled': return { tone: 'neutral', label: 'status.disabled' };
  }
}

/** The details of one payment, shown as a full-screen phone page or wide right panel. */
export function PaymentDetails({
  view,
  paymentId,
  onClose,
}: {
  view: TripView;
  paymentId: string;
  onClose(): void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { busy, error, run } = useTripAction(view.trip.id);

  const p = view.payments.find((x) => x.id === paymentId);

  if (!p) {
    return (
      <EmptyState
        icon="receipt"
        title={t('details.gone')}
        action={<Button onClick={onClose}>{t('details.backToTrip')}</Button>}
      />
    );
  }

  const label = (id: string) => (id === view.me.participantId ? t('trip.you') : nameOf(view, id));

  const status = paymentStatus(p);
  const actions = paymentActions(view, p, { t, navigate, run });

  return (
    <article className="fsl-details">
      <div className="fsl-details__head">
        <h2 className="fsl-details__title" tabIndex={-1}>
          {t('trip.pays', { from: label(p.fromId), to: label(p.toId) })}
        </h2>
        <Pill tone={status.tone}>{t(status.label)}</Pill>
      </div>

      <Amount value={p.amountConfirmed ?? p.amountClaimed} size="xl" />

      <dl className="fsl-details__facts">
        <div className="fsl-details__fact">
          <dt>{t('details.amountClaimed')}</dt>
          <dd>
            <Amount value={p.amountClaimed} />
          </dd>
        </div>
        {p.amountConfirmed !== null ? (
          <div className="fsl-details__fact">
            <dt>{t('details.amountConfirmed')}</dt>
            <dd>
              <Amount value={p.amountConfirmed} />
            </dd>
          </div>
        ) : null}
        <div className="fsl-details__fact">
          <dt>{t('details.recorded')}</dt>
          <dd>{formatWhen(p.createdAt)}</dd>
        </div>
      </dl>

      {error ? <InlineError error={error} /> : null}

      {actions.length > 0 ? (
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
