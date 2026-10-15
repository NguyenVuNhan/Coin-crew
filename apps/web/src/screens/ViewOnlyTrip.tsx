import type { TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Pill } from '../components/Pill';
import { Avatar } from '../components/Avatar';
import { Amount } from '../components/Amount';
import { YourTransfers } from '../components/YourTransfers';
import { PaymentsList } from '../components/PaymentsList';
import { ExpenseList } from '../components/ExpenseList';
import { TripLayout } from '../components/TripLayout';
import type { Selection } from './TripRoute';
import { DetailsPanel, useDetailsSelection } from './DetailsPanel';
import './ViewOnlyTrip.css';

export function ViewOnlyTrip({ view, selection = null }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const wide = useIsWide();
  const { detail, open } = useDetailsSelection(view.trip.id, selection);

  const banner = (
    <div className="fsl-view-only__banner">
      <Pill tone="neutral">{t('trip.viewOnly')}</Pill>
      <span className="fsl-view-only__total">
        {t('trip.total', { amount: formatVnd(view.trip.total) })}
      </span>
    </div>
  );

  const balances = (
    <section className="fsl-view-only__section" aria-label={t('trip.balances')}>
      <h2 className="fsl-section-heading">{t('trip.balances')}</h2>
      <div className="fsl-card">
        {view.people.map((person) => {
          const balance = view.balances[person.id] ?? 0;
          return (
            <div key={person.id} className="fsl-view-only__row">
              <div className="fsl-view-only__person">
                <Avatar name={person.name} />
                <span className="fsl-view-only__name">{person.name}</span>
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
      addInHeading={inHeading}
    />
  );

  return (
    <Screen title={view.trip.name} right={<LanguageButton />} wide>
      <div className="fsl-view-only">
        {banner}
        {!wide ? (
          <>
            {balances}
            {transfers}
            {payments()}
            {expenses(false)}
          </>
        ) : (
          <TripLayout
            left={
              <>
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

