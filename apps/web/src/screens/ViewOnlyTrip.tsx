import type { TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { nameOf } from '../lib/tripText';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Pill } from '../components/Pill';
import { Avatar } from '../components/Avatar';
import { Amount } from '../components/Amount';
import { EmptyState } from '../components/EmptyState';
import { ExpenseRow } from '../components/ExpenseRow';
import type { Selection } from './TripRoute';
import './ViewOnlyTrip.css';

export function ViewOnlyTrip({ view }: { view: TripView; selection?: Selection | null }) {
  const t = useT();

  return (
    <Screen title={view.trip.name} right={<LanguageButton />}>
      <div className="fsl-view-only">
        <div className="fsl-view-only__banner">
          <Pill tone="neutral">{t('trip.viewOnly')}</Pill>
          <span className="fsl-view-only__total">
            {t('trip.total', { amount: formatVnd(view.trip.total) })}
          </span>
        </div>

        <section className="fsl-view-only__section">
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

        <section className="fsl-view-only__section">
          <h2 className="fsl-section-heading">{t('trip.whoPaysWhom')}</h2>
          <div className="fsl-card">
            {view.suggestions.length === 0 ? (
              <div className="fsl-view-only__settled">
                {t('trip.allSettled')}
              </div>
            ) : (
              view.suggestions.map((suggestion, idx) => {
                const from = nameOf(view, suggestion.fromId);
                const to = nameOf(view, suggestion.toId);
                return (
                  <div
                    key={`${suggestion.fromId}-${suggestion.toId}-${idx}`}
                    className="fsl-view-only__row"
                  >
                    <span className="fsl-view-only__pays-text">
                      {t('trip.pays', { from, to })}
                    </span>
                    <Amount value={suggestion.amount} />
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="fsl-view-only__section">
          <h2 className="fsl-section-heading">{t('trip.expenses')}</h2>
          {view.expenses.length === 0 ? (
            <EmptyState title={t('expenses.empty')} action={null} />
          ) : (
            <div className="fsl-card">
              {view.expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  view={view}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </Screen>
  );
}
