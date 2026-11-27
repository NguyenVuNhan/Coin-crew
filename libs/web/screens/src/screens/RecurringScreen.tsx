import { useEffect, useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router';
import {
  formatMoney,
  type AssetView,
  type CategoryView,
  type RecurringRuleView,
  type UpcomingItem,
  type WalletDetailView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import {
  useAssets,
  useCategories,
  useWalletDetails,
} from '@cc/web-data-access/personalMoney';
import {
  usePlannedItems,
  useRecurringRules,
  useResumeRule,
  useUpcoming,
  type UpcomingCurrencyTotal,
} from '@cc/web-data-access/recurring';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Snackbar } from '@cc/web-ui/components/Snackbar';
import { Screen } from '../components/Screen';
import {
  draftCurrency,
  draftIcon,
  draftTitle,
  isKnownPlannedKind,
  pausedReasonLabel,
  PlannedItemCard,
  signedMoneyParts,
} from '../components/PlannedItemCard';
import {
  formatDayMonth,
  formatWeekdayDayMonth,
  scheduleInWords,
  type TranslateFn,
} from '../lib/scheduleWords';

function formatUpcomingTotals(totals: UpcomingCurrencyTotal[], t: TranslateFn): string {
  const sorted = [...totals].sort((a, b) => {
    if (a.currency === 'VND' && b.currency !== 'VND') return -1;
    if (b.currency === 'VND' && a.currency !== 'VND') return 1;
    return a.currency.localeCompare(b.currency);
  });

  const parts: string[] = [];
  for (const row of sorted) {
    const hasOut = row.out > 0;
    const hasIn = row.in > 0;
    if (hasOut && hasIn) {
      parts.push(
        t('recurring.upcomingTotalBoth', {
          out: formatMoney(row.out, row.currency),
          in: formatMoney(row.in, row.currency),
        }),
      );
    } else if (hasOut) {
      parts.push(
        t('recurring.upcomingTotalOut', {
          out: formatMoney(row.out, row.currency),
        }),
      );
    } else if (hasIn) {
      parts.push(
        t('recurring.upcomingTotalIn', {
          in: formatMoney(row.in, row.currency),
        }),
      );
    }
  }
  return parts.join(' · ');
}

function groupByDate(items: UpcomingItem[]): Array<{ date: string; items: UpcomingItem[] }> {
  const groups: Array<{ date: string; items: UpcomingItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.date) {
      last.items.push(item);
    } else {
      groups.push({ date: item.date, items: [item] });
    }
  }
  return groups;
}

export function RecurringScreen(): JSX.Element {
  const t = useT();
  const rulesQuery = useRecurringRules();
  const plannedQuery = usePlannedItems();
  const upcoming = useUpcoming(30);
  const walletsQuery = useWalletDetails();
  const categoriesQuery = useCategories();
  const assetsQuery = useAssets();
  const resumeRule = useResumeRule();

  const [toast, setToast] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeErrors, setResumeErrors] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const rules = rulesQuery.data?.rules ?? [];
  const waitingItems = useMemo(
    () => (plannedQuery.data?.items ?? []).filter((item) => isKnownPlannedKind(item.kind)),
    [plannedQuery.data?.items],
  );

  const rulesById = useMemo(() => {
    const map = new Map<string, RecurringRuleView>();
    for (const r of rules) map.set(r.id, r);
    return map;
  }, [rules]);

  const walletsById = useMemo(() => {
    const map = new Map<string, WalletDetailView>();
    for (const w of walletsQuery.data?.wallets ?? []) map.set(w.id, w);
    return map;
  }, [walletsQuery.data?.wallets]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryView>();
    for (const c of categoriesQuery.data?.categories ?? []) map.set(c.id, c);
    return map;
  }, [categoriesQuery.data?.categories]);

  const assetsById = useMemo(() => {
    const map = new Map<string, AssetView>();
    for (const a of assetsQuery.data?.assets ?? []) map.set(a.id, a);
    return map;
  }, [assetsQuery.data?.assets]);

  const upcomingGroups = useMemo(() => groupByDate(upcoming.items), [upcoming.items]);
  const upcomingTotalLine = useMemo(
    () => formatUpcomingTotals(upcoming.totals, t),
    [upcoming.totals, t],
  );

  const isLoading = rulesQuery.isPending && plannedQuery.isPending;
  const loadError = rulesQuery.error ?? plannedQuery.error;
  const isEmpty = !isLoading && !loadError && rules.length === 0 && waitingItems.length === 0;

  const handleResume = async (rule: RecurringRuleView) => {
    setResumingId(rule.id);
    setResumeErrors((prev) => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });
    try {
      await resumeRule.mutateAsync(rule.id);
      const name = draftTitle(rule.draft, categoriesById, assetsById, t);
      setToast(t('recurring.toastResumed', { name }));
    } catch (err) {
      setResumeErrors((prev) => ({ ...prev, [rule.id]: err }));
    } finally {
      setResumingId(null);
    }
  };

  return (
    <Screen
      title={t('recurring.title')}
      back="/trips"
      right={
        <Button
          variant="ghost"
          href="/entries/new?repeat=1"
          data-testid="recurring-add"
          aria-label={t('recurring.addRule')}
          title={t('recurring.addRule')}
          className="size-11 p-0 text-primary"
        >
          <Icon name="plus" size={22} />
        </Button>
      }
    >
      <div className="fsl-recurring flex flex-col gap-5">
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : loadError && rules.length === 0 && waitingItems.length === 0 ? (
          <InlineError
            error={loadError}
            onRetry={() => {
              void rulesQuery.refetch();
              void plannedQuery.refetch();
            }}
          />
        ) : isEmpty ? (
          <EmptyState
            icon="repeat"
            title={t('recurring.emptyTitle')}
            body={t('recurring.emptyBody')}
            action={
              <Button
                variant="primary"
                block
                href="/entries/new?repeat=1"
                data-testid="recurring-empty-add"
              >
                {t('recurring.addRule')}
              </Button>
            }
          />
        ) : (
          <>
            {waitingItems.length > 0 && (
              <section
                data-testid="recurring-waiting"
                className="fsl-recurring__waiting flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between gap-2 px-1">
                  <h2 className="m-0 text-sm font-semibold text-muted-foreground">
                    {t('recurring.waitingHeading', { count: waitingItems.length })}
                  </h2>
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('recurring.notCountedNote')}
                  </span>
                </div>
                <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                  {waitingItems.map((item) => (
                    <PlannedItemCard
                      key={item.id}
                      item={item}
                      rule={item.ruleId ? rulesById.get(item.ruleId) : undefined}
                      categoriesById={categoriesById}
                      walletsById={walletsById}
                      assetsById={assetsById}
                      onFeedback={setToast}
                    />
                  ))}
                </div>
              </section>
            )}

            <section
              data-testid="recurring-upcoming"
              className="fsl-recurring__upcoming flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-2 px-1">
                <h2 className="m-0 text-sm font-semibold text-muted-foreground">
                  {t('recurring.upcomingHeading')}
                </h2>
                {upcomingTotalLine && (
                  <span
                    data-testid="recurring-upcoming-total"
                    className="text-xs font-medium text-muted-foreground tabular-nums text-right"
                  >
                    {upcomingTotalLine}
                  </span>
                )}
              </div>
              {upcomingGroups.length === 0 ? (
                <div className="rounded-xl bg-card px-4 py-4 text-sm text-muted-foreground">
                  {t('recurring.upcomingEmpty')}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {upcomingGroups.map((group) => (
                    <div key={group.date} className="flex flex-col gap-1.5">
                      <div className="px-1 text-xs font-semibold text-muted-foreground">
                        {formatWeekdayDayMonth(group.date, t)}
                      </div>
                      <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                        {group.items.map((occ) => {
                          const name = draftTitle(
                            occ.draft,
                            categoriesById,
                            assetsById,
                            t,
                          );
                          const icon = draftIcon(occ.draft, categoriesById);
                          const currency = draftCurrency(occ.draft, walletsById);
                          const money = signedMoneyParts(occ.draft, currency, occ.approximate);
                          const fromWallet = walletsById.get(occ.draft.walletId)?.name ?? '';
                          const toWallet = occ.draft.toWalletId
                            ? walletsById.get(occ.draft.toWalletId)?.name
                            : undefined;
                          const subLine =
                            occ.draft.type === 'transfer' && fromWallet && toWallet
                              ? `${fromWallet} → ${toWallet}`
                              : fromWallet;

                          return (
                            <Link
                              key={`${occ.ruleId}:${occ.date}`}
                              to={`/recurring/${encodeURIComponent(occ.ruleId)}`}
                              className="fsl-recurring__upcoming-row flex items-center gap-3 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline"
                            >
                              <span
                                aria-hidden="true"
                                className="size-9 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
                              >
                                <Icon name={icon} size={18} />
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate">
                                  {name}
                                </div>
                                {subLine && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {subLine}
                                  </div>
                                )}
                              </div>
                              <span
                                className={`text-sm font-semibold tabular-nums whitespace-nowrap shrink-0 ${money.className}`}
                              >
                                {money.text}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section
              data-testid="recurring-rules"
              className="fsl-recurring__rules flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-2 px-1">
                <h2 className="m-0 text-sm font-semibold text-muted-foreground">
                  {t('recurring.rulesHeading', { count: rules.length })}
                </h2>
              </div>
              <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                {rules.map((rule) => {
                  const name = draftTitle(rule.draft, categoriesById, assetsById, t);
                  const icon = draftIcon(rule.draft, categoriesById);
                  const currency = draftCurrency(rule.draft, walletsById);
                  const money = signedMoneyParts(rule.draft, currency, false);
                  const isPaused = rule.status === 'paused';
                  const scheduleText = scheduleInWords(rule.schedule, t);
                  const activeMeta = rule.askMe
                    ? `${scheduleText} · ${t('recurring.alwaysAsk')}`
                    : rule.nextDueOn
                      ? `${scheduleText} · ${t('recurring.nextDue', { date: formatDayMonth(rule.nextDueOn) })}`
                      : rule.status === 'ended'
                        ? `${scheduleText} · ${t('recurring.ended')}`
                        : scheduleText;
                  const ruleError = resumeErrors[rule.id];

                  return (
                    <div
                      key={rule.id}
                      data-testid={`rule-row-${rule.id}`}
                      className="fsl-recurring__rule flex flex-col"
                    >
                      <div className="flex items-center gap-2 pr-3">
                        <Link
                          to={`/recurring/${encodeURIComponent(rule.id)}`}
                          className="flex-1 min-w-0 flex items-center gap-3 min-h-14 pl-4 pr-1 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline"
                        >
                          <span
                            aria-hidden="true"
                            className={`size-9 rounded-full grid place-items-center shrink-0 ${
                              isPaused || rule.status === 'ended'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-secondary text-secondary-foreground'
                            }`}
                          >
                            <Icon name={icon} size={18} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">
                              {name}
                            </div>
                            {isPaused ? (
                              <div className="text-xs text-warning-foreground leading-snug truncate">
                                {t('recurring.rulePausedMeta', {
                                  reason: pausedReasonLabel(rule.pausedReason, t),
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground leading-snug truncate">
                                {activeMeta}
                              </div>
                            )}
                          </div>
                          {!isPaused && (
                            <span
                              className={`text-sm font-semibold tabular-nums whitespace-nowrap shrink-0 ${money.className}`}
                            >
                              {money.text}
                            </span>
                          )}
                        </Link>
                        {isPaused && (
                          <Button
                            variant="secondary"
                            data-testid={`rule-resume-${rule.id}`}
                            disabled={resumingId === rule.id}
                            loading={resumingId === rule.id}
                            onClick={() => {
                              void handleResume(rule);
                            }}
                            className="min-h-11 px-3 shrink-0"
                          >
                            {t('recurring.resume')}
                          </Button>
                        )}
                        <Link
                          to={`/recurring/${encodeURIComponent(rule.id)}`}
                          aria-label={name}
                          className="text-muted-foreground shrink-0 grid place-items-center size-8 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Icon name="chevronRight" size={16} />
                        </Link>
                      </div>
                      {ruleError !== undefined && (
                        <div className="px-4 pb-3">
                          <InlineError error={ruleError} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
      {toast && <Snackbar message={toast} />}
    </Screen>
  );
}
