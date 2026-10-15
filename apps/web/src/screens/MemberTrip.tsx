import { useState } from 'react';
import { Link } from 'react-router';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { Screen } from '../components/Screen';
import { Icon } from '../components/icons';
import { ApprovalQueue } from '../components/ApprovalQueue';
import { BalanceCard } from '../components/BalanceCard';
import { InviteCard, InviteSheet } from '../components/InviteSheet';
import { YourTransfers } from '../components/YourTransfers';
import { PaymentsList } from '../components/PaymentsList';
import { ExpenseList } from '../components/ExpenseList';
import { TripLayout } from '../components/TripLayout';
import type { Selection } from './TripRoute';
import { DetailsPanel, useDetailsSelection } from './DetailsPanel';
import './MemberTrip.css';

/** The trip page for signed-in members (spec §5.1): phone order below 1024px, layout A from there. */
export function MemberTrip({ view, selection = null }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const wide = useIsWide();
  const [inviteOpen, setInviteOpen] = useState(false);

  const tripId = view.trip.id;
  const archived = view.trip.archived;
  const hasExpenses = view.expenses.length > 0;
  const canInvite = !archived && view.links !== null;
  const { detail, open } = useDetailsSelection(tripId, selection);

  const addLink = (block: boolean, variant: 'primary' | 'secondary' = 'primary') =>
    archived ? undefined : (
      <Link className={`fsl-button fsl-button--${variant}${block ? ' fsl-button--block' : ''}`} to={`/t/${tripId}/expenses/new`}>
        {t('trip.addExpense')}
      </Link>
    );

  const notice = archived ? <p className="fsl-member__notice">{t('settings.archived')}</p> : null;
  // A brand-new trip leads with the invite card; the balance appears with the first expense.
  const balance = hasExpenses ? <BalanceCard view={view} /> : canInvite ? <InviteCard view={view} /> : null;
  const transfers = hasExpenses || view.suggestions.length > 0 ? <YourTransfers view={view} /> : null;
  const payments = (hintable: boolean) => (
    <PaymentsList
      view={view}
      selectedId={detail?.kind === 'payment' ? detail.id : undefined}
      onOpen={(id) => open('payment', id)}
      hintable={hintable}
    />
  );
  const expenses = (hintable: boolean, inHeading: boolean) => (
    <ExpenseList
      view={view}
      selectedId={detail?.kind === 'expense' ? detail.id : undefined}
      onOpen={(id) => open('expense', id)}
      hintable={hintable}
      // On a new trip the invite card's Share is the one primary button, so the empty state's add steps back.
      add={addLink(false, !hasExpenses && canInvite ? 'secondary' : 'primary')}
      addInHeading={inHeading}
    />
  );

  const header = (
    <>
      {canInvite && (
        <button type="button" className="fsl-member__invite" onClick={() => setInviteOpen(true)}>
          <Icon name="userPlus" size={20} />
          <span>{t('invite.button')}</span>
        </button>
      )}
      <Link className="fsl-member__settings" to={`/t/${tripId}/settings`} aria-label={t('member.settings')} title={t('member.settings')}>
        <Icon name="settings" size={20} />
      </Link>
    </>
  );

  return (
    <Screen
      title={view.trip.name}
      back="/trips"
      right={header}
      wide
      // R-D: no bottom bar on an empty trip, the empty state carries the only "+ Add expense". From 1024px it sits in the Expenses heading.
      bottomBar={!wide && hasExpenses ? addLink(true) : undefined}
    >
      {wide ? (
        <div className="fsl-member">
          <TripLayout
            left={
              <>
                {notice}
                <ApprovalQueue view={view} switching={selection !== null} />
                {expenses(true, true)}
                {payments(false)}
              </>
            }
            right={selection ? <DetailsPanel view={view} selection={selection} /> : <>{balance}{transfers}</>}
          />
        </div>
      ) : (
        <div className="fsl-member">
          {notice}
          <ApprovalQueue view={view} />
          {balance}
          {transfers}
          {/* Only the first swipeable list on the page shows the swipe hint. */}
          {payments(true)}
          {expenses(view.payments.length === 0, false)}
        </div>
      )}
      {canInvite && <InviteSheet view={view} open={inviteOpen} onClose={() => setInviteOpen(false)} />}
    </Screen>
  );
}
