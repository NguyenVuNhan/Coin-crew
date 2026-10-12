import { useState } from 'react';
import { Link } from 'react-router';
import { formatVnd, type Transfer, type TripView } from '@fsl/core';
import { getLang, useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { remind, remindText } from '../lib/remind';
import { Amount } from './Amount';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Pill } from './Pill';
import './WhoPaysWhom.css';

const WEEK_MS = 7 * 24 * 3600_000;

/** Suggested transfers, payments waiting for confirmation and recent confirmed payments, with Pay / Remind. */
export function WhoPaysWhom({ view }: { view: TripView }) {
  const t = useT();
  const [status, setStatus] = useState('');
  const me = view.me.participantId;
  const tripId = view.trip.id;
  const label = (id: string) => (id === me ? t('trip.you') : nameOf(view, id));

  async function onRemind(s: Transfer) {
    if (!view.links || !me) return;
    const text = remindText(getLang(), {
      name: nameOf(view, s.fromId),
      creditor: nameOf(view, me),
      amount: formatVnd(s.amount),
      trip: view.trip.name,
      link: `${location.origin}/j/${view.links.group}`,
    });
    const result = await remind(text);
    setStatus(result === 'copied' ? t('whoPays.remindCopied') : '');
  }

  const saysPaid = view.payments.filter((p) => p.status === 'says_paid');
  const recentPaid = view.payments.filter((p) => p.status === 'confirmed' && Date.now() - new Date(p.createdAt).getTime() < WEEK_MS);
  const empty = view.suggestions.length === 0 && saysPaid.length === 0 && recentPaid.length === 0;

  return (
    <section className="fsl-who-pays" aria-label={t('trip.whoPaysWhom')}>
      <h2 className="fsl-who-pays__heading">{t('trip.whoPaysWhom')}</h2>
      {empty ? (
        <p className="fsl-who-pays__empty">{t('trip.allSettled')}</p>
      ) : (
        <ul className="fsl-who-pays__list">
          {view.suggestions.map((s) => (
            <li key={`s-${s.fromId}-${s.toId}`} className="fsl-who-pays__row" data-testid={`who-pays-${s.fromId}-${s.toId}`}>
              <Avatar name={nameOf(view, s.fromId)} size="sm" />
              <span className="fsl-who-pays__text">{t('trip.pays', { from: label(s.fromId), to: label(s.toId) })}</span>
              <Amount value={s.amount} />
              {s.toId === me && !view.trip.archived ? (
                <Button variant="secondary" onClick={() => onRemind(s)}>{t('whoPays.remind')}</Button>
              ) : s.fromId === me ? (
                <Link className="fsl-button fsl-button--primary" to={`/t/${tripId}/pay/${s.toId}`}>{t('whoPays.pay')}</Link>
              ) : (
                <Pill tone="neutral">{t('whoPays.waiting')}</Pill>
              )}
            </li>
          ))}
          {saysPaid.map((p) => (
            <li key={`p-${p.id}`} className="fsl-who-pays__row" data-testid={`payment-${p.id}`}>
              <Avatar name={nameOf(view, p.fromId)} size="sm" />
              <span className="fsl-who-pays__text">{t('trip.pays', { from: label(p.fromId), to: label(p.toId) })}</span>
              <Amount value={p.amountClaimed} />
              <Pill tone={p.toId === me ? 'warning' : 'neutral'}>{p.toId === me ? t('whoPays.toConfirm') : t('whoPays.waiting')}</Pill>
            </li>
          ))}
          {recentPaid.map((p) => (
            <li key={`c-${p.id}`} className="fsl-who-pays__row fsl-who-pays__row--done" data-testid={`payment-${p.id}`}>
              <Avatar name={nameOf(view, p.fromId)} size="sm" />
              <span className="fsl-who-pays__text">{t('trip.pays', { from: label(p.fromId), to: label(p.toId) })}</span>
              <Amount value={p.amountConfirmed ?? p.amountClaimed} />
              <Pill tone="success">{t('whoPays.paid')}</Pill>
            </li>
          ))}
        </ul>
      )}
      <p className="fsl-who-pays__status" aria-live="polite">{status}</p>
    </section>
  );
}
