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
import { ReceivedButton } from './ReceivedButton';
import './WhoPaysWhom.css';

/** Suggested transfers with Pay / Remind / Received. Recorded payments live in PaymentsList. */
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

  const empty = view.suggestions.length === 0;

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
                <span className="fsl-who-pays__actions">
                  <Button variant="secondary" onClick={() => onRemind(s)}>{t('whoPays.remind')}</Button>
                  <ReceivedButton view={view} fromId={s.fromId} amount={s.amount} />
                </span>
              ) : s.fromId === me ? (
                <Link className="fsl-button fsl-button--primary" to={`/t/${tripId}/pay/${s.toId}`}>{t('whoPays.pay')}</Link>
              ) : (
                <Pill tone="neutral">{t('whoPays.waiting')}</Pill>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="fsl-who-pays__status" aria-live="polite">{status}</p>
    </section>
  );
}
