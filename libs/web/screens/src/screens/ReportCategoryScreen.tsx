import { useState, useEffect, useMemo, type JSX } from 'react';
import { useLocation, useParams } from 'react-router';
import { Cell, Pie, PieChart } from 'recharts';
import {
  compareBookRows,
  formatMoney,
  UNCATEGORIZED_CATEGORY_ID,
  type BookRow,
  type EntryView,
  type GroupRow,
  type GroupSettingsView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useCategoryDrilldown } from '@cc/web-data-access/reports';
import {
  useAssets,
  useCategories,
  useGroupSettings,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/ui/button';
import { Card } from '@cc/web-ui/components/ui/card';
import { ChartContainer } from '@cc/web-ui/components/ui/chart';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { TransactionRow, resolveCategoryIcon } from '../components/TransactionRow';
import { GroupRowSheet } from '../components/GroupRowSheet';
import { TransactionDetailContent } from './TransactionDetail';
import {
  groupReportSegments,
  reportSegmentColor,
} from '../components/reports/CategoryPiesCard';
import {
  buildReportSearch,
  compactReportAmount,
  formatReportPeriodHeading,
  parseReportQueryFromSearch,
} from '../components/reports/reportUrl';

export function ReportCategoryScreen(): JSX.Element {
  const t = useT();
  const params = useParams<{ categoryId?: string }>();
  const categoryId = params.categoryId ?? '';

  const location = useLocation();
  const today = todayLocal();

  const query = useMemo(
    () => parseReportQueryFromSearch(location.search, today),
    [location.search, today],
  );

  const backUrl = `/reports${buildReportSearch(query)}`;

  const {
    report,
    drilldown,
    matchingEntries,
    matchingGroupRows,
    isPending,
    error,
    refetch,
  } = useCategoryDrilldown(query, categoryId);

  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const wallets = walletsQuery.data?.wallets ?? [];
  const categories = categoriesQuery.data?.categories ?? [];

  const hasInvestmentWallet = wallets.some((w) => w.kind === 'investment');
  const assetsQuery = useAssets({ enabled: hasInvestmentWallet });
  const groupSettingsQuery = useGroupSettings({ enabled: query.includeGroups });

  const assets = assetsQuery.data?.assets ?? [];
  const groupSettings: GroupSettingsView =
    groupSettingsQuery.data?.settings ?? {
      defaultGroupCategoryId: null,
      countLoans: false,
    };

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<EntryView | null>(null);
  const [selectedGroupRow, setSelectedGroupRow] = useState<GroupRow | null>(null);

  useEffect(() => {
    setSelectedSubId(null);
  }, [categoryId, location.search]);

  const displayCategoryName = drilldown
    ? drilldown.categoryId === UNCATEGORIZED_CATEGORY_ID
      ? t('reports.uncategorized')
      : drilldown.name
    : t('reports.title');

  const prevPeriodInfo = useMemo(() => {
    if (!report || !drilldown) return null;
    const p = report.period.previous;
    const prevLabel =
      report.period.mode === 'month'
        ? `${p.from.slice(5, 7)}/${p.from.slice(0, 4)}`
        : report.period.mode === 'year'
          ? p.from.slice(0, 4)
          : `${p.from.slice(8, 10)}/${p.from.slice(5, 7)}–${p.to.slice(8, 10)}/${p.to.slice(5, 7)}`;

    const prevComparisonText = report.period.inProgress
      ? report.period.mode === 'month'
        ? t('reports.vsSamePeriodMonth')
        : t('reports.vsSamePeriod')
      : t('reports.vsPreviousPeriod', { label: prevLabel });

    const diffSign =
      drilldown.diffFromPrevious > 0
        ? '+'
        : drilldown.diffFromPrevious < 0
          ? '-'
          : '';
    const diffFormatted =
      drilldown.pctFromPrevious !== null
        ? `${drilldown.pctFromPrevious > 0 ? '+' : ''}${drilldown.pctFromPrevious}%`
        : `${diffSign}${formatMoney(Math.abs(drilldown.diffFromPrevious), drilldown.currency)}`;

    return { prevComparisonText, diffFormatted };
  }, [report, drilldown, t]);

  const filteredRows = useMemo(() => {
    let rows: BookRow[] = [
      ...matchingEntries.map((entry): BookRow => ({ kind: 'entry', entry })),
      ...matchingGroupRows,
    ];
    if (selectedSubId !== null && drilldown) {
      const subRows = drilldown.rows.filter(
        (r) => r.categoryId === selectedSubId,
      );
      const entryIds = new Set(
        subRows
          .filter((r) => r.kind === 'entry')
          .map((r) => (r as { entryId: string }).entryId),
      );
      const groupIds = new Set(
        subRows
          .filter((r) => r.kind === 'group')
          .map((r) => (r as { groupRowId: string }).groupRowId),
      );
      rows = rows.filter((r) => {
        if (r.kind === 'entry') return entryIds.has(r.entry.id);
        if (r.kind === 'group') return groupIds.has(r.id);
        return false;
      });
    }
    return rows.sort(compareBookRows);
  }, [matchingEntries, matchingGroupRows, selectedSubId, drilldown]);

  const formatSubLabel = (sub: {
    categoryId: string;
    name: string;
    isGeneralParentBucket?: boolean;
  }): string => {
    if (sub.categoryId === UNCATEGORIZED_CATEGORY_ID) {
      return t('reports.uncategorized');
    }
    if (sub.isGeneralParentBucket) {
      return t('reports.generalParentBucket', { name: displayCategoryName });
    }
    return sub.name;
  };

  const subCategorySegments = useMemo(
    () => groupReportSegments(drilldown?.subCategories ?? []),
    [drilldown?.subCategories],
  );

  const selectedSub =
    selectedSubId !== null && drilldown
      ? drilldown.subCategories.find((s) => s.categoryId === selectedSubId)
      : undefined;

  const selectedSubName = selectedSub ? formatSubLabel(selectedSub) : '';

  return (
    <Screen title={displayCategoryName} back={backUrl} wide>
      {isPending && !drilldown ? (
        <SkeletonList rows={4} />
      ) : error && !drilldown ? (
        <InlineError error={error} onRetry={refetch} />
      ) : !drilldown || !report ? (
        <EmptyState
          icon="pie-chart"
          title={t('reports.noMatchingTransactions')}
          body={t('reports.emptyBody')}
        />
      ) : (
        <div className="flex flex-col gap-4 w-full">
          {/* 1. Summary Card */}
          <Card
            data-testid="category-drilldown-summary"
            className="rounded-xl bg-card border border-border p-4 shadow-none ring-0 flex flex-col gap-2 w-full"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{formatReportPeriodHeading(report.period, t)}</span>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Icon
                  name={resolveCategoryIcon(drilldown.icon)}
                  size={16}
                  className="text-muted-foreground shrink-0"
                />
                <span className="truncate">{displayCategoryName}</span>
              </div>
            </div>

            <div
              className={cn(
                'text-2xl font-bold tabular-nums',
                drilldown.type === 'expense' ? 'text-danger' : 'text-success',
              )}
            >
              {drilldown.approximate ? '≈ ' : ''}
              {formatMoney(drilldown.total, drilldown.currency)}
            </div>

            <div className="text-xs text-muted-foreground flex flex-col gap-1">
              {prevPeriodInfo && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {prevPeriodInfo.diffFormatted} {prevPeriodInfo.prevComparisonText}
                  </span>
                  <span>
                    {t('reports.previousPeriodTotal')}:{' '}
                    {drilldown.approximate ? '≈ ' : ''}
                    {formatMoney(drilldown.previousTotal, drilldown.currency)}
                  </span>
                </div>
              )}
              <div>
                {drilldown.baseline3mAvg !== null ? (
                  <span>
                    {t('reports.baselineAvgLabel', {
                      count: String(drilldown.historyCount),
                    })}
                    : {drilldown.approximate ? '≈ ' : ''}
                    {formatMoney(drilldown.baseline3mAvg, drilldown.currency)}
                  </span>
                ) : (
                  <span>{t('reports.noBaselineYet')}</span>
                )}
              </div>
            </div>
          </Card>

          {/* 2. Sub-categories Breakdown Card */}
          {drilldown.subCategories.length > 0 && (
            <Card
              data-testid="category-subcategories-card"
              className="rounded-xl bg-card border border-border p-4 shadow-none ring-0 flex flex-col gap-3 w-full"
            >
              <h3 className="font-heading text-base font-semibold text-foreground">
                {t('reports.subCategoriesTitle')}
              </h3>

              <div className="relative w-full max-w-56 aspect-square mx-auto flex items-center justify-center">
                <ChartContainer
                  config={{}}
                  className="size-full aspect-square"
                  initialDimension={{ width: 224, height: 224 }}
                >
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={subCategorySegments}
                      dataKey="amount"
                      nameKey="key"
                      cx="50%"
                      cy="50%"
                      innerRadius="62%"
                      outerRadius="98%"
                      stroke="var(--card)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {subCategorySegments.map((seg) => (
                        <Cell
                          key={seg.key}
                          fill={seg.color}
                          className={
                            seg.key === 'other' ? undefined : 'cursor-pointer'
                          }
                          onClick={
                            seg.key === 'other'
                              ? undefined
                              : () =>
                                  setSelectedSubId((prev) =>
                                    prev === seg.key ? null : seg.key,
                                  )
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center select-none">
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {drilldown.approximate ? '≈ ' : ''}
                    {compactReportAmount(drilldown.total)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 w-full">
                {drilldown.subCategories.map((sub, idx) => {
                  const isSelected = selectedSubId === sub.categoryId;
                  const subLabel = formatSubLabel(sub);
                  const colorVar = reportSegmentColor(idx);

                  return (
                    <button
                      key={sub.categoryId}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelectedSubId((prev) =>
                          prev === sub.categoryId ? null : sub.categoryId,
                        )
                      }
                      className={cn(
                        'w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors motion-reduce:transition-none cursor-pointer border border-transparent',
                        isSelected
                          ? 'bg-muted border-border font-medium text-foreground'
                          : 'hover:bg-muted/50 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: colorVar }}
                        />
                        <span className="truncate">{subLabel}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 tabular-nums text-xs sm:text-sm">
                        <span>
                          {drilldown.approximate ? '≈ ' : ''}
                          {formatMoney(sub.amount, drilldown.currency)}
                        </span>
                        <span className="text-muted-foreground w-10 text-right">
                          {sub.percent}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* 3. Transactions Section */}
          <div
            data-testid="category-transactions-section"
            className="flex flex-col gap-3 w-full"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-base font-semibold text-foreground">
                {t('reports.matchingTransactions', {
                  count: filteredRows.length,
                })}
              </h3>
              {selectedSubId !== null && (
                <div
                  data-testid="active-sub-filter-chip"
                  className="flex items-center gap-1.5"
                >
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full truncate max-w-[150px] sm:max-w-[200px]">
                    {selectedSubName}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedSubId(null)}
                    className="min-h-11 px-3 text-xs flex items-center gap-1 rounded-full"
                  >
                    <Icon name="x" size={14} />
                    <span>{t('reports.clearSubFilter')}</span>
                  </Button>
                </div>
              )}
            </div>

            {filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('reports.noMatchingTransactions')}
              </p>
            ) : (
              <div className="bg-card rounded-xl border border-border overflow-hidden divide-y divide-border">
                {filteredRows.map((row) => (
                  <TransactionRow
                    key={
                      row.kind === 'entry'
                        ? `entry-${row.entry.id}`
                        : row.kind === 'group'
                          ? `group-${row.id}`
                          : `person-${row.id}`
                    }
                    row={row}
                    wallets={wallets}
                    categories={categories}
                    assets={assets}
                    settings={groupSettings}
                    showDate
                    onOpenEntry={setSelectedEntry}
                    onOpenGroup={setSelectedGroupRow}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Detail Sheets */}
      <Sheet
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={t('transactions.detailTitle')}
      >
        {selectedEntry && (
          <TransactionDetailContent
            entry={selectedEntry}
            wallets={wallets}
            categories={categories}
            assets={assets}
            onDone={() => setSelectedEntry(null)}
          />
        )}
      </Sheet>
      <GroupRowSheet
        row={selectedGroupRow}
        open={selectedGroupRow !== null}
        onClose={() => setSelectedGroupRow(null)}
      />
    </Screen>
  );
}
