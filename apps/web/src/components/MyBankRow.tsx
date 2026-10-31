import { useId, type JSX } from 'react';
import { Link } from 'react-router';
import type { TripView } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { useTrip } from '../lib/tripBase';
import { Icon, type IconName } from './icons';

export function MyBankRow({ view }: { view: TripView }): JSX.Element | null {
  const t = useT();
  const headingId = useId();
  const { href } = useTrip(view.trip.id);

  const me = view.people.find((p) => p.id === view.me.participantId);
  if (view.me.participantId === null || !me || view.trip.archived) {
    return null;
  }

  let iconName: IconName;
  let iconClassName: string;
  let mainText: string;
  let subText: string | undefined;
  let linkText: string | undefined;

  if (view.me.participantPending) {
    iconName = 'info';
    iconClassName = 'fsl-my-bank__icon';
    mainText = t('myBank.namePending');
  } else if (me.bank === 'none') {
    iconName = 'bank';
    iconClassName = 'fsl-my-bank__icon';
    mainText = t('myBank.none');
    linkText = t('myBank.add');
  } else if (me.bank === 'pending') {
    iconName = 'clock';
    iconClassName = 'fsl-my-bank__icon fsl-my-bank__icon--pending';
    if (me.bankAccount) {
      mainText = `${me.bankAccount.bankName} · ${me.bankAccount.accountNumberMasked}`;
      subText = t('myBank.pending');
    } else {
      mainText = t('myBank.pending');
    }
    linkText = t('myBank.change');
  } else {
    iconName = 'check';
    iconClassName = 'fsl-my-bank__icon fsl-my-bank__icon--approved';
    if (me.bankAccount) {
      mainText = `${me.bankAccount.bankName} · ${me.bankAccount.accountNumberMasked}`;
      subText = t('myBank.locked');
    } else {
      mainText = t('myBank.locked');
    }
  }

  return (
    <section className="fsl-my-bank flex flex-col gap-2" aria-labelledby={headingId}>
      <h2 id={headingId} className="fsl-my-bank__title text-sm font-semibold text-muted-foreground">{t('myBank.title')}</h2>
      <div className="fsl-my-bank__row flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div
          className={cn(
            'size-[38px] shrink-0 rounded-xl flex items-center justify-center',
            me.bank === 'pending'
              ? 'bg-warning-soft text-warning-foreground'
              : me.bank === 'approved'
                ? 'bg-success-soft text-success'
                : 'bg-secondary text-secondary-foreground',
          )}
        >
          <Icon name={iconName} size={20} className={iconClassName} />
        </div>
        <div className="fsl-my-bank__text flex min-w-0 flex-1 flex-col">
          <span className="fsl-my-bank__main truncate text-base font-semibold tabular-nums text-foreground">{mainText}</span>
          {subText && <span className="fsl-my-bank__sub text-sm text-muted-foreground">{subText}</span>}
        </div>
        {linkText && (
          <Link
            to={href('/bank')}
            className="fsl-my-bank__action inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{linkText}</span>
            <Icon name="chevronRight" size={16} aria-hidden="true" className="text-muted-foreground" />
          </Link>
        )}
      </div>
    </section>
  );
}
