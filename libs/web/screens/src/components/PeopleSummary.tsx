import type { JSX } from 'react';
import { Link } from 'react-router';
import { formatVnd, type PersonSummary } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { usePeopleSummary } from '@cc/web-data-access/people';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Amount } from '@cc/web-ui/components/Amount';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Card } from '@cc/web-ui/components/ui/card';
import { cn } from '@cc/web-ui/lib/utils';

// A guest's "I've paid" counts at once, so someone settled can still have a payment to confirm: keep them listed,
// on the side the money moved to.
const owedSide = (p: PersonSummary) =>
  p.total > 0 || (p.total === 0 && p.waiting.some((w) => w.direction === 'toOwner'));

const oweSide = (p: PersonSummary) =>
  p.total < 0 || (p.total === 0 && p.waiting.length > 0 && !owedSide(p));

export interface PeopleTotals {
  owedToYou: PersonSummary[];
  youOwe: PersonSummary[];
  sumPositive: number;
  sumNegative: number;
  isEmpty: boolean;
  incomplete: boolean;
  /** False until the first answer arrives. */
  hasData: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePeopleTotals(): PeopleTotals {
  const {
    people,
    incomplete,
    isLoading,
    error,
    refetch,
  } = usePeopleSummary();

  const owedToYou = (people ?? [])
    .filter(owedSide)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const youOwe = (people ?? [])
    .filter(oweSide)
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const isEmpty = owedToYou.length === 0 && youOwe.length === 0;

  const sumPositive = (people ?? []).filter((p) => p.total > 0).reduce((acc, p) => acc + p.total, 0);
  const sumNegative = (people ?? []).filter((p) => p.total < 0).reduce((acc, p) => acc + Math.abs(p.total), 0);

  return {
    owedToYou,
    youOwe,
    sumPositive,
    sumNegative,
    isEmpty,
    incomplete,
    hasData: people !== undefined,
    isLoading,
    error,
    refetch,
  };
}

export function PeopleTotalCard(): JSX.Element {
  const t = useT();
  const { isLoading, hasData, sumPositive, sumNegative } = usePeopleTotals();

  if (isLoading || !hasData) {
    return <SkeletonList rows={1} />;
  }

  return (
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
}

export function PeopleByPerson(): JSX.Element {
  const t = useT();
  const {
    owedToYou,
    youOwe,
    isEmpty,
    incomplete,
    isLoading,
    error,
    refetch,
  } = usePeopleTotals();

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

  return (
    <div className="fsl-home__by-person flex flex-col gap-2">
      <h2 className="fsl-home__heading text-sm font-semibold text-muted-foreground px-1">
        {t('home.byPerson')}
      </h2>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <InlineError error={error} onRetry={refetch} />
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
}
