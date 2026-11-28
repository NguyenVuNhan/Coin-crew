import { useMemo, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { formatMoney, type ReportQuery } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { usePersonalReport } from '@cc/web-data-access/reports';
import { useTags, useWalletDetails } from '@cc/web-data-access/personalMoney';
import { Button as AppButton } from '@cc/web-ui/components/Button';
import { Button } from '@cc/web-ui/components/ui/button';
import { Card } from '@cc/web-ui/components/ui/card';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Pill } from '@cc/web-ui/components/Pill';
import { Skeleton, SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Icon } from '@cc/web-ui/components/icons';
import { Screen } from '../components/Screen';
import { ReportPeriodBar } from '../components/reports/ReportPeriodBar';
import { ReportFilterRow } from '../components/reports/ReportFilterRow';
import { ReportSummaryCard } from '../components/reports/ReportSummaryCard';
import { HealthTrendCard } from '../components/reports/HealthTrendCard';
import { CategoryPiesCard } from '../components/reports/CategoryPiesCard';
import { TagBarsCard } from '../components/reports/TagBarsCard';
import { WalletBalanceCard } from '../components/reports/WalletBalanceCard';
import {
  buildReportSearch,
  parseReportQueryFromSearch,
} from '../components/reports/reportUrl';

export function ReportsScreen(): JSX.Element {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayLocal();

  const query = useMemo(
    () => parseReportQueryFromSearch(location.search, today),
    [location.search, today],
  );

  const updateQuery = (next: ReportQuery) => {
    navigate(`/reports${buildReportSearch(next)}`, { replace: true });
  };

  const reportQuery = usePersonalReport(query);
  const walletsQuery = useWalletDetails();
  const tagsQuery = useTags({ enabled: Boolean(query.tagId) });

  const report = reportQuery.data;
  const wallets = walletsQuery.data?.wallets ?? [];

  const activeTagName = useMemo(() => {
    if (!query.tagId) return null;
    const found = (tagsQuery.data?.tags ?? []).find((tg) => tg.id === query.tagId);
    if (found) return found.name;
    const fromReport =
      report?.tags.expense.find((tg) => tg.tagId === query.tagId)?.name ??
      report?.tags.income.find((tg) => tg.tagId === query.tagId)?.name;
    return fromReport ?? null;
  }, [query.tagId, tagsQuery.data?.tags, report?.tags]);

  const hasActiveFilters =
    Boolean(query.walletId) || !query.includeGroups || Boolean(query.tagId);

  return (
    <Screen title={t('reports.title')} back="/trips" wide>
      <div className="flex flex-col gap-4 w-full">
        {/* Top controls */}
        <ReportPeriodBar
          query={query}
          period={report?.period}
          today={today}
          onChange={updateQuery}
        />
        {query.tagId && (
          <div className="flex items-center gap-2">
            <Pill
              tone="accent"
              data-testid="reports-tag-filter-pill"
              className="gap-0.5 py-0 pl-3 pr-0"
            >
              {activeTagName ? (
                <span>#{activeTagName}</span>
              ) : tagsQuery.isPending ? (
                <Skeleton width={64} height={14} radius="sm" />
              ) : (
                <span className="text-muted-foreground">#?</span>
              )}
              <button
                type="button"
                aria-label={t('reports.tagFilterClear')}
                onClick={() => updateQuery({ ...query, tagId: undefined })}
                className="inline-flex items-center justify-center min-h-11 min-w-11 -my-2 rounded-full bg-transparent border-0 text-secondary-foreground hover:bg-muted cursor-pointer p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="x" size={14} />
              </button>
            </Pill>
          </div>
        )}
        <ReportFilterRow
          query={query}
          wallets={wallets}
          onChange={updateQuery}
        />

        {/* Excluded from total wallet banner */}
        {report?.singleWallet?.excludedFromTotal && (
          <div
            data-testid="reports-excluded-wallet-banner"
            className="rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Icon name="info" size={16} className="shrink-0" />
            <span>{t('reports.excludedWalletBanner')}</span>
          </div>
        )}

        {/* Pending state */}
        {reportQuery.isPending && !report && <SkeletonList rows={4} />}

        {/* Error state */}
        {reportQuery.error && !report && (
          <InlineError
            error={reportQuery.error}
            onRetry={reportQuery.refetch}
          />
        )}

        {/* Unrated wallets warning banner */}
        {report && report.unratedWallets.length > 0 && (
          <div
            data-testid="reports-unrated-banner"
            className="rounded-xl border border-border bg-warning-soft px-3.5 py-3 flex flex-col gap-2 text-sm"
          >
            <div className="font-semibold text-warning-foreground">
              {t('reports.unratedNoticeTitle')}
            </div>
            {report.unratedWallets.map((w) => (
              <div
                key={w.walletId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <p className="text-warning-foreground text-sm">
                  {t('reports.unratedNoticeBody', {
                    name: w.name,
                    currency: w.currency,
                  })}
                </p>
                <AppButton
                  type="button"
                  variant="secondary"
                  className="min-h-11 px-4 shrink-0 self-start sm:self-auto"
                  onClick={() => updateQuery({ ...query, walletId: w.walletId })}
                >
                  {t('reports.unratedInspectWallet', { name: w.name })}
                </AppButton>
              </div>
            ))}
          </div>
        )}

        {/* Loaded report */}
        {report && (
          <>
            {/* Unrated-only state */}
            {report.hasAnyUnratedOnly ? (
              <Card
                data-testid="reports-unrated-only"
                className="rounded-xl bg-card border border-border p-4 shadow-none ring-0 flex flex-col gap-3 w-full"
              >
                <p className="text-sm text-muted-foreground">
                  {t('reports.unratedOnlyNote')}
                </p>
                <h3 className="font-heading text-sm font-semibold text-foreground">
                  {t('reports.perCurrencyBreakdown')}
                </h3>
                <div className="flex flex-col gap-2">
                  {report.perCurrency.map((c) => (
                    <div
                      key={c.currency}
                      className="flex items-center justify-between text-sm tabular-nums"
                    >
                      <span className="font-medium text-foreground">
                        {c.currency}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-danger">
                          - {formatMoney(c.spent, c.currency)}
                        </span>
                        <span className="text-success">
                          + {formatMoney(c.income, c.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : report.countedCount === 0 ? (
              /* Empty state */
              <EmptyState
                icon="pie-chart"
                title={t('reports.emptyTitle')}
                body={t('reports.emptyBody')}
                action={
                  hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 rounded-full"
                      onClick={() =>
                        updateQuery({
                          ...query,
                          walletId: undefined,
                          includeGroups: true,
                          tagId: undefined,
                        })
                      }
                    >
                      {t('reports.clearFilters')}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              /* Populated report */
              <div className="flex flex-col gap-4">
                <ReportSummaryCard report={report} />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Left column */}
                  <div className="lg:col-span-7 flex flex-col gap-4">
                    {report.walletBalance && (
                      <WalletBalanceCard balance={report.walletBalance} />
                    )}
                    <HealthTrendCard report={report} />
                  </div>

                  {/* Right column */}
                  <div className="lg:col-span-5 flex flex-col gap-4">
                    <div data-testid="reports-category-section">
                      <CategoryPiesCard
                        spending={report.spendingByCategory}
                        income={report.incomeByCategory}
                        currency={report.currency}
                        approximate={report.approximate}
                        onSelectCategory={(categoryId) =>
                          navigate(
                            `/reports/category/${encodeURIComponent(categoryId)}${buildReportSearch(query)}`,
                          )
                        }
                      />
                    </div>
                    <div data-testid="reports-tags-section">
                      <TagBarsCard
                        tags={report.tags}
                        period={report.period}
                        query={query}
                        currency={report.currency}
                        approximate={report.approximate}
                        firstDates={reportQuery.tagFirstDates}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Screen>
  );
}
