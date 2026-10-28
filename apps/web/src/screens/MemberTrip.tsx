import { useState } from 'react';
import { Link } from 'react-router';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { fundOf } from '../lib/fund';
import { Screen } from '../components/Screen';
import { Icon } from '../components/icons';
import { ApprovalQueue } from '../components/ApprovalQueue';
import { BalanceCard } from '../components/BalanceCard';
import { FundPill } from '../components/FundPill';
import { LeaderboardWidget } from '../components/LeaderboardWidget';
import { InviteCard, InviteSheet } from '../components/InviteSheet';
import { TransfersSnackbar, YourTransfers, useTransfersState } from '../components/YourTransfers';
import { PaymentsList } from '../components/PaymentsList';
import { ExpenseList } from '../components/ExpenseList';
import { TripLayout } from '../components/TripLayout';
import type { Selection } from './TripRoute';
import { DetailsPanel, useDetailsSelection } from './DetailsPanel';
import { UpdatedTransactionsBanner } from '../components/UpdatedTransactionsBanner';
import { TripTabs } from '../components/TripTabs';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { AccountMenu } from '../components/AccountMenu';

/** The trip page for signed-in members (spec §5.1): phone order below 1024px, layout A from there. */
export function MemberTrip({ view, selection = null }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const wide = useIsWide();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'payments'>('expenses');

  const tripId = view.trip.id;
  const archived = view.trip.archived;
  const hasExpenses = view.expenses.length > 0;
  // The feed is empty only with no expenses and no fund income (spec §7.4); only then does the empty state carry the add link.
  const hasFeed = hasExpenses || (fundOf(view)?.incomes.length ?? 0) > 0;
  const canInvite = !archived && view.links !== null;
  const { detail, open } = useDetailsSelection(tripId, selection);
  // Held here, above the phone / layout A branch, so crossing 1024px keeps an open QR row and a pending tick (R-Z).
  const transfersState = useTransfersState(view);

  const addLink = (block: boolean, variant: 'primary' | 'secondary' = 'primary') =>
    archived ? undefined : (
      <Link
        className={cn(
          'fsl-button',
          `fsl-button--${variant}`,
          block && 'fsl-button--block w-full',
          buttonVariants({ variant: variant === 'primary' ? 'default' : 'secondary' }),
        )}
        to={`/t/${tripId}/expenses/new`}
      >
        {t('trip.addExpense')}
      </Link>
    );

  // While the invite card shows (no expenses yet) its Share is the one primary button, so every add steps back.
  const addVariant = !hasExpenses && canInvite ? 'secondary' : 'primary';

  const notice = archived ? (
    <p className="fsl-member__notice m-0 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
      {t('settings.archived')}
    </p>
  ) : null;
  // A brand-new trip leads with the invite card; the balance appears with the first expense.
  const balance = hasExpenses ? <BalanceCard view={view} /> : canInvite ? <InviteCard view={view} /> : null;
  // Under the balance (or invite) card; with no card on a fund-only trip it still shows, since the income counts as history.
  const fund = <FundPill view={view} />;
  const transfers = hasExpenses || view.suggestions.length > 0 ? <YourTransfers view={view} state={transfersState} /> : null;
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
      onOpenIncome={(id) => open('income', id)}
      hintable={hintable}
      add={addLink(false, addVariant)}
      addInHeading={inHeading}
    />
  );

  const header = (
    <>
      {canInvite && (
        <button
          type="button"
          className="fsl-member__invite inline-flex min-h-11 items-center gap-1 rounded-full border-0 bg-transparent px-3 text-sm font-medium text-foreground cursor-pointer transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          onClick={() => setInviteOpen(true)}
        >
          <Icon name="userPlus" size={20} />
          <span>{t('invite.button')}</span>
        </button>
      )}
      <Link
        className="fsl-member__settings inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        to={`/t/${tripId}/settings`}
        aria-label={t('member.settings')}
        title={t('member.settings')}
      >
        <Icon name="settings" size={20} />
      </Link>
      <AccountMenu />
    </>
  );

  return (
    <Screen
      title={view.trip.name}
      titleAlign="left"
      back="/trips"
      right={header}
      wide
      // R-D: no bottom bar on an empty trip, the empty state carries the only "+ Add expense". From 1024px it sits in the Expenses heading.
      bottomBar={!wide && hasFeed ? addLink(true, addVariant) : undefined}
    >
      {wide ? (
        <div className="fsl-member flex flex-col gap-4 py-4">
          <UpdatedTransactionsBanner view={view} />
          <TripLayout
            left={
              <>
                {notice}
                <LeaderboardWidget view={view} switching={selection !== null} />
                <ApprovalQueue view={view} switching={selection !== null} />
                {fund}
                {expenses(true, true)}
                {payments(false)}
              </>
            }
            right={selection ? <DetailsPanel view={view} selection={selection} /> : <>{balance}{transfers}</>}
          />
        </div>
      ) : (
        <div className="fsl-member flex flex-col gap-4 py-4">
          {notice}
          <UpdatedTransactionsBanner view={view} />
          <LeaderboardWidget view={view} />
          <ApprovalQueue view={view} />
          {balance}
          {fund}
          {transfers}
          <TripTabs activeTab={activeTab} onChange={setActiveTab} />
          {activeTab === 'expenses' ? expenses(true, false) : payments(true)}
        </div>
      )}
      {canInvite && <InviteSheet view={view} open={inviteOpen} onClose={() => setInviteOpen(false)} />}
      <TransfersSnackbar view={view} state={transfersState} />
    </Screen>
  );
}
