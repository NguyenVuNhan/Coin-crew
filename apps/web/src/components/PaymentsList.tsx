import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PaymentView, TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { nameOf } from '../lib/tripText';
import { Amount } from './Amount';
import { Button } from './Button';
import { Pill } from './Pill';
import { InlineError } from './InlineError';
import './PaymentsList.css';

function PaymentRow({ view, payment, mode }: { view: TripView; payment: PaymentView; mode: 'member' | 'guest' }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const tripId = view.trip.id;
  const me = view.me.participantId;
  const label = (id: string) => (id === me ? t('trip.you') : nameOf(view, id));
  const off = payment.status === 'disabled';

  async function act(action: 'disable' | 'enable' | 'not-arrived') {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/trips/${tripId}/payments/${payment.id}/${action}`, 'POST', {}, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const pill =
    payment.notArrived ? <Pill tone="warning">{t('payments.reported')}</Pill>
    : payment.status === 'confirmed' ? <Pill tone="success">{t('whoPays.paid')}</Pill>
    : payment.status === 'says_paid' ? <Pill tone="warning">{t('whoPays.toConfirm')}</Pill>
    : payment.status === 'rejected' ? <Pill tone="neutral">{t('payments.notArrivedPill')}</Pill>
    : <Pill tone="neutral">{t('status.disabled')}</Pill>;

  const canWrite = !view.trip.archived;
  let action = null;
  if (canWrite && mode === 'member' && (payment.status === 'confirmed' || payment.status === 'says_paid')) {
    action = <Button variant="ghost" loading={busy} onClick={() => act('disable')}>{t('payments.disable')}</Button>;
  } else if (canWrite && mode === 'member' && off) {
    action = <Button variant="ghost" loading={busy} onClick={() => act('enable')}>{t('payments.enable')}</Button>;
  } else if (canWrite && mode === 'guest' && payment.toId === me && payment.status === 'confirmed' && !payment.notArrived) {
    action = <Button variant="ghost" loading={busy} onClick={() => act('not-arrived')}>{t('payments.didntArrive')}</Button>;
  }

  return (
    <li className="fsl-payments__row" data-testid={`payment-row-${payment.id}`}>
      <div className="fsl-payments__main">
        <span className="fsl-payments__text" style={off ? { textDecoration: 'line-through' } : undefined}>
          {t('trip.pays', { from: label(payment.fromId), to: label(payment.toId) })}
        </span>
        <Amount value={payment.amountConfirmed ?? payment.amountClaimed} style={off ? { textDecoration: 'line-through' } : undefined} />
      </div>
      <div className="fsl-payments__meta">
        {pill}
        {action}
      </div>
      {error ? <InlineError error={error} /> : null}
    </li>
  );
}

/** Every recorded payment, with the §9.4 safety-net actions: members disable / re-enable, a receiving guest reports "didn't arrive". */
export function PaymentsList({ view, mode }: { view: TripView; mode: 'member' | 'guest' }) {
  const t = useT();
  if (view.payments.length === 0) return null;
  return (
    <section className="fsl-payments" aria-label={t('payments.title')}>
      <h2 className="fsl-payments__heading">{t('payments.title')}</h2>
      <ul className="fsl-payments__list">
        {view.payments.map((p) => (
          <PaymentRow key={p.id} view={view} payment={p} mode={mode} />
        ))}
      </ul>
    </section>
  );
}
