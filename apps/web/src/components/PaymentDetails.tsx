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
import { cn } from '@/lib/utils';

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
        action={<Button onClick={onClose} className="rounded-full">{t('details.backToTrip')}</Button>}
      />
    );
  }

  const label = (id: string) => (id === view.me.participantId ? t('trip.you') : nameOf(view, id));

  const status = paymentStatus(p);
  const actions = paymentActions(view, p, { t, navigate, run });

  return (
    <article className="fsl-details flex flex-col gap-4 min-w-0">
      <div className="fsl-details__head flex flex-row items-start justify-between gap-3">
        <h2 className="fsl-details__title text-lg font-semibold text-foreground m-0 break-words focus:outline-none" tabIndex={-1}>
          {t('trip.pays', { from: label(p.fromId), to: label(p.toId) })}
        </h2>
        <Pill tone={status.tone}>{t(status.label)}</Pill>
      </div>

      <Amount value={p.amountConfirmed ?? p.amountClaimed} size="xl" className="text-3xl font-bold tabular-nums" />

      <dl className="fsl-details__facts m-0 bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('details.amountClaimed')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">
            <Amount value={p.amountClaimed} className="tabular-nums" />
          </dd>
        </div>
        {p.amountConfirmed !== null ? (
          <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
            <dt className="text-sm text-muted-foreground">{t('details.amountConfirmed')}</dt>
            <dd className="text-sm font-medium text-foreground text-right m-0">
              <Amount value={p.amountConfirmed} className="tabular-nums" />
            </dd>
          </div>
        ) : null}
        <div className="fsl-details__fact flex items-center justify-between gap-3 px-4 py-3 min-h-11">
          <dt className="text-sm text-muted-foreground">{t('details.recorded')}</dt>
          <dd className="text-sm font-medium text-foreground text-right m-0">{formatWhen(p.createdAt)}</dd>
        </div>
      </dl>

      {error ? <InlineError error={error} /> : null}

      {actions.length > 0 ? (
        <div className="fsl-details__actions flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.id}
              variant={a.tone === 'success' ? 'primary' : 'secondary'}
              className={cn(
                'fsl-details__action flex-1 min-w-[140px] rounded-full',
                a.tone === 'danger' && 'fsl-details__action--danger text-danger border-border hover:bg-danger-soft hover:text-danger',
              )}
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
