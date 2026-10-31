import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatVnd, type PersonSummary } from '@fsl/core';
import { useT } from '../i18n';
import { useMe, useTripView } from '../api/hooks';
import { useLedger, usePeopleSummary } from '../api/people';
import { useIsWide } from '../lib/media';
import { Screen } from '../components/Screen';
import { AccountMenu } from '../components/AccountMenu';
import { ConsentSheet } from '../components/ConsentSheet';
import { Avatar } from '../components/Avatar';
import { Amount } from '../components/Amount';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { Card } from '@/components/ui/card';
import { TripTabs } from '../components/TripTabs';
import { ExpenseList } from '../components/ExpenseList';
import { PaymentsList } from '../components/PaymentsList';
import { TripLayout } from '../components/TripLayout';
import type { Selection } from './TripRoute';
import { DetailsPanel } from './DetailsPanel';
import { cn } from '@/lib/utils';

export function Home(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const wide = useIsWide();
  const meQuery = useMe();
  const user = meQuery.data?.user;

  const { ledger, isLoading: ledgerLoading } = useLedger();
  const { view: ledgerView, isLoading: ledgerViewLoading } = useTripView(ledger?.tripId ?? '', 0);

  const {
    people,
    incomplete,
    isLoading: peopleLoading,
    error: peopleError,
    refetch: refetchPeople,
  } = usePeopleSummary();

  const [activeTab, setActiveTab] = useState<'expenses' | 'payments'>('expenses');
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  useEffect(() => {
    if (!wide && selection !== null) {
      setSelection(null);
    }
  }, [wide, selection]);

  // A guest's "I've paid" counts at once, so someone settled can still have a payment to confirm: keep them listed,
  // on the side the money moved to.
  const owedSide = (p: PersonSummary) =>
    p.total > 0 || (p.total === 0 && p.waiting.some((w) => w.direction === 'toOwner'));
  const oweSide = (p: PersonSummary) =>
    p.total < 0 || (p.total === 0 && p.waiting.length > 0 && !owedSide(p));

  const owedToYou = (people ?? [])
    .filter(owedSide)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const youOwe = (people ?? [])
    .filter(oweSide)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const isEmpty = owedToYou.length === 0 && youOwe.length === 0;

  const sumPositive = (people ?? []).filter((p) => p.total > 0).reduce((acc, p) => acc + p.total, 0);
  const sumNegative = (people ?? []).filter((p) => p.total < 0).reduce((acc, p) => acc + Math.abs(p.total), 0);

  const handleOpenExpense = (id: string) => {
    if (wide && ledgerView) {
      setSelection({ kind: 'expense', id });
    } else if (ledger) {
      navigate(`/t/${ledger.tripId}/expenses/${id}`);
    }
  };

  const handleOpenPayment = (id: string) => {
    if (wide && ledgerView) {
      setSelection({ kind: 'payment', id });
    } else if (ledger) {
      navigate(`/t/${ledger.tripId}/payments/${id}`);
    }
  };

  const handleOpenIncome = (id: string) => {
    if (wide && ledgerView) {
      setSelection({ kind: 'income', id });
    } else if (ledger) {
      navigate(`/t/${ledger.tripId}/fund/${id}`);
    }
  };

  const renderPersonRow = (p: PersonSummary) => {
    const hasSecondLine = p.groupLabel !== null || p.waiting.length > 0;

    return (
      <Link
        key={p.key}
        to={`/people/${encodeURIComponent(p.key)}`}
        data-testid={`person-row-${p.key}`}
        className="fsl-home__person flex items-center gap-3 px-4 py-3 min-h-[56px] border-b border-border last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none text-foreground"
      >
        <Avatar name={p.name} />
        <div className="fsl-home__person-info flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="fsl-home__person-name truncate text-base leading-snug">
            <span className="font-semibold text-foreground">{p.name}</span>
            {p.nickname ? (
              <span className="text-muted-foreground font-normal">
                {` "${p.nickname}"`}
              </span>
            ) : null}
          </div>
          {hasSecondLine && (
            <div className="fsl-home__person-sub text-sm text-muted-foreground truncate leading-snug">
              {p.groupLabel !== null && <span>{p.groupLabel}</span>}
              {p.groupLabel !== null && p.waiting.length > 0 && <span> · </span>}
              {p.waiting.length > 0 && <span>{t('home.waiting')}</span>}
            </div>
          )}
        </div>
        <span
          className={cn(
            'fsl-home__amount tabular-nums font-semibold shrink-0',
            p.total > 0 ? 'text-success' : p.total < 0 ? 'text-danger' : 'text-muted-foreground',
          )}
        >
          {p.total > 0 ? '+' : p.total < 0 ? '−' : ''}
          <Amount
            value={Math.abs(p.total)}
            tone={p.total > 0 ? 'success' : p.total < 0 ? 'danger' : 'neutral'}
          />
        </span>
      </Link>
    );
  };

  const totalCard = peopleLoading || people === undefined ? (
    <SkeletonList rows={1} />
  ) : (
    <Card
      data-testid="home-total"
      className="fsl-home__total rounded-xl bg-card p-5 border border-border shadow-none ring-0 flex flex-col items-start gap-1 w-full text-card-foreground"
    >
      <p className="fsl-home__total-label m-0 text-sm font-medium text-muted-foreground">
        {t('home.totalOwed')}
      </p>
      <Amount
        value={sumPositive}
        tone="success"
        size="xl"
      />
      {sumNegative > 0 && (
        <p className="fsl-home__total-owe m-0 text-sm text-muted-foreground tabular-nums">
          {t('home.totalOwe', { amount: formatVnd(sumNegative) })}
        </p>
      )}
    </Card>
  );

  const byPersonSection = (
    <div className="fsl-home__by-person flex flex-col gap-2">
      <h2 className="fsl-home__heading text-sm font-semibold text-muted-foreground px-1">
        {t('home.byPerson')}
      </h2>

      {peopleLoading ? (
        <SkeletonList rows={3} />
      ) : peopleError ? (
        <InlineError error={peopleError} onRetry={refetchPeople} />
      ) : isEmpty ? (
        <>
          <EmptyState
            icon="users"
            title={t('home.peopleEmptyTitle')}
            action={
              <p className="fsl-home__empty-body m-0 text-base text-muted-foreground">
                {t('home.peopleEmptyBody')}
              </p>
            }
          />
          {incomplete && (
            <p className="fsl-home__still-counting m-0 px-1 text-sm text-muted-foreground text-center">
              {t('home.stillCounting')}
            </p>
          )}
        </>
      ) : (
        <div className="fsl-home__people-sections flex flex-col gap-4">
          {owedToYou.length > 0 && (
            <section className="fsl-home__section flex flex-col gap-2">
              <h3 className="sr-only">{t('home.owedToYou')}</h3>
              <div className="fsl-home__list bg-card border border-border rounded-xl overflow-hidden">
                {owedToYou.map(renderPersonRow)}
              </div>
            </section>
          )}
          {youOwe.length > 0 && (
            <section className="fsl-home__section flex flex-col gap-2">
              <h3 className="sr-only">{t('home.youOwe')}</h3>
              <div className="fsl-home__list bg-card border border-border rounded-xl overflow-hidden">
                {youOwe.map(renderPersonRow)}
              </div>
            </section>
          )}
          {incomplete && (
            <p className="fsl-home__still-counting m-0 px-1 text-sm text-muted-foreground text-center">
              {t('home.stillCounting')}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const navProps = ledger
    ? { section: 'home' as const, addHref: `/t/${ledger.tripId}/expenses/new` }
    : undefined;

  return (
    <Screen
      title={t('home.title')}
      right={user ? <AccountMenu user={user} /> : undefined}
      wide
      nav={navProps}
    >
      <ConsentSheet />
      {wide ? (
        <div className="fsl-home flex flex-col gap-4 py-4">
          <TripLayout
            left={
              ledgerLoading || ledgerViewLoading ? (
                <SkeletonList rows={4} />
              ) : ledgerView ? (
                <>
                  <ExpenseList
                    view={ledgerView}
                    selectedId={selection?.kind === 'expense' ? selection.id : undefined}
                    onOpen={handleOpenExpense}
                    onOpenIncome={handleOpenIncome}
                    hintable={true}
                  />
                  <PaymentsList
                    view={ledgerView}
                    selectedId={selection?.kind === 'payment' ? selection.id : undefined}
                    onOpen={handleOpenPayment}
                    hintable={false}
                  />
                </>
              ) : null
            }
            right={
              selection && ledgerView ? (
                <DetailsPanel view={ledgerView} selection={selection} />
              ) : (
                <>
                  {totalCard}
                  {byPersonSection}
                </>
              )
            }
          />
        </div>
      ) : (
        <div className="fsl-home flex flex-col gap-4 py-4">
          {totalCard}
          {byPersonSection}
          <TripTabs activeTab={activeTab} onChange={setActiveTab} />
          {ledgerLoading || ledgerViewLoading ? (
            <SkeletonList rows={3} />
          ) : ledgerView ? (
            activeTab === 'expenses' ? (
              <ExpenseList
                view={ledgerView}
                onOpen={handleOpenExpense}
                onOpenIncome={handleOpenIncome}
                hintable={true}
              />
            ) : (
              <PaymentsList
                view={ledgerView}
                onOpen={handleOpenPayment}
                hintable={true}
              />
            )
          ) : null}
        </div>
      )}
    </Screen>
  );
}
