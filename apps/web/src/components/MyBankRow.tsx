import { useId, type JSX } from 'react';
import { Link } from 'react-router';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { Icon, type IconName } from './icons';
import './MyBankRow.css';

export function MyBankRow({ view }: { view: TripView }): JSX.Element | null {
  const t = useT();
  const headingId = useId();

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
    <section className="fsl-my-bank" aria-labelledby={headingId}>
      <h2 id={headingId} className="fsl-my-bank__title">{t('myBank.title')}</h2>
      <div className="fsl-my-bank__row">
        <Icon name={iconName} size={20} className={iconClassName} />
        <div className="fsl-my-bank__text">
          <span className="fsl-my-bank__main">{mainText}</span>
          {subText && <span className="fsl-my-bank__sub">{subText}</span>}
        </div>
        {linkText && (
          <Link to={`/t/${view.trip.id}/bank`} className="fsl-my-bank__action">
            {linkText}
          </Link>
        )}
      </div>
    </section>
  );
}
