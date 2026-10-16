import { useNavigate } from 'react-router';
import { formatVnd, type PaymentView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { useTripAction } from '../lib/useTripAction';
import { paymentActions } from '../lib/rowActions';
import { SwipeGroupProvider } from '../lib/useSwipeReveal';
import { useListMode } from '../lib/useListMode';
import { ActionRow } from './ActionRow';
import { Amount } from './Amount';
import { Pill } from './Pill';
import { InlineError } from './InlineError';
import { ListModeChip } from './ListModeChip';
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
  // queue and the details; a guest receiver has no queue, so they keep "Didn't arrive" on the row. "It arrived" is
  // only in the details, where the person can see what they are taking back.
  const actions = paymentActions(view, payment, { t, navigate, run: guardedRun }).filter(
    (a) => a.id !== 'confirm' && a.id !== 'arrived' && !(a.id === 'not-arrived' && view.me.kind === 'member'),
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

/**
 * The trip's recorded payments, with shortcut swipe and hover actions on each row. Someone in the trip sees the
 * payments to or from them first ("Your payments") and can show them all; a view-only link sees them all.
 */
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
  const [mode, toggle] = useListMode('fsl.payments.mode');
  if (view.payments.length === 0) return null;

  const me = view.me.participantId;
  const effective = me === null ? null : mode;
  const rows = effective === 'mine' ? view.payments.filter((p) => p.fromId === me || p.toId === me) : view.payments;
  const title = effective === null ? t('payments.title') : effective === 'mine' ? t('payments.mine') : t('payments.all');

  return (
    <section className="fsl-payments" aria-label={title}>
      <div className="fsl-payments__top">
        <h2 className="fsl-payments__heading">{title}</h2>
        {effective !== null && <ListModeChip mode={effective} onToggle={toggle} />}
      </div>
      {rows.length === 0 ? (
        <p className="fsl-payments__empty">{t('payments.emptyMine')}</p>
      ) : (
      <SwipeGroupProvider>
        <ul className="fsl-payments__list">
          {rows.map((p, i) => (
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
      )}
    </section>
  );
}
