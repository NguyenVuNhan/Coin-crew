import { Link } from 'react-router';
import { formatVnd, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { Amount } from './Amount';
import { Icon } from './icons';
import './BalanceCard.css';

/** Where I stand in the trip (spec §5.3): owed / owe / settled, the trip total, what has arrived and what still waits. */
export function BalanceCard({ view }: { view: TripView }) {
  const t = useT();
  const me = view.me.participantId;
  const now = view.myBalance?.now ?? 0;
  const before = view.myBalance?.beforePayments ?? 0;

  let subText = t('balance.tripTotal', { total: formatVnd(view.trip.total) });
  if (before > now && now > 0) {
    subText += ' · ' + t('balance.received', { amount: formatVnd(before - now) });
  }

  const waiting = view.payments.filter((p) => p.status === 'says_paid' && p.fromId === me);
  const showBankPrompt = now > 0 && view.people.find((p) => p.id === me)?.bank === 'none';

  return (
    <div className="fsl-balance">
      {now > 0 && (
        <>
          <p className="fsl-balance__label">{t('balance.owed')}</p>
          <Amount value={now} tone="success" size="xl" />
        </>
      )}
      {now < 0 && (
        <>
          <p className="fsl-balance__label">{t('balance.owe')}</p>
          <Amount value={-now} tone="danger" size="xl" />
        </>
      )}
      {now === 0 && (
        <p className="fsl-balance__settled">
          <Icon name="circleCheck" size={20} />
          <span>{t('balance.settled')}</span>
        </p>
      )}
      <p className="fsl-balance__sub">{subText}</p>
      {waiting.length > 0 && (
        <ul className="fsl-balance__waiting">
          {waiting.map((p) => (
            <li key={p.id}>
              <Icon name="clock" size={16} />
              <span>{t('balance.waitingFor', { amount: formatVnd(p.amountClaimed), name: nameOf(view, p.toId) })}</span>
            </li>
          ))}
        </ul>
      )}
      {showBankPrompt && (
        <p className="fsl-balance__bank">
          {t('bankForm.addPrompt')} <Link to="/me/bank">{t('bankForm.title')}</Link>
        </p>
      )}
    </div>
  );
}
