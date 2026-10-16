import { Link } from 'react-router';
import { formatVnd, type Transfer, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { Amount } from './Amount';
import { Icon } from './icons';
import './BalanceCard.css';

/**
 * The one transfer a guest pays straight from their balance card: they owe exactly one person. With several debts
 * (or none) there is nothing to pay from the card, and they pay from Your transfers instead. Nothing is paid on an
 * archived trip: the API refuses every write there.
 */
export function guestPayTarget(view: TripView): Transfer | null {
  const me = view.me.participantId;
  if (view.me.kind !== 'guest' || me === null || view.trip.archived || (view.myBalance?.now ?? 0) >= 0) return null;
  const mine = view.suggestions.filter((s) => s.fromId === me);
  return mine.length === 1 ? mine[0]! : null;
}

/**
 * Where I stand in the trip (spec §5.3): owed / owe / settled, the trip total, what has arrived and what still waits.
 * A guest's card also names who they owe with a Pay with VietQR button, and says what approval of their expenses would change (§5.5).
 */
export function BalanceCard({ view }: { view: TripView }) {
  const t = useT();
  const me = view.me.participantId;
  const now = view.myBalance?.now ?? 0;
  const before = view.myBalance?.beforePayments ?? 0;
  const guest = view.me.kind === 'guest';
  const payTo = guestPayTarget(view);
  const ifApproved = guest ? (view.myBalance?.ifPendingApproved ?? null) : null;

  let subText = t('balance.tripTotal', { total: formatVnd(view.trip.total) });
  if (before > now && now > 0) {
    subText += ' · ' + t('balance.received', { amount: formatVnd(before - now) });
  }

  const waiting = view.payments.filter((p) => p.status === 'says_paid' && p.fromId === me);
  // A guest's bank prompt (and its link) belongs to their page, which also knows when the details wait for a member.
  const showBankPrompt = !guest && now > 0 && view.people.find((p) => p.id === me)?.bank === 'none';

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
          <p className="fsl-balance__label">{payTo ? t('balance.oweName', { name: nameOf(view, payTo.toId) }) : t('balance.owe')}</p>
          <Amount value={payTo ? payTo.amount : -now} tone="danger" size="xl" />
          {payTo && (
            <Link to={`/t/${view.trip.id}/pay/${payTo.toId}`} className="fsl-button fsl-button--primary fsl-button--block fsl-balance__pay">
              {t('pay.payWithVietQr')}
            </Link>
          )}
        </>
      )}
      {now === 0 && (
        <p className="fsl-balance__settled">
          <Icon name="circleCheck" size={20} />
          <span>{t('balance.settled')}</span>
        </p>
      )}
      <p className="fsl-balance__sub">{subText}</p>
      {ifApproved !== null && (
        <p className="fsl-balance__pending">
          {t(ifApproved < 0 ? 'guest.ifApprovedOwe' : ifApproved > 0 ? 'guest.ifApprovedOwed' : 'guest.ifApprovedSettled', {
            amount: formatVnd(Math.abs(ifApproved)),
          })}
        </p>
      )}
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
