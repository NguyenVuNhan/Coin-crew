import { useState, useEffect, type JSX } from 'react';
import { Link } from 'react-router';
import { formatVnd } from '@cc/core';
import { currentMonthLocal } from '@cc/web-util/localDate';
import { useIsWide } from '@cc/web-util/media';
import { useT } from '@cc/web-i18n';
import {
  useAssets,
  useCategories,
  usePersonalList,
  usePersonalSummary,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Button } from '@cc/web-ui/components/Button';
import { Card } from '@cc/web-ui/components/ui/card';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Amount } from '@cc/web-ui/components/Amount';
import { Icon } from '@cc/web-ui/components/icons';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Home } from './Home';
import { usePeopleTotals } from '../components/PeopleSummary';
import { FirstWalletSheet } from '../components/FirstWalletSheet';
import { TransactionRow } from '../components/TransactionRow';
import { WalletPie } from '../components/WalletPie';
import { PersonalSettingsMenu } from '../components/PersonalSettingsMenu';

function BookTotal(): JSX.Element {
  const t = useT();
  const wallets = useWalletDetails();
  const list = wallets.data?.wallets;
  const hasWallet = (list?.length ?? 0) > 0;
  const currentMonth = currentMonthLocal();
  const summary = usePersonalSummary(currentMonth, { enabled: hasWallet });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (wallets.isSuccess && !hasWallet && !dismissed) {
      setSheetOpen(true);
    }
  }, [wallets.isSuccess, hasWallet, dismissed]);

  const closeSheet = () => {
    setSheetOpen(false);
    setDismissed(true);
  };

  const activeWallets = list ? list.filter((w) => !w.archived) : [];
  const fallbackTotal = activeWallets.reduce(
    (sum, w) => sum + (w.vndValue !== undefined ? (w.vndValue ?? 0) : w.currency === 'VND' ? w.balance : 0),
    0,
  );
  const totalVnd = summary.data ? summary.data.totalVnd : fallbackTotal;
  const approximate = summary.data ? summary.data.approximate : false;
  const pieSlices = activeWallets.map((w) => ({
    id: w.id,
    name: w.name,
    vndValue: w.vndValue !== undefined ? (w.vndValue ?? 0) : w.currency === 'VND' ? w.balance : 0,
    approximate: w.currency !== 'VND',
  }));

  return (
    <>
      {wallets.isPending ? (
        <SkeletonList rows={1} />
      ) : wallets.error ? (
        <InlineError error={wallets.error} onRetry={() => wallets.refetch()} />
      ) : hasWallet ? (
        <Card
          data-testid="book-total"
          className="fsl-book__total rounded-xl bg-card p-5 border border-border shadow-none ring-0 flex flex-col items-start gap-1 w-full text-card-foreground"
        >
          <div className="flex items-center justify-between w-full gap-2">
            <p className="fsl-book__total-label m-0 text-sm font-medium text-muted-foreground">
              {t('book.total')}
            </p>
            <Link
              to="/wallets"
              data-testid="book-wallets-link"
              className="fsl-book__wallets-link inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
            >
              <span>{t('wallets.viewAll')}</span>
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
          <Amount value={totalVnd} approximate={approximate} tone="neutral" size="xl" />
          <WalletPie slices={pieSlices} />
        </Card>
      ) : (
        <div data-testid="book-empty" className="fsl-book__empty">
          <EmptyState
            icon="wallet"
            title={t('book.emptyTitle')}
            body={t('book.emptyBody')}
            action={
              <Button
                variant="primary"
                block
                data-testid="book-create-wallet"
                onClick={() => setSheetOpen(true)}
              >
                {t('book.createWallet')}
              </Button>
            }
          />
        </div>
      )}

      <FirstWalletSheet open={sheetOpen} onClose={closeSheet} />
    </>
  );
}

function BookPeople(): JSX.Element {
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

  if (isLoading || !hasData) {
    return <SkeletonList rows={1} />;
  }
  if (error) {
    return <InlineError error={error} onRetry={refetch} />;
  }

  return (
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
  );
}

function BookRecent({ limit = 5 }: { limit?: number }): JSX.Element | null {
  const t = useT();
  const wallets = useWalletDetails();
  const list = wallets.data?.wallets;
  const hasWallet = (list?.length ?? 0) > 0;
  const hasInvestmentWallet = list?.some((w) => w.kind === 'investment') ?? false;
  const currentMonth = currentMonthLocal();
  const recentList = usePersonalList({ month: currentMonth }, { enabled: hasWallet });
  const categoriesQuery = useCategories({ enabled: hasWallet });
  const assetsQuery = useAssets({ enabled: hasInvestmentWallet });

  if (!hasWallet || !recentList.isSuccess) {
    return null;
  }

  return (
    <section
      data-testid="book-recent"
      className="fsl-book__recent flex flex-col gap-2 w-full"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">
          {t('transactions.recentTitle')}
        </h2>
        <Link
          to="/transactions"
          data-testid="book-recent-all"
          className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
        >
          <span>{t('transactions.allLink')}</span>
          <Icon name="chevronRight" size={16} />
        </Link>
      </div>
      {recentList.data.rows.length > 0 ? (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {recentList.data.rows.slice(0, limit).map((row) => (
            <TransactionRow
              key={row.kind === 'entry' ? row.entry.id : `person-${row.id}`}
              row={row}
              wallets={list ?? []}
              categories={categoriesQuery.data?.categories ?? []}
              assets={assetsQuery.data?.assets ?? []}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl px-4 py-4 text-sm text-muted-foreground">
          {t('wallet.noEntries')}
        </div>
      )}
    </section>
  );
}

function BookSummary(): JSX.Element {
  return (
    <>
      <BookTotal />
      <BookPeople />
      <BookRecent limit={5} />
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
  const wide = useIsWide();
  return (
    <Home
      title={book ? t('book.title') : undefined}
      summary={book ? (wide ? <BookPeople /> : <BookSummary />) : undefined}
      wideMain={
        book && wide ? (
          <>
            <BookTotal />
            <BookRecent limit={8} />
          </>
        ) : undefined
      }
      rightExtra={book ? <PersonalSettingsMenu /> : undefined}
    />
  );
}

export function SpendingBook(): JSX.Element {
  return <MainScreen book />;
}
