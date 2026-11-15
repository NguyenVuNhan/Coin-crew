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

  // Read out as one sentence, with each amount next to what it means.
  const owedLine = `${t('book.peopleOwe')}: ${formatVnd(sumPositive)}`;
  const peopleRowName =
    sumNegative > 0 ? `${owedLine}. ${t('home.totalOwe', { amount: formatVnd(sumNegative) })}` : owedLine;

  return (
    <>
      <div data-testid="book-empty" className="fsl-book__empty">
        {/* No action yet: wallets, and the button that creates the first one, arrive with #113. */}
        <EmptyState
          icon="wallet"
          title={t('book.emptyTitle')}
          body={t('book.emptyBody')}
        />
      </div>

      {isLoading || !hasData ? (
        <SkeletonList rows={1} />
      ) : error ? (
        <InlineError error={error} onRetry={refetch} />
      ) : (
        <div className="fsl-book__list bg-card border border-border rounded-xl overflow-hidden">
          <Link
            to="/people"
            data-testid="book-people-row"
            aria-label={peopleRowName}
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
              <span className="text-sm font-semibold text-foreground leading-snug">
                {t('book.peopleOwe')}
              </span>
              {sumNegative > 0 && (
                <span className="text-sm text-muted-foreground tabular-nums leading-snug">
                  {t('home.totalOwe', { amount: formatVnd(sumNegative) })}
                </span>
              )}
            </div>
            <Amount value={sumPositive} tone={sumPositive > 0 ? 'success' : 'neutral'} />
            <Icon name="chevronRight" className="text-muted-foreground shrink-0" />
          </Link>
        </div>
      )}
    </>
  );
}

/**
 * The main screen at `/trips`: today's Home, or the spending book once the person has turned it on.
 * One component for both, so flipping the setting changes the screen in place: the account menu that holds the
 * switch stays open and keeps the focus.
 */
export function MainScreen({ book }: { book: boolean }): JSX.Element {
  const t = useT();
  return <Home title={book ? t('book.title') : undefined} summary={book ? <BookSummary /> : undefined} />;
}

export function SpendingBook(): JSX.Element {
  return <MainScreen book />;
}
