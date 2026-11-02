import { Link } from 'react-router';
import { formatVnd, type Transfer, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useTrip } from '../lib/tripBase';
import { nameOf } from '../lib/tripText';
import { Amount } from './Amount';
import { Button } from './Button';
import { Icon } from './icons';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
  const { href } = useTrip(view.trip.id);
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
    <Card
      className={cn(
        'fsl-balance rounded-xl bg-card p-5 border border-border shadow-none ring-0 flex flex-col items-start gap-1 w-full text-card-foreground',
      )}
    >
      {now > 0 && (
        <>
          <p className="fsl-balance__label m-0 text-sm font-medium text-muted-foreground">{t('balance.owed')}</p>
          <Amount value={now} tone="success" size="xl" className="!text-3xl !font-bold tabular-nums !text-primary" />
        </>
      )}
      {now < 0 && (
        <>
          <p className="fsl-balance__label m-0 text-sm font-medium text-muted-foreground">
            {payTo ? t('balance.oweName', { name: nameOf(view, payTo.toId) }) : t('balance.owe')}
          </p>
          <Amount value={payTo ? payTo.amount : -now} tone="danger" size="xl" className="!text-3xl !font-bold tabular-nums !text-danger" />
          {payTo && (
            <div className="flex w-full flex-row gap-2 mt-3">
              <Button
                href={href(`/pay/${payTo.toId}`)}
                variant="primary"
                block
                className="fsl-balance__pay flex-1"
              >
                {t('pay.payWithVietQr')}
              </Button>
            </div>
          )}
        </>
      )}
      {now === 0 && (
        <p className="fsl-balance__settled m-0 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Icon name="circleCheck" size={20} className="text-primary shrink-0" />
          <span>{t('balance.settled')}</span>
        </p>
      )}
      <p className="fsl-balance__sub m-0 text-sm text-muted-foreground tabular-nums">{subText}</p>
      {ifApproved !== null && (
        <p className="fsl-balance__pending m-0 mt-1 text-sm text-muted-foreground tabular-nums">
          {t(ifApproved < 0 ? 'guest.ifApprovedOwe' : ifApproved > 0 ? 'guest.ifApprovedOwed' : 'guest.ifApprovedSettled', {
            amount: formatVnd(Math.abs(ifApproved)),
          })}
        </p>
      )}
      {waiting.length > 0 && (
        <ul className="fsl-balance__waiting list-none m-0 p-0 mt-2 flex flex-col gap-1 w-full">
          {waiting.map((p) => (
            <li key={p.id} className="flex items-start gap-2 text-sm text-foreground tabular-nums">
              <Icon name="clock" size={16} className="text-warning shrink-0 mt-[1px]" />
              <span>{t('balance.waitingFor', { amount: formatVnd(p.amountClaimed), name: nameOf(view, p.toId) })}</span>
            </li>
          ))}
        </ul>
      )}
      {showBankPrompt && (
        <p className="fsl-balance__bank self-stretch mt-3 px-4 py-3 rounded-lg bg-secondary text-secondary-foreground text-sm leading-snug">
          {t('bankForm.addPrompt')}{' '}
          <Link
            to="/me/bank"
            className="font-semibold underline text-secondary-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
          >
            {t('bankForm.title')}
          </Link>
        </p>
      )}
    </Card>
  );
}
