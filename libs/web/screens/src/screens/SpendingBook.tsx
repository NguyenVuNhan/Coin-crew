import type { JSX } from 'react';
import { Link } from 'react-router';
import { formatVnd } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Amount } from '@cc/web-ui/components/Amount';
import { Icon } from '@cc/web-ui/components/icons';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Home } from './Home';
import { usePeopleTotals } from '../components/PeopleSummary';

function BookSummary(): JSX.Element {
  const t = useT();
  const {
    owedToYou,
    sumPositive,
    sumNegative,
    hasData,
    isLoading,
    error,
    refetch,
  } = usePeopleTotals();

  return (
    <>
      <div data-testid="book-empty" className="fsl-book__empty">
        <EmptyState
          icon="wallet"
          title={t('book.emptyTitle')}
          action={
            <p className="fsl-book__empty-body m-0 text-sm text-muted-foreground">
              {t('book.emptyBody')}
            </p>
          }
        />
      </div>

      {isLoading || !hasData ? (
        <SkeletonList rows={1} />
      ) : error ? (
        <InlineError error={error} onRetry={refetch} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Link
            to="/people"
            data-testid="book-people-row"
            className="fsl-book__people flex items-center gap-3 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none"
          >
            {owedToYou.length > 0 && (
              <div className="flex shrink-0 items-center -space-x-2.5">
                {owedToYou.slice(0, 3).map((person) => (
                  <Avatar
                    key={person.key}
                    name={person.name}
                    size="sm"
                    className="ring-2 ring-card"
                  />
                ))}
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">
                {t('book.peopleOwe')}
              </span>
              {sumNegative > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums truncate">
                  {t('home.totalOwe', { amount: formatVnd(sumNegative) })}
                </span>
              )}
            </div>
            <Amount value={sumPositive} tone="success" />
            <Icon name="chevronRight" className="text-muted-foreground shrink-0" />
          </Link>
        </div>
      )}
    </>
  );
}

export function SpendingBook(): JSX.Element {
  const t = useT();
  return <Home title={t('book.title')} summary={<BookSummary />} />;
}
