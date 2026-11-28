import { useState, useEffect, useMemo, type JSX } from "react";
import { Link } from "react-router";
import {
  compareRecentRows,
  formatMoney,
  formatVnd,
  type BookRow,
  type EntryView,
  type GroupRow,
  type GroupSettingsView,
} from "@cc/core";
import { currentMonthLocal } from "@cc/web-util/localDate";
import { useIsWide } from "@cc/web-util/media";
import { useT } from "@cc/web-i18n";
import {
  useAssets,
  useCategories,
  useGroupSettings,
  usePersonalList,
  usePersonalSummary,
  useWalletDetails,
} from "@cc/web-data-access/personalMoney";
import { useCurrentMonthReportTotals } from "@cc/web-data-access/reports";
import { upcomingTotals, usePlannedItems, useRecurringRules } from "@cc/web-data-access/recurring";
import { upcomingOccurrences, vnDate, type WalletDetailView } from "@cc/core";
import { EmptyState } from "@cc/web-ui/components/EmptyState";
import { Button } from "@cc/web-ui/components/Button";
import { Card } from "@cc/web-ui/components/ui/card";
import { Avatar } from "@cc/web-ui/components/Avatar";
import { Amount } from "@cc/web-ui/components/Amount";
import { Pill } from "@cc/web-ui/components/Pill";
import { Icon } from "@cc/web-ui/components/icons";
import { Sheet } from "@cc/web-ui/components/Sheet";
import { SkeletonList } from "@cc/web-ui/components/Skeleton";
import { InlineError } from "@cc/web-ui/components/InlineError";
import { Home } from "./Home";
import { TransactionDetailContent } from "./TransactionDetail";
import { usePeopleTotals } from "../components/PeopleSummary";
import { FirstWalletSheet } from "../components/FirstWalletSheet";
import { GroupRowSheet } from "../components/GroupRowSheet";
import { TransactionRow } from "../components/TransactionRow";
import { WalletPie } from "../components/WalletPie";
import { PersonalSettingsMenu } from "../components/PersonalSettingsMenu";
import { BookBudgets } from "../components/budgets/BookBudgets";

const DEFAULT_GROUP_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

function BookTotal(): JSX.Element {
  const t = useT();
  const wallets = useWalletDetails();
  const list = wallets.data?.wallets;
  const hasWallet = (list?.length ?? 0) > 0;
  const currentMonth = currentMonthLocal();
  const summary = usePersonalSummary(currentMonth, { enabled: hasWallet });
  const monthTotals = useCurrentMonthReportTotals({ enabled: hasWallet });

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
    (sum, w) =>
      sum +
      (w.vndValue !== undefined
        ? (w.vndValue ?? 0)
        : w.currency === "VND"
          ? w.balance
          : 0),
    0,
  );
  const fallbackCash = activeWallets.reduce(
    (sum, w) => sum + (w.currency === "VND" ? w.balance : (w.vndValue ?? 0)),
    0,
  );
  const totalVnd = summary.data ? summary.data.totalVnd : fallbackTotal;
  const cashVnd = summary.data
    ? (summary.data.cashVnd ?? summary.data.totalVnd)
    : fallbackCash;
  const approximate = summary.data ? summary.data.approximate : false;
  const pieSlices = activeWallets.map((w) => ({
    id: w.id,
    name: w.name,
    vndValue:
      w.vndValue !== undefined
        ? (w.vndValue ?? 0)
        : w.currency === "VND"
          ? w.balance
          : 0,
    approximate: w.currency !== "VND",
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
              {t("book.total")}
            </p>
            <Link
              to="/wallets"
              data-testid="book-wallets-link"
              className="fsl-book__wallets-link inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-2 -my-2 -mr-2"
            >
              <span>{t("wallets.viewAll")}</span>
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
          <Amount
            value={cashVnd}
            approximate={approximate}
            tone="neutral"
            size="xl"
          />
          {totalVnd !== cashVnd && (
            <p
              data-testid="wallets-total-with-assets"
              className="m-0 text-sm text-muted-foreground tabular-nums"
            >
              {t("wallets.totalWithAssets", {
                total: formatMoney(totalVnd, "VND"),
              })}
            </p>
          )}
          {monthTotals.ready && (
            <p
              data-testid="book-month-totals"
              className="m-0 text-xs text-muted-foreground tabular-nums flex flex-wrap items-center gap-x-1.5"
            >
              <span>
                {t('book.monthSpent')}{' '}
                <span className="font-semibold text-danger">
                  {monthTotals.approximate ? '≈ ' : ''}
                  {formatMoney(monthTotals.spent, 'VND')}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t('book.monthIncome')}{' '}
                <span className="font-semibold text-success">
                  {monthTotals.approximate ? '≈ ' : ''}
                  {formatMoney(monthTotals.income, 'VND')}
                </span>
              </span>
            </p>
          )}
          <WalletPie slices={pieSlices} />
        </Card>
      ) : (
        <div data-testid="book-empty" className="fsl-book__empty">
          <EmptyState
            icon="wallet"
            title={t("book.emptyTitle")}
            body={t("book.emptyBody")}
            action={
              <Button
                variant="primary"
                block
                data-testid="book-create-wallet"
                onClick={() => setSheetOpen(true)}
              >
                {t("book.createWallet")}
              </Button>
            }
          />
        </div>
      )}

      <FirstWalletSheet open={sheetOpen} onClose={closeSheet} />
    </>
  );
}

function BookPeople({
  hasWallet = false,
  wallets = [],
}: {
  hasWallet?: boolean;
  wallets?: WalletDetailView[];
}): JSX.Element {
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
  const owedLine = `${t("book.peopleOwe")}: ${formatVnd(sumPositive)}`;
  const peopleRowName =
    sumNegative > 0
      ? `${owedLine}. ${t("home.totalOwe", { amount: formatVnd(sumNegative) })}`
      : owedLine;

  if (isLoading || !hasData) {
    return <SkeletonList rows={1} />;
  }
  if (error) {
    return <InlineError error={error} onRetry={refetch} />;
  }

  return (
    <div className="fsl-book__list bg-card rounded-xl overflow-hidden divide-y divide-border">
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
            {t("book.peopleOwe")}
          </span>
          {sumNegative > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums leading-snug">
              {t("home.totalOwe", { amount: formatVnd(sumNegative) })}
            </span>
          )}
        </div>
        <Amount
          value={sumPositive}
          tone={sumPositive > 0 ? "success" : "neutral"}
        />
        <Icon name="chevronRight" className="text-muted-foreground shrink-0" />
      </Link>
      {hasWallet && (
        <Link
          to="/reports"
          data-testid="book-reports-row"
          className="fsl-book__reports flex items-center gap-3 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline"
        >
          <span
            aria-hidden="true"
            className="size-9 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
          >
            <Icon name="pie-chart" size={18} />
          </span>
          <div className="flex-1 flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground leading-snug">
              {t('book.reportsTitle')}
            </span>
            <span className="text-xs text-muted-foreground leading-snug truncate">
              {t('book.reportsDesc')}
            </span>
          </div>
          <Icon name="chevronRight" className="text-muted-foreground shrink-0" />
        </Link>
      )}
      {hasWallet && <BookRecurringRow wallets={wallets} />}
    </div>
  );
}

/** Takes the wallets from the parent: a second wallets observer here would refetch them on mount. */
function BookRecurringRow({ wallets }: { wallets: WalletDetailView[] }): JSX.Element {
  const t = useT();
  const rulesQuery = useRecurringRules();
  const plannedQuery = usePlannedItems();
  const today = vnDate(new Date());
  const rules = rulesQuery.data?.rules;
  const vndOut = useMemo(
    () => (rules ? upcomingTotals(upcomingOccurrences(rules, today, 30), wallets).vndOut : 0),
    [rules, today, wallets],
  );

  const ruleCount = rulesQuery.data?.rules.length ?? 0;
  const waitingCount = plannedQuery.data?.items.length ?? 0;
  const subLine =
    ruleCount > 0
      ? t('recurring.homeDesc', {
          count: ruleCount,
          amount: formatMoney(vndOut, 'VND'),
        })
      : t('recurring.homeEmptyDesc');

  return (
    <Link
      to="/recurring"
      data-testid="book-recurring-row"
      className="fsl-book__recurring flex items-center gap-3 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline"
    >
      <span
        aria-hidden="true"
        className="size-9 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
      >
        <Icon name="repeat" size={18} />
      </span>
      <div className="flex-1 flex flex-col min-w-0">
        <span className="text-sm font-semibold text-foreground leading-snug">
          {t('recurring.homeTitle')}
        </span>
        <span className="text-xs text-muted-foreground leading-snug line-clamp-2 tabular-nums">
          {subLine}
        </span>
      </div>
      {waitingCount > 0 && (
        <Pill tone="warning" data-testid="book-recurring-count" className="shrink-0 tabular-nums">
          {t('recurring.homeWaitingPill', { count: waitingCount })}
        </Pill>
      )}
      <Icon name="chevronRight" className="text-muted-foreground shrink-0" />
    </Link>
  );
}

function BookRecent({ limit = 5 }: { limit?: number }): JSX.Element | null {
  const t = useT();
  const wallets = useWalletDetails();
  const list = wallets.data?.wallets;
  const hasWallet = (list?.length ?? 0) > 0;
  const hasInvestmentWallet =
    list?.some((w) => w.kind === "investment") ?? false;
  const categoriesQuery = useCategories({ enabled: hasWallet });
  const assetsQuery = useAssets({ enabled: hasInvestmentWallet });
  const groupSettingsQuery = useGroupSettings({ enabled: hasWallet });
  const groupSettings =
    groupSettingsQuery.data?.settings ?? DEFAULT_GROUP_SETTINGS;
  // Newest activity first, across all months: a payment just marked paid or an entry just added sits on top.
  const recentList = usePersonalList(
    { recent: limit },
    { enabled: hasWallet, groups: true },
  );
  const [selectedEntry, setSelectedEntry] = useState<EntryView | null>(null);
  const [selectedGroupRow, setSelectedGroupRow] = useState<GroupRow | null>(
    null,
  );

  const mergedRows = useMemo<BookRow[]>(() => {
    if (!recentList.data) return [];
    const baseRows = recentList.data.rows;
    const grpRows = recentList.data.groupRows ?? [];
    return [...baseRows, ...grpRows].sort(compareRecentRows);
  }, [recentList.data]);

  if (!hasWallet) {
    return null;
  }

  return (
    <section
      data-testid="book-recent"
      className="fsl-book__recent flex flex-col gap-2 w-full"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">
          {t("transactions.recentTitle")}
        </h2>
        <Link
          to="/transactions"
          data-testid="book-recent-all"
          className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-2 -my-2 -mr-2"
        >
          <span>{t("transactions.allLink")}</span>
          <Icon name="chevronRight" size={16} />
        </Link>
      </div>
      {recentList.isPending ? (
        <SkeletonList rows={3} />
      ) : recentList.error ? (
        <InlineError
          error={recentList.error}
          onRetry={() => recentList.refetch()}
        />
      ) : mergedRows.length > 0 ? (
        <div className="bg-card rounded-xl overflow-hidden divide-y divide-border">
          {mergedRows.slice(0, limit).map((row) => (
            <TransactionRow
              key={
                row.kind === "entry"
                  ? row.entry.id
                  : row.kind === "group"
                    ? `g-${row.id}`
                    : `person-${row.id}`
              }
              row={row}
              wallets={list ?? []}
              categories={categoriesQuery.data?.categories ?? []}
              assets={assetsQuery.data?.assets ?? []}
              settings={groupSettings}
              showDate
              onOpenEntry={setSelectedEntry}
              onOpenGroup={setSelectedGroupRow}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="receipt"
          title={t("transactions.emptyTitle")}
          body={t("transactions.emptyBody")}
        />
      )}
      <Sheet
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={t("transactions.detailTitle")}
      >
        {selectedEntry && (
          <TransactionDetailContent
            entry={selectedEntry}
            wallets={list ?? []}
            categories={categoriesQuery.data?.categories ?? []}
            assets={assetsQuery.data?.assets ?? []}
            onDone={() => setSelectedEntry(null)}
          />
        )}
      </Sheet>
      <GroupRowSheet
        row={selectedGroupRow}
        open={selectedGroupRow !== null}
        onClose={() => setSelectedGroupRow(null)}
      />
    </section>
  );
}

function BookSummary({
  hasWallet = false,
  wallets,
}: {
  hasWallet?: boolean;
  wallets?: WalletDetailView[];
}): JSX.Element {
  return (
    <>
      <BookTotal />
      <BookPeople hasWallet={hasWallet} wallets={wallets} />
      <BookBudgets show={hasWallet} />
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
  // The quick-expense lists give way to "Giao dịch gần đây" once there is a wallet to show it in;
  // before the first wallet they stay, as DESIGN.md's empty state promises.
  const wallets = useWalletDetails({ enabled: book });
  const hasWallet = (wallets.data?.wallets.length ?? 0) > 0;
  return (
    <Home
      book={book && hasWallet}
      title={book ? t("book.title") : undefined}
      summary={book ? wide ? <BookPeople hasWallet={hasWallet} wallets={wallets.data?.wallets} /> : <BookSummary hasWallet={hasWallet} wallets={wallets.data?.wallets} /> : undefined}
      wideMain={
        book && wide ? (
          <>
            <BookTotal />
            <BookBudgets show={hasWallet} />
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
