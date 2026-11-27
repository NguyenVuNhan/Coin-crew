import { useMemo, useState, type JSX, type MouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  BUDGET_NEAR,
  budgetProgress,
  firstBudgetPeriod,
  formatMoney,
  limitFor,
  type BudgetDef,
  type BudgetProgress,
  type GroupSettingsView,
} from '@cc/core';
import { getLang, useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import {
  useBudgets,
  useBudgetsProgress,
  useUpdateBudget,
} from '@cc/web-data-access/budgets';
import {
  useAssets,
  useCategories,
  useGroupSettings,
  useTags,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { BudgetArc } from '../components/budgets/BudgetArc';
import { BudgetForm } from '../components/budgets/BudgetForm';
import { BudgetHistoryChart } from '../components/budgets/BudgetHistoryChart';
import { BudgetTransactions } from '../components/budgets/BudgetTransactions';
import { buildBudgetChartModel } from '../components/budgets/budgetChartModel';
import { findChildBudgets, findParentBudget, progressById } from '../components/budgets/budgetOverlap';
import {
  formatBudgetPeriodLabel,
  formatDayMonth,
  parseYmd,
} from '../components/budgets/budgetLabels';
import { approxMoney, budgetTimeLeft } from '../components/budgets/budgetWords';

const DEFAULT_GROUP_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

function nextDayYmd(ymd: string): string {
  const [y, m, d] = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const ry = String(dt.getUTCFullYear()).padStart(4, '0');
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

function Stat({
  label,
  value,
  align = 'left',
  valueTestId,
  valueClassName,
}: {
  label: string;
  value: string;
  align?: 'left' | 'center' | 'right';
  valueTestId?: string;
  valueClassName?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col min-w-0',
        align === 'center' && 'items-center',
        align === 'right' && 'items-end',
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        data-testid={valueTestId}
        className={cn(
          'text-sm font-semibold tabular-nums text-foreground',
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function buildStateNote(
  progress: BudgetProgress,
  def: BudgetDef,
  t: ReturnType<typeof useT>,
): string {
  const { state, limit, spent, left, daysLeft, period, projectedOverPct } =
    progress;

  if (daysLeft <= 0) {
    if (state === 'over') {
      return t('budgets.notePastOver', {
        amount: formatMoney(Math.abs(left), def.currency),
        limit: formatMoney(limit, def.currency),
      });
    }
    if (state === 'near') {
      return t('budgets.notePastNear', {
        limit: formatMoney(limit, def.currency),
        spent: formatMoney(spent, def.currency),
      });
    }
    return t('budgets.notePastFine', {
      left: formatMoney(Math.max(0, left), def.currency),
    });
  }

  if (state === 'over') {
    return t(def.periodKind === 'once' ? 'budgets.noteOverOnce' : 'budgets.noteOver');
  }

  if (state === 'fast') {
    const projectedOver = Math.max(
      0,
      Math.round((projectedOverPct ?? 0) * limit),
    );
    return t('budgets.noteFast', {
      amount: approxMoney(projectedOver, getLang(), def.currency),
    });
  }

  if (state === 'near') {
    return t('budgets.noteNear', { end: formatDayMonth(period.to) });
  }

  return t('budgets.noteFine');
}

export function BudgetDetailScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const t = useT();
  const lang = getLang();
  const today = todayLocal();

  const budgetsQuery = useBudgets();
  const { source, defs, groups, history, suggestion, rowsFor, isPending, error } =
    useBudgetsProgress();
  const updateBudget = useUpdateBudget();

  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const tagsQuery = useTags();
  const groupSettingsQuery = useGroupSettings();

  const wallets = walletsQuery.data?.wallets ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const tags = tagsQuery.data?.tags ?? [];
  const groupSettings = groupSettingsQuery.data?.settings ?? DEFAULT_GROUP_SETTINGS;
  const hasInvestmentWallet = wallets.some((w) => w.kind === 'investment');
  const assetsQuery = useAssets({ enabled: hasInvestmentWallet });
  const assets = assetsQuery.data?.assets ?? [];

  const def = useMemo(
    () => (id ? defs.find((b) => b.id === id) ?? null : null),
    [defs, id],
  );

  const parentById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const cat of categories) {
      map.set(cat.id, cat.parentId);
    }
    return map;
  }, [categories]);

  const childBudgetNames = useMemo(() => {
    if (!def) return '';
    return findChildBudgets(def, defs, parentById)
      .map((child) => child.name)
      .join(', ');
  }, [def, defs, parentById]);

  const parentBudget = useMemo(
    () => (def ? findParentBudget(def, defs, parentById) : null),
    [def, defs, parentById],
  );

  const progressMap = useMemo(() => progressById(groups), [groups]);
  const parentProgress = parentBudget ? progressMap.get(parentBudget.id) ?? null : null;
  /** The parent budget is over: this page says stop and links to it instead of its own advice. */
  const parentIsOver = parentProgress?.state === 'over';

  const [selectedPeriodFrom, setSelectedPeriodFrom] = useState<string | null>(
    null,
  );

  const allPeriods = useMemo(() => {
    if (!def) return [];
    const h = history(def.id);
    if (h.length > 0) return h;
    const first = firstBudgetPeriod(def);
    return [{ period: first, limit: limitFor(def, first), spent: 0 }];
  }, [def, history]);

  const selectedIndex = useMemo(() => {
    if (allPeriods.length === 0) return 0;
    if (selectedPeriodFrom === null) return 0;
    const idx = allPeriods.findIndex((p) => p.period.from === selectedPeriodFrom);
    return idx >= 0 ? idx : 0;
  }, [allPeriods, selectedPeriodFrom]);

  const shownItem = allPeriods[selectedIndex] ?? null;

  const shownProgress = useMemo(() => {
    if (!def || !shownItem) return null;
    return budgetProgress(def, shownItem.spent, shownItem.period, today);
  }, [def, shownItem, today]);

  const activeSuggestion = useMemo(
    () => (def ? suggestion(def.id) : null),
    [def, suggestion],
  );

  const countedRows = useMemo(() => {
    if (!def || !shownItem) return [];
    return rowsFor(def.id, shownItem.period);
  }, [def, shownItem, rowsFor]);

  const chartModel = useMemo(() => {
    if (!def || !shownItem) return null;
    return buildBudgetChartModel({
      def,
      shownItem,
      allPeriods,
      countedRows,
      today,
      lang,
      t,
    });
  }, [def, shownItem, allPeriods, countedRows, today, lang, t]);

  const pastPeriods = useMemo(() => {
    if (!def || def.periodKind === 'once') return [];
    return allPeriods.slice(1, 6);
  }, [def, allPeriods]);

  const canStepPrev = selectedIndex < allPeriods.length - 1;
  const canStepNext = selectedIndex > 0;

  const handleStepPrev = () => {
    if (!canStepPrev) return;
    const prev = allPeriods[selectedIndex + 1];
    if (prev) setSelectedPeriodFrom(prev.period.from);
  };

  const handleStepNext = () => {
    if (!canStepNext) return;
    if (selectedIndex - 1 === 0) {
      setSelectedPeriodFrom(null);
    } else {
      const next = allPeriods[selectedIndex - 1];
      if (next) setSelectedPeriodFrom(next.period.from);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!def || !activeSuggestion) return;
    updateBudget.mutate({
      id: def.id,
      input: { amount: activeSuggestion.amount, dismissSuggestion: true, today },
    });
  };

  const handleDismissSuggestion = () => {
    if (!def) return;
    updateBudget.mutate({
      id: def.id,
      input: { dismissSuggestion: true, today },
    });
  };

  const currentLimit = allPeriods[0]?.limit ?? shownProgress?.limit ?? 0;

  const editOpen = searchParams.get('edit') === '1' && Boolean(def);
  const editHref = def ? `/budgets/${encodeURIComponent(def.id)}?edit=1` : '';
  const handleOpenEdit = (e: MouseEvent<HTMLElement>) => {
    if (!def || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(editHref, { replace: true });
  };
  const handleCloseEdit = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    setSearchParams(next, { replace: true });
  };

  return (
    <Screen
      title={def?.name ?? t('budgets.title')}
      back="/budgets"
      right={
        def ? (
          <Button
            variant="ghost"
            href={editHref}
            onClick={handleOpenEdit}
            data-testid="budget-edit-button"
            aria-label={t('budgets.edit')}
            title={t('budgets.edit')}
            className="size-11 p-0"
          >
            <Icon name="edit" size={22} />
          </Button>
        ) : undefined
      }
    >
      <div className="fsl-budget-detail flex flex-col gap-4">
        {isPending && !def ? (
          <SkeletonList rows={3} />
        ) : error && !def ? (
          <InlineError error={error} onRetry={() => budgetsQuery.refetch()} />
        ) : !def || !shownProgress ? (
          <div data-testid="budget-not-found">
            <EmptyState
              icon="pie-chart"
              title={t('budgets.notFound')}
              body={t('budgets.notFoundBody')}
              action={
                <Button variant="primary" block href="/budgets">
                  {t('budgets.title')}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* 1. Summary Card */}
            <div
              data-testid="budget-summary-card"
              className="rounded-xl bg-card border border-border p-5 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between -mx-2 -mt-2">
                <button
                  type="button"
                  data-testid="budget-prev-period"
                  aria-label={t('budgets.prevPeriod')}
                  title={t('budgets.prevPeriod')}
                  disabled={!canStepPrev}
                  onClick={handleStepPrev}
                  className="inline-flex items-center justify-center size-11 rounded-full text-foreground hover:bg-muted disabled:text-muted-foreground/40 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none"
                >
                  <Icon name="chevronLeft" size={22} />
                </button>
                <span
                  data-testid="budget-period-label"
                  className="text-sm font-medium text-muted-foreground text-center"
                >
                  {formatBudgetPeriodLabel(def, shownProgress.period, lang, 'full')}
                </span>
                <button
                  type="button"
                  data-testid="budget-next-period"
                  aria-label={t('budgets.nextPeriod')}
                  title={t('budgets.nextPeriod')}
                  disabled={!canStepNext}
                  onClick={handleStepNext}
                  className="inline-flex items-center justify-center size-11 rounded-full text-foreground hover:bg-muted disabled:text-muted-foreground/40 disabled:hover:bg-transparent disabled:cursor-not-allowed cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none"
                >
                  <Icon name="chevronRight" size={22} />
                </button>
              </div>

              <div className="relative flex justify-center">
                <BudgetArc
                  spent={shownProgress.spent}
                  limit={shownProgress.limit}
                  state={shownProgress.state}
                  todayPct={
                    shownProgress.daysLeft > 0 && !parentIsOver
                      ? Math.round(shownProgress.elapsed * 100)
                      : undefined
                  }
                />
                <div className="absolute bottom-0 inset-x-0 flex flex-col items-center text-center">
                  {shownProgress.daysLeft <= 0 ? (
                    <>
                      <span className="text-sm font-medium text-muted-foreground">
                        {shownProgress.state === 'over'
                          ? t('budgets.overShort')
                          : t('budgets.leftOver')}
                      </span>
                      <span
                        className={cn(
                          'text-3xl font-bold tabular-nums leading-tight',
                          shownProgress.state === 'over'
                            ? 'text-danger'
                            : 'text-foreground',
                        )}
                      >
                        {shownProgress.state === 'over'
                          ? formatMoney(Math.abs(shownProgress.left), def.currency)
                          : formatMoney(Math.max(0, shownProgress.left), def.currency)}
                      </span>
                    </>
                  ) : shownProgress.state === 'over' ? (
                    <>
                      <span className="text-sm font-semibold text-danger">
                        {t('budgets.stopShort')}
                      </span>
                      <span className="text-xl font-semibold text-foreground leading-tight">
                        {def.periodKind === 'once'
                          ? t('budgets.endsOn', {
                              date: formatDayMonth(shownProgress.period.to),
                            })
                          : t('budgets.nextPeriodFrom', {
                              date: formatDayMonth(
                                nextDayYmd(shownProgress.period.to),
                              ),
                            })}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {budgetTimeLeft(shownProgress.daysLeft, t)}
                      </span>
                    </>
                  ) : parentBudget && parentProgress?.state === 'over' ? (
                    <>
                      <span className="text-xl font-semibold text-danger leading-tight">
                        {t('budgets.stopShort')}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {t('budgets.parentOver', { name: parentBudget.name })}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-muted-foreground">
                        {shownProgress.daysLeft === 1
                          ? t('budgets.todayLeft')
                          : shownProgress.pace?.unit === 'month'
                            ? t('budgets.perMonthLeft')
                            : t('budgets.perDayLeft')}
                      </span>
                      <span
                        data-testid="budget-pace-amount"
                        className="text-3xl font-bold tabular-nums leading-tight text-foreground"
                      >
                        {shownProgress.daysLeft === 1 || !shownProgress.pace
                          ? formatMoney(
                              Math.max(0, shownProgress.left),
                              def.currency,
                            )
                          : formatMoney(
                              shownProgress.pace.amount,
                              def.currency,
                            )}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {budgetTimeLeft(shownProgress.daysLeft, t)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-between gap-2">
                {shownProgress.state === 'over' ? (
                  <Stat
                    label={t('budgets.overShort')}
                    value={`\u2212${formatMoney(Math.abs(shownProgress.left), def.currency)}`}
                    valueTestId="budget-remaining-amount"
                    valueClassName="text-danger"
                  />
                ) : (
                  <Stat
                    label={t('budgets.remaining')}
                    value={formatMoney(Math.max(0, shownProgress.left), def.currency)}
                    valueTestId="budget-remaining-amount"
                  />
                )}
                <Stat
                  label={t('budgets.spent')}
                  value={formatMoney(shownProgress.spent, def.currency)}
                  align="center"
                />
                <Stat
                  label={t('budgets.limit')}
                  value={formatMoney(shownProgress.limit, def.currency)}
                  align="right"
                />
              </div>

              {childBudgetNames && (
                <p
                  className="m-0 text-xs text-muted-foreground"
                  data-testid="budget-includes"
                >
                  {t('budgets.includesChildren', { names: childBudgetNames })}
                </p>
              )}

              {shownProgress.daysLeft > 0 &&
                shownProgress.state !== 'over' &&
                parentBudget &&
                parentProgress?.state === 'over' && (
                  <Link
                    to={`/budgets/${encodeURIComponent(parentBudget.id)}`}
                    data-testid="budget-parent-over"
                    className="min-h-11 rounded-xl bg-danger-soft text-danger px-4 py-3 text-sm flex items-center justify-between gap-2 no-underline hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity motion-reduce:transition-none"
                  >
                    <span>
                      {t('budgets.parentOverNote', {
                        name: parentBudget.name,
                        amount: formatMoney(
                          Math.abs(parentProgress.left),
                          parentBudget.currency,
                        ),
                      })}
                    </span>
                    <Icon name="chevronRight" size={18} className="shrink-0" />
                  </Link>
                )}

              {!(shownProgress.daysLeft > 0 && shownProgress.state !== 'over' && parentIsOver) && (
              <p
                data-testid="budget-state-note"
                className={cn(
                  'm-0 rounded-xl px-4 py-3 text-sm leading-snug text-pretty',
                  shownProgress.state === 'over'
                    ? 'bg-danger-soft text-danger'
                    : shownProgress.state === 'fast' ||
                        shownProgress.state === 'near'
                      ? 'bg-warning-soft text-warning-foreground'
                      : 'bg-secondary text-secondary-foreground',
                )}
              >
                {buildStateNote(shownProgress, def, t)}
              </p>
              )}
            </div>

            {/* 2. Suggestion Line (B12) */}
            {activeSuggestion && (
              <div
                data-testid="budget-suggestion"
                className="rounded-xl bg-card border border-border p-4 flex flex-col gap-3"
              >
                <p className="m-0 text-sm text-foreground leading-snug">
                  {activeSuggestion.direction === 'raise'
                    ? t('budgets.suggestRaise', {
                        avg: formatMoney(activeSuggestion.average, def.currency),
                        limit: formatMoney(currentLimit, def.currency),
                      })
                    : t('budgets.suggestLower', {
                        avg: formatMoney(activeSuggestion.average, def.currency),
                        limit: formatMoney(currentLimit, def.currency),
                      })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    data-testid="budget-suggest-accept"
                    loading={updateBudget.isPending}
                    onClick={handleAcceptSuggestion}
                  >
                    {t('budgets.suggestAction', {
                      amount: formatMoney(activeSuggestion.amount, def.currency),
                    })}
                  </Button>
                  <Button
                    variant="ghost"
                    data-testid="budget-suggest-dismiss"
                    disabled={updateBudget.isPending}
                    onClick={handleDismissSuggestion}
                  >
                    {t('budgets.suggestDismiss')}
                  </Button>
                </div>
                {updateBudget.error && <InlineError error={updateBudget.error} />}
              </div>
            )}

            {/* 3. History Chart & Past Periods */}
            {((chartModel && chartModel.bars.length >= 2) || pastPeriods.length > 0) && (
              <section className="flex flex-col gap-2">
                {chartModel && chartModel.bars.length >= 2 && (
                  <>
                    <div className="flex items-center justify-between px-1">
                      <h2 className="m-0 text-sm font-semibold text-muted-foreground">
                        {chartModel.heading}
                      </h2>
                    </div>
                    <div className="rounded-xl bg-card px-4 pt-4 pb-3 flex flex-col gap-2">
                      <BudgetHistoryChart
                        bars={chartModel.bars}
                        ariaLabel={chartModel.ariaLabel}
                      />
                      {chartModel.showCaption && (
                        <span className="text-xs text-muted-foreground">
                          {t('budgets.chartCaption')}
                        </span>
                      )}
                    </div>
                  </>
                )}

                {pastPeriods.length > 0 && (
                  <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                    {pastPeriods.map((entry) => {
                      const isOver = entry.spent > entry.limit;
                      const isNear =
                        !isOver &&
                        entry.limit > 0 &&
                        entry.spent >= BUDGET_NEAR * entry.limit;
                      const icon: IconName = isOver
                        ? 'ban'
                        : isNear
                          ? 'clock'
                          : 'check';
                      const wordsClass = isOver
                        ? 'text-danger font-semibold'
                        : isNear
                          ? 'text-warning font-semibold'
                          : 'text-muted-foreground';
                      const wordsText = isOver
                        ? t('budgets.pastOver', {
                            amount: formatMoney(
                              entry.spent - entry.limit,
                              def.currency,
                            ),
                          })
                        : isNear
                          ? t('budgets.pastNear')
                          : t('budgets.pastFine');
                      const isSelected =
                        entry.period.from === shownProgress.period.from;

                      return (
                        <button
                          key={entry.period.from}
                          type="button"
                          data-testid={`budget-past-row-${entry.period.from}`}
                          aria-pressed={isSelected}
                          onClick={() =>
                            setSelectedPeriodFrom(entry.period.from)
                          }
                          className={cn(
                            'w-full min-h-11 px-4 py-3 flex items-center gap-3 text-left hover:bg-accent cursor-pointer bg-transparent border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none',
                            isSelected && 'bg-accent',
                          )}
                        >
                          <div className="flex-1 min-w-0 flex flex-col">
                            <span className="text-sm font-semibold text-foreground">
                              {formatBudgetPeriodLabel(
                                def,
                                entry.period,
                                lang,
                                'row',
                              )}
                            </span>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 text-sm',
                                wordsClass,
                              )}
                            >
                              <Icon name={icon} size={14} className="shrink-0" />
                              <span>{wordsText}</span>
                            </span>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span
                              className={cn(
                                'text-sm font-semibold tabular-nums',
                                isOver ? 'text-danger' : 'text-foreground',
                              )}
                            >
                              {formatMoney(entry.spent, def.currency)}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {t('budgets.ofLimit', {
                                limit: formatMoney(entry.limit, def.currency),
                              })}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 4. Counted Transactions for Shown Period */}
            <BudgetTransactions
              def={def}
              period={shownProgress.period}
              source={source}
              countedRows={countedRows}
              wallets={wallets}
              categories={categories}
              tags={tags}
              assets={assets}
              groupSettings={groupSettings}
            />
          </>
        )}
      </div>
      {def && <BudgetForm key={def.id} open={editOpen} onClose={handleCloseEdit} budget={def} />}
    </Screen>
  );
}
