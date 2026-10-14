import { useNavigate } from 'react-router';
import { formatVnd, type PaymentView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { useTripAction } from '../lib/useTripAction';
import { paymentActions } from '../lib/rowActions';
import { SwipeGroupProvider } from '../lib/useSwipeReveal';
import { ActionRow } from './ActionRow';
import { Amount } from './Amount';
import { Pill } from './Pill';
import { InlineError } from './InlineError';
import { paymentStatus } from './PaymentDetails';
import './PaymentsList.css';

function PaymentItem({
  view,
  payment,
  selected,
  hintable,
  onOpen,
}: {
  view: TripView;
  payment: PaymentView;
  selected: boolean;
  hintable: boolean;
  onOpen(): void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { busy, error, run } = useTripAction(view.trip.id);
  const guardedRun = (path: string, body?: unknown) => (busy ? Promise.resolve() : run(path, body));

  const me = view.me.participantId;
  const who = (id: string) => (id === me ? t('trip.you') : nameOf(view, id));
  const off = payment.status === 'disabled';
  const amount = payment.amountConfirmed ?? payment.amountClaimed;

  const status = paymentStatus(payment);
  const statusText = t(status.label);

  // Payment rows offer Disable / Enable (spec §4.3). Confirm and a member's "Didn't arrive" live in the approvals
  // queue and the details; a guest receiver has no queue, so they keep "Didn't arrive" on the row.
  const actions = paymentActions(view, payment, { t, navigate, run: guardedRun }).filter(
    (a) => a.id !== 'confirm' && !(a.id === 'not-arrived' && view.me.kind === 'member'),
  );

  const title = t('trip.pays', { from: who(payment.fromId), to: who(payment.toId) });
  const label = `${title}, ${formatVnd(amount)}, ${statusText}`;

  return (
    <li className="fsl-payments__item" data-testid={`payment-row-${payment.id}`}>
      <ActionRow label={label} actions={actions} onOpen={onOpen} selected={selected} hintable={hintable}>
        <span className="fsl-payments__row">
          <span
            className={`fsl-payments__text${off ? ' fsl-payments__text--off' : ''}`}
            style={off ? { textDecoration: 'line-through' } : undefined}
          >
            {title}
          </span>
          <span className="fsl-payments__right">
            <Amount value={amount} style={off ? { textDecoration: 'line-through' } : undefined} />
            <Pill tone={status.tone}>{statusText}</Pill>
          </span>
        </span>
      </ActionRow>
      {error ? <InlineError error={error} className="fsl-payments__error" /> : null}
    </li>
  );
}

/** The trip's recorded payments list, with shortcut swipe and hover actions on each row. */
export function PaymentsList({
  view,
  selectedId,
  onOpen,
  hintable = false,
}: {
  view: TripView;
  selectedId?: string;
  onOpen(id: string): void;
  hintable?: boolean;
}) {
  const t = useT();
  if (view.payments.length === 0) return null;

  return (
    <section className="fsl-payments" aria-label={t('payments.title')}>
      <h2 className="fsl-payments__heading">{t('payments.title')}</h2>
      <SwipeGroupProvider>
        <ul className="fsl-payments__list">
          {view.payments.map((p, i) => (
            <PaymentItem
              key={p.id}
              view={view}
              payment={p}
              selected={p.id === selectedId}
              hintable={hintable && i === 0}
              onOpen={() => onOpen(p.id)}
            />
          ))}
        </ul>
      </SwipeGroupProvider>
    </section>
  );
}
