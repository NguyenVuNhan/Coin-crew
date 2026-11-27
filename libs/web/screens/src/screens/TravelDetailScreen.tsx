import { useMemo, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router';
import {
  CURRENCIES,
  formatMoney,
  travelState,
  type CurrencyCode,
  type TravelExisting,
  type TravelSavedResponse,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useBudgets } from '@cc/web-data-access/budgets';
import { useMyGroups } from '@cc/web-data-access/groups';
import { useCategories } from '@cc/web-data-access/personalMoney';
import { useTravels, useTravelSummary } from '@cc/web-data-access/travels';
import { Amount } from '@cc/web-ui/components/Amount';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Pill } from '@cc/web-ui/components/Pill';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { resolveCategoryIcon } from '../components/TransactionRow';
import { BudgetBar } from '../components/budgets/BudgetBar';
import { formatDayMonth } from '../components/budgets/budgetLabels';
import { TravelExistingSheet } from '../components/travels/TravelExistingSheet';
import { formatTravelRange, TravelForm } from '../components/travels/TravelForm';

const STATE_PILL_TONE = {
  on: 'accent',
  upcoming: 'warning',
  done: 'neutral',
} as const;

/** Trip detail screen: summary card, optional budget bar, category & day breakdowns, and transaction link. */
export function TravelDetailScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const tripId = id ?? '';
  const t = useT();
  const today = todayLocal();

  const travelsQuery = useTravels({ enabled: Boolean(tripId) });
  const { travel, summary, progress, isPending, error } = useTravelSummary(tripId);
  const budgetsQuery = useBudgets({ enabled: Boolean(travel?.budgetId) });
  const categoriesQuery = useCategories();
  const groupsQuery = useMyGroups({ enabled: Boolean(travel && travel.groupIds.length > 0) });

  const [formOpen, setFormOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode | null>(null);
  const [pendingExisting, setPendingExisting] = useState<{
    travelId: string;
    existing: TravelExisting;
  } | null>(null);

  const categoryById = useMemo(
    () => new Map((categoriesQuery.data?.categories ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data?.categories],
  );

  const groupNameById = useMemo(
    () => new Map((groupsQuery.data?.items ?? []).map((g) => [g.id, g.name])),
    [groupsQuery.data?.items],
  );

  const budgetCurrency: CurrencyCode = useMemo(() => {
    if (!travel?.budgetId) return 'VND';
    const def = (budgetsQuery.data?.budgets ?? []).find((b) => b.id === travel.budgetId);
    return def?.currency ?? 'VND';
  }, [travel?.budgetId, budgetsQuery.data?.budgets]);

  const currencies = summary?.currencies ?? [];
  const activeSummary = useMemo(() => {
    if (currencies.length === 0) return null;
    if (selectedCurrency) {
      const match = currencies.find((c) => c.currency === selectedCurrency);
      if (match) return match;
    }
    return currencies[0]!;
  }, [currencies, selectedCurrency]);

  const totalCount = summary?.rowIds.length ?? 0;

  const handleSaved = (res: TravelSavedResponse) => {
    setFormOpen(false);
    const existingCount = res.existing.own.count + res.existing.shares.count;
    if (existingCount > 0) {
      setPendingExisting({ travelId: res.travel.id, existing: res.existing });
    }
  };

  const state = travel ? travelState(travel, today) : null;

  const groupLabel = useMemo(() => {
    if (!travel) return '';
    if (travel.groupIds.length === 0) return t('travels.solo');
    const names = travel.groupIds
      .map((gid) => groupNameById.get(gid))
      .filter((name): name is string => Boolean(name));
    return names.join(', ');
  }, [travel, groupNameById, t]);

  const txHref = travel
    ? `/transactions?tagId=${encodeURIComponent(travel.tagId)}&from=${encodeURIComponent(travel.countsFrom)}&to=${encodeURIComponent(travel.end)}`
    : '/transactions';

  const usedPct =
    progress && progress.limit > 0
      ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
      : 0;
  const todayPct =
    progress && state === 'on' ? Math.round(progress.elapsed * 100) : undefined;
  const isOver = Boolean(progress && progress.spent > progress.limit);
  const budgetDiff = progress ? Math.abs(progress.limit - progress.spent) : 0;

  return (
    <Screen
      title={travel?.name ?? t('travels.listTitle')}
      back="/travels"
      right={
        travel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFormOpen(true)}
            data-testid="travel-edit-button"
            aria-label={t('travels.edit')}
            title={t('travels.edit')}
            className="size-11 p-0"
          >
            <Icon name="edit" size={22} />
          </Button>
        ) : undefined
      }
    >
      <div className="fsl-travel-detail flex flex-col gap-4">
        {isPending && !travel ? (
          <SkeletonList rows={3} />
        ) : error && !travel ? (
          <InlineError error={error} onRetry={() => travelsQuery.refetch()} />
        ) : !travel || !state ? (
          <div data-testid="travel-not-found">
            <EmptyState
              icon="plane"
              title={t('travels.notFound')}
              body={t('travels.notFoundBody')}
              action={
                <Button variant="primary" block href="/travels">
                  {t('travels.listTitle')}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Meta line: dates · groups · state pill */}
            <div
              data-testid="travel-meta-line"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground px-1"
            >
              <span>{formatTravelRange(travel.start, travel.end)}</span>
              {groupLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{groupLabel}</span>
                </>
              )}
              <Pill tone={STATE_PILL_TONE[state]} data-testid="travel-state-pill">
                {t(`travels.statePill.${state}`)}
              </Pill>
            </div>

            {isPending && !summary ? (
              <SkeletonList rows={3} />
            ) : error && !summary ? (
              <InlineError error={error} onRetry={() => travelsQuery.refetch()} />
            ) : totalCount === 0 || !activeSummary ? (
              <div data-testid="travel-empty">
                <EmptyState
                  icon="plane"
                  title={t('travels.empty')}
                  action={
                    <Button variant="secondary" block href="/entries/new">
                      {`+ ${t('travels.addExpense')}`}
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                {/* Summary card */}
                <div
                  data-testid="travel-summary-card"
                  className="rounded-xl bg-card border border-border p-5 flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('travels.total')}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {currencies.map((c) => (
                        <Amount
                          key={c.currency}
                          value={c.total}
                          currency={c.currency}
                          size="xl"
                        />
                      ))}
                    </div>
                    {summary?.approxVnd !== null && summary?.approxVnd !== undefined && (
                      <p
                        data-testid="travel-approx"
                        className="m-0 text-sm text-muted-foreground tabular-nums"
                      >
                        {t('travels.approx', {
                          amount: formatMoney(summary.approxVnd, 'VND'),
                        })}
                      </p>
                    )}
                  </div>

                  {travel.budgetId !== null && progress !== null && (
                    <div className="flex flex-col gap-2 pt-1">
                      <div
                        data-testid="travel-budget-status"
                        className={cn(
                          'flex items-center gap-1.5 text-sm font-medium',
                          isOver
                            ? 'text-danger'
                            : progress.state === 'fast' || progress.state === 'near'
                              ? 'text-warning-foreground'
                              : 'text-success',
                        )}
                      >
                        <Icon
                          name={isOver ? 'info' : 'circleCheck'}
                          size={16}
                          className="shrink-0"
                        />
                        <span>
                          {isOver
                            ? t('travels.over', {
                                amount: formatMoney(budgetDiff, budgetCurrency),
                                limit: formatMoney(progress.limit, budgetCurrency),
                              })
                            : t('travels.under', {
                                amount: formatMoney(budgetDiff, budgetCurrency),
                                limit: formatMoney(progress.limit, budgetCurrency),
                              })}
                        </span>
                      </div>
                      <BudgetBar state={progress.state} used={usedPct} today={todayPct} />
                    </div>
                  )}

                  <div className="border-t border-border pt-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{t('travels.own')}</span>
                      <Amount
                        value={activeSummary.own}
                        currency={activeSummary.currency}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{t('travels.group')}</span>
                      <Amount
                        value={activeSummary.group}
                        currency={activeSummary.currency}
                        size="sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Currency switch when multiple currencies */}
                {currencies.length > 1 && (
                  <div
                    data-testid="travel-currency-switch"
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label={t('travels.total')}
                  >
                    {currencies.map((c) => {
                      const isSelected = c.currency === activeSummary.currency;
                      const info = CURRENCIES[c.currency];
                      return (
                        <button
                          key={c.currency}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedCurrency(c.currency)}
                          className="min-h-11 inline-flex items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                        >
                          <Pill tone={isSelected ? 'accent' : 'neutral'} className="px-3 py-1 text-xs">
                            {`${info.symbol} ${c.currency}`}
                          </Pill>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Breakdown: By category */}
                {activeSummary.byCategory.length > 0 && (
                  <section data-testid="travel-by-category" className="flex flex-col gap-2">
                    <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                      {currencies.length > 1
                        ? `${t('travels.byCategory')} · ${CURRENCIES[activeSummary.currency].symbol}`
                        : t('travels.byCategory')}
                    </h2>
                    <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
                      {activeSummary.byCategory.map((item) => {
                        const cat = categoryById.get(item.categoryId);
                        const pct =
                          activeSummary.total > 0
                            ? Math.min(100, Math.round((item.amount / activeSummary.total) * 100))
                            : 0;
                        return (
                          <div
                            key={item.categoryId}
                            data-testid={`travel-cat-row-${item.categoryId}`}
                            className="px-4 py-3 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 text-sm font-medium text-foreground min-w-0 truncate">
                                <Icon
                                  name={resolveCategoryIcon(cat?.icon)}
                                  size={16}
                                  className="text-muted-foreground shrink-0"
                                />
                                <span className="truncate">
                                  {cat?.name ?? t('reports.uncategorized')}
                                </span>
                              </span>
                              <Amount
                                value={item.amount}
                                currency={activeSummary.currency}
                                size="sm"
                              />
                            </div>
                            <div
                              className="relative h-2 rounded-full bg-muted overflow-hidden"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Breakdown: By day */}
                {activeSummary.byDay.length > 0 && (
                  <section data-testid="travel-by-day" className="flex flex-col gap-2">
                    <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                      {t('travels.byDay')}
                    </h2>
                    <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
                      {activeSummary.byDay.map((item) => (
                        <div
                          key={item.date}
                          data-testid={`travel-day-row-${item.date}`}
                          className="min-h-11 px-4 py-3 flex items-center justify-between gap-2"
                        >
                          <span className="text-sm text-foreground">
                            {item.date === 'leadup'
                              ? t('travels.leadup')
                              : formatDayMonth(item.date)}
                          </span>
                          <Amount
                            value={item.amount}
                            currency={activeSummary.currency}
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Transactions link */}
                <Link
                  to={txHref}
                  data-testid="travel-see-tx"
                  className="min-h-11 rounded-xl bg-card border border-border px-4 py-3 flex items-center justify-between text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none no-underline"
                >
                  <span>{t('travels.seeTx', { n: totalCount })}</span>
                  <Icon name="chevronRight" size={18} />
                </Link>
              </>
            )}
          </>
        )}
      </div>

      {travel && (
        <TravelForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          travel={travel}
          onSaved={handleSaved}
        />
      )}

      <TravelExistingSheet
        travelId={pendingExisting?.travelId ?? null}
        existing={pendingExisting?.existing ?? null}
        onDone={() => setPendingExisting(null)}
      />
    </Screen>
  );
}
