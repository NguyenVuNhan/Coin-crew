import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { formatVnd, type ExpenseView, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { Screen } from '../components/Screen';
import { Amount } from '../components/Amount';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ExpenseRow } from '../components/ExpenseRow';
import { InlineError } from '../components/InlineError';
import { ApprovalsCard } from '../components/ApprovalsCard';
import { WhoPaysWhom } from '../components/WhoPaysWhom';
import { ShareLinks } from '../components/ShareLinks';
import { PaymentsList } from '../components/PaymentsList';
import type { Selection } from './TripRoute';
import './MemberTrip.css';

function useTripAction(tripId: string) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(method: 'POST' | 'PATCH', path: string, body: unknown = {}) {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/trips/${tripId}${path}`, method, body, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Hero({ view }: { view: TripView }) {
  const t = useT();
  const now = view.myBalance?.now ?? 0;
  const before = view.myBalance?.beforePayments ?? 0;
  const total = formatVnd(view.trip.total);
  const myPerson = view.people.find((p) => p.id === view.me.participantId);
  return (
    <div className="fsl-member__hero">
      {now > 0 ? (
        <>
          <p className="fsl-member__hero-label">{t('member.stillOwed')}</p>
          <Amount value={now} tone="success" size="xl" />
        </>
      ) : now < 0 ? (
        <>
          <p className="fsl-member__hero-label">{t('member.youOwe')}</p>
          <Amount value={-now} tone="danger" size="xl" />
        </>
      ) : (
        <p className="fsl-member__hero-label">{t('member.settled')}</p>
      )}
      <p className="fsl-member__hero-sub">
        {before !== 0 ? t('member.ofTotal', { amount: formatVnd(Math.abs(before)), total }) : t('member.tripTotal', { total })}
      </p>
      {now > 0 && myPerson && myPerson.bank === 'none' && (
        <div className="fsl-notice fsl-notice--accent" style={{ marginTop: 'var(--space-3)' }}>
          <span>{t('bankForm.addPrompt')} </span>
          <Link to="/me/bank">{t('bankForm.title')}</Link>
        </div>
      )}
    </div>
  );
}

function FewestSwitch({ view }: { view: TripView }) {
  const t = useT();
  const explainId = useId();
  const { busy, error, run } = useTripAction(view.trip.id);
  const on = view.trip.fewestTransfers;
  return (
    <div className="fsl-member__switch-block">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={explainId}
        className="fsl-member__switch"
        disabled={busy}
        onClick={() => run('PATCH', '', { fewestTransfers: !on })}
      >
        <span className={`fsl-member__track${on ? ' fsl-member__track--on' : ''}`} aria-hidden="true" />
        <span className="fsl-member__switch-label">{t('fewest.title')}</span>
      </button>
      <p id={explainId} className="fsl-member__switch-explain">{t('fewest.explain')}</p>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}

function ExpenseItem({ view, expense }: { view: TripView; expense: ExpenseView }) {
  const t = useT();
  const tripId = view.trip.id;
  const { busy, error, run } = useTripAction(tripId);
  const disabled = expense.status === 'disabled';
  return (
    <li className="fsl-member__expense">
      <div className="fsl-member__expense-main">
        <ExpenseRow expense={expense} view={view} href={`/t/${tripId}/expenses/${expense.id}/edit`} />
        {!view.trip.archived && (
          <Button
            variant="ghost"
            loading={busy}
            aria-label={`${disabled ? t('expenses.enable') : t('expenses.disable')} · ${t('expenses.actions', { description: expense.description })}`}
            onClick={() => run('POST', `/expenses/${expense.id}/${disabled ? 'enable' : 'disable'}`)}
          >
            {disabled ? t('expenses.enable') : t('expenses.disable')}
          </Button>
        )}
      </div>
      {error ? <InlineError error={error} /> : null}
    </li>
  );
}

/** The trip page for signed-in members (spec §10 screen 4). */
export function MemberTrip({ view }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const tripId = view.trip.id;
  const archived = view.trip.archived;
  const addExpense = (
    <Link className="fsl-button fsl-button--primary fsl-button--block" to={`/t/${tripId}/expenses/new`}>
      {t('trip.addExpense')}
    </Link>
  );

  return (
    <Screen
      title={view.trip.name}
      right={
        <Link className="fsl-member__settings" to={`/t/${tripId}/settings`} aria-label={t('member.settings')}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      }
    >
      <div className="fsl-member">
        {archived && <p className="fsl-member__notice">{t('settings.archived')}</p>}
        <ApprovalsCard view={view} />
        <Hero view={view} />
        {!archived && <FewestSwitch view={view} />}
        <WhoPaysWhom view={view} />
        <PaymentsList view={view} mode="member" />
        {!archived && view.expenses.length > 0 && addExpense}
        <section className="fsl-member__section" aria-label={t('trip.expenses')}>
          <h2 className="fsl-member__heading">{t('trip.expenses')}</h2>
          {view.expenses.length === 0 ? (
            <EmptyState title={t('expenses.empty')} action={archived ? null : addExpense} />
          ) : (
            <ul className="fsl-member__expenses">
              {view.expenses.map((e) => (
                <ExpenseItem key={e.id} view={view} expense={e} />
              ))}
            </ul>
          )}
        </section>
        {!archived && <ShareLinks view={view} />}
      </div>
    </Screen>
  );
}
