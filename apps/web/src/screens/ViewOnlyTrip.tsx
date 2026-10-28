import { useState } from 'react';
import type { TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Pill } from '../components/Pill';
import { Avatar } from '../components/Avatar';
import { Amount } from '../components/Amount';
import { FundPill } from '../components/FundPill';
import { LeaderboardWidget } from '../components/LeaderboardWidget';
import { YourTransfers } from '../components/YourTransfers';
import { PaymentsList } from '../components/PaymentsList';
import { ExpenseList } from '../components/ExpenseList';
import { TripLayout } from '../components/TripLayout';
import type { Selection } from './TripRoute';
import { DetailsPanel, useDetailsSelection } from './DetailsPanel';
import { TripTabs } from '../components/TripTabs';

export function ViewOnlyTrip({ view, selection = null }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const wide = useIsWide();
  const [activeTab, setActiveTab] = useState<'expenses' | 'payments'>('expenses');
  const { detail, open } = useDetailsSelection(view.trip.id, selection);

  const banner = (
    <div className="fsl-view-only__banner flex items-center gap-2">
      <Pill tone="neutral">{t('trip.viewOnly')}</Pill>
      <span className="fsl-view-only__total text-sm text-muted-foreground">
        {t('trip.total', { amount: formatVnd(view.trip.total) })}
      </span>
    </div>
  );

  const balances = (
    <section className="fsl-view-only__section flex flex-col gap-2" aria-label={t('trip.balances')}>
      <h2 className="fsl-section-heading text-sm font-semibold text-muted-foreground px-1">{t('trip.balances')}</h2>
      <div className="fsl-card rounded-xl border border-border bg-card overflow-hidden">
        {view.people.map((person) => {
          const balance = view.balances[person.id] ?? 0;
          return (
            <div key={person.id} className="fsl-view-only__row flex min-h-11 items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-b-0">
              <div className="fsl-view-only__person flex min-w-0 items-center gap-3">
                <Avatar name={person.name} avatarUrl={person.avatarUrl} />
                <span className="fsl-view-only__name truncate text-base font-semibold text-foreground">{person.name}</span>
              </div>
              <Amount value={balance} tone="auto" />
            </div>
          );
        })}
      </div>
    </section>
  );

  const transfers = <YourTransfers view={view} />;

  const payments = () => (
    <PaymentsList
      view={view}
      selectedId={detail?.kind === 'payment' ? detail.id : undefined}
      onOpen={(id) => open('payment', id)}
    />
  );

  const expenses = (inHeading: boolean) => (
    <ExpenseList
      view={view}
      selectedId={detail?.kind === 'expense' ? detail.id : undefined}
      onOpen={(id) => open('expense', id)}
      onOpenIncome={(id) => open('income', id)}
      addInHeading={inHeading}
    />
  );

  return (
    <Screen title={view.trip.name} right={<LanguageButton />} wide>
      <div className="fsl-view-only flex flex-col gap-4 py-4">
        {banner}
        {!wide ? (
          <>
            <LeaderboardWidget view={view} />
            <FundPill view={view} />
            {balances}
            {transfers}
            <TripTabs activeTab={activeTab} onChange={setActiveTab} />
            {activeTab === 'expenses' ? expenses(false) : payments()}
          </>
        ) : (
          <TripLayout
            left={
              <>
                <LeaderboardWidget view={view} switching={selection !== null} />
                <FundPill view={view} />
                {expenses(true)}
                {payments()}
              </>
            }
            right={
              selection ? (
                <DetailsPanel view={view} selection={selection} />
              ) : (
                <>
                  {balances}
                  {transfers}
                </>
              )
            }
          />
        )}
      </div>
    </Screen>
  );
}

