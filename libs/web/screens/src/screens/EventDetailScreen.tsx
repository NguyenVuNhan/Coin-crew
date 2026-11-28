import { useMemo, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router';
import {
  CURRENCIES,
  eventDayIndex,
  eventState,
  formatMoney,
  type CurrencyCode,
  type EventExisting,
  type EventSavedResponse,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useBudgets } from '@cc/web-data-access/budgets';
import { useMyGroups } from '@cc/web-data-access/groups';
import { useCategories } from '@cc/web-data-access/personalMoney';
import {
  useEvents,
  useEventSummary,
  useResumeEvent,
  useStartEventNow,
  useStopEvent,
} from '@cc/web-data-access/events';
import { Amount } from '@cc/web-ui/components/Amount';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Modal } from '@cc/web-ui/components/Modal';
import { Pill } from '@cc/web-ui/components/Pill';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { resolveCategoryIcon } from '../components/TransactionRow';
import { BudgetBar } from '../components/budgets/BudgetBar';
import { EventExistingSheet } from '../components/events/EventExistingSheet';
import { formatEventDate, formatEventRange, EventForm } from '../components/events/EventForm';

const STATE_PILL_TONE = {
  on: 'accent',
  upcoming: 'warning',
  done: 'neutral',
} as const;

/** Event detail screen: summary card, lifecycle actions, optional budget bar, category & day breakdowns, and report/transaction links. */
export function EventDetailScreen(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const eventId = id ?? '';
  const t = useT();
  const today = todayLocal();

  const eventsQuery = useEvents({ enabled: Boolean(eventId) });
  const { event, summary, rows: eventSummaryRows, progress, isPending, error } = useEventSummary(eventId);
  const budgetsQuery = useBudgets({ enabled: Boolean(event?.budgetId) });
  const categoriesQuery = useCategories();
  const groupsQuery = useMyGroups({ enabled: Boolean(event && event.groupIds.length > 0) });

  const stopEvent = useStopEvent();
  const resumeEvent = useResumeEvent();
  const startEventNow = useStartEventNow();

  const [formOpen, setFormOpen] = useState(false);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [confirmResumeOpen, setConfirmResumeOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode | null>(null);
  const [pendingExisting, setPendingExisting] = useState<{
    eventId: string;
    existing: EventExisting;
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
    if (!event?.budgetId) return 'VND';
    const def = (budgetsQuery.data?.budgets ?? []).find((b) => b.id === event.budgetId);
    return def?.currency ?? 'VND';
  }, [event?.budgetId, budgetsQuery.data?.budgets]);

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

  const handleSaved = (res: EventSavedResponse) => {
    setFormOpen(false);
    const existingCount =
      res.existing.ownIds !== undefined || res.existing.shareRootIds !== undefined
        ? (res.existing.ownIds?.length ?? 0) + (res.existing.shareRootIds?.length ?? 0)
        : res.existing.own.count + res.existing.shares.count;
    if (existingCount > 0) {
      setPendingExisting({ eventId: res.event.id, existing: res.existing });
    }
  };

  const state = event ? eventState(event, today) : null;
  const dayInfo = event ? eventDayIndex(event, today) : null;
  const dayLabel = dayInfo
    ? dayInfo.of !== null
      ? t('events.bookDayOf', { day: dayInfo.day, of: dayInfo.of })
      : t('events.bookDayOpen', { day: dayInfo.day })
    : null;
  const canResume = Boolean(event && state === 'done' && event.stoppedAt !== null);

  const groupLabel = useMemo(() => {
    if (!event) return '';
    if (event.groupIds.length === 0) return t('events.solo');
    const names = event.groupIds
      .map((gid) => groupNameById.get(gid))
      .filter((name): name is string => Boolean(name));
    return names.join(', ');
  }, [event, groupNameById, t]);

  const { linkFrom, linkTo } = useMemo(() => {
    let earliest: string | null = null;
    let latest: string | null = null;
    for (const row of eventSummaryRows) {
      if (earliest === null || row.date < earliest) earliest = row.date;
      if (latest === null || row.date > latest) latest = row.date;
    }
    const from = earliest ?? event?.countsFrom ?? today;
    const to = latest !== null && latest > today ? latest : today;
    return { linkFrom: from, linkTo: to };
  }, [eventSummaryRows, event?.countsFrom, today]);

  const txHref =
    event && event.tagId
      ? `/transactions?tagId=${encodeURIComponent(event.tagId)}&from=${encodeURIComponent(linkFrom)}&to=${encodeURIComponent(linkTo)}`
      : '/transactions';

  const currentYear = Number(today.slice(0, 4));

  const usedPct =
    progress && progress.limit > 0
      ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
      : 0;
  const todayPct =
    progress && state === 'on' ? Math.round(progress.elapsed * 100) : undefined;
  const isOver = Boolean(progress && progress.spent > progress.limit);
  const budgetDiff = progress ? Math.abs(progress.limit - progress.spent) : 0;

  const handleConfirmStop = () => {
    if (!event || stopEvent.isPending) return;
    stopEvent.mutate(event.id, {
      onSuccess: () => {
        setConfirmStopOpen(false);
      },
    });
  };

  const handleConfirmResume = () => {
    if (!event || resumeEvent.isPending) return;
    resumeEvent.mutate(event.id, {
      onSuccess: (res) => {
        setConfirmResumeOpen(false);
        handleSaved(res);
      },
    });
  };

  const handleStartNow = () => {
    if (!event || startEventNow.isPending) return;
    startEventNow.mutate(event.id, {
      onSuccess: (res) => {
        handleSaved(res);
      },
    });
  };

  return (
    <Screen
      title={event?.name ?? t('events.listTitle')}
      back="/events"
      right={
        event ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFormOpen(true)}
            data-testid="event-edit-button"
            aria-label={t('events.edit')}
            title={t('events.edit')}
            className="size-11 p-0"
          >
            <Icon name="edit" size={22} />
          </Button>
        ) : undefined
      }
    >
      <div className="fsl-event-detail flex flex-col gap-4">
        {isPending && !event ? (
          <SkeletonList rows={3} />
        ) : error && !event ? (
          <InlineError error={error} onRetry={() => eventsQuery.refetch()} />
        ) : !event || !state ? (
          <div data-testid="event-not-found">
            <EmptyState
              icon="calendar"
              title={t('events.notFound')}
              body={t('events.notFoundBody')}
              action={
                <Button variant="primary" block href="/events">
                  {t('events.listTitle')}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Meta line: dates · day · groups · state pill */}
            <div className="flex flex-col gap-1 px-1">
              <div
                data-testid="event-meta-line"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
              >
                <span>{formatEventRange(event.start, event.end, { currentYear, t })}</span>
                {dayLabel && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span data-testid="event-day-line" className="tabular-nums">
                      {dayLabel}
                    </span>
                  </>
                )}
                {groupLabel && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{groupLabel}</span>
                  </>
                )}
                <Pill tone={STATE_PILL_TONE[state]} data-testid="event-state-pill">
                  {t(`events.statePill.${state}`)}
                </Pill>
              </div>
              {event.tagName && (
                <p
                  data-testid="event-tag-name"
                  className="m-0 text-xs text-muted-foreground"
                >
                  {t('events.tagLine', { name: event.tagName })}
                </p>
              )}
            </div>

            {/* Lifecycle actions */}
            {(state === 'on' || canResume || state === 'upcoming') && (
              <div className="flex flex-wrap items-center gap-2">
                {state === 'on' && (
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="event-stop-button"
                    onClick={() => {
                      stopEvent.reset();
                      setConfirmStopOpen(true);
                    }}
                  >
                    {t('events.stop')}
                  </Button>
                )}
                {canResume && (
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="event-resume-button"
                    onClick={() => {
                      resumeEvent.reset();
                      setConfirmResumeOpen(true);
                    }}
                  >
                    {t('events.resume')}
                  </Button>
                )}
                {state === 'upcoming' && (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={startEventNow.isPending}
                    data-testid="event-start-now-button"
                    onClick={handleStartNow}
                  >
                    {t('events.startNow')}
                  </Button>
                )}
              </div>
            )}

            {startEventNow.error && <InlineError error={startEventNow.error} />}

            {isPending && !summary ? (
              <SkeletonList rows={3} />
            ) : error && !summary ? (
              <InlineError error={error} onRetry={() => eventsQuery.refetch()} />
            ) : totalCount === 0 || !activeSummary ? (
              <>
                <div
                  data-testid="event-summary-card"
                  className="rounded-xl bg-card border border-border p-5 flex flex-col gap-1"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('events.total')}
                  </span>
                  <Amount value={0} currency={budgetCurrency} size="xl" />
                </div>
                <div data-testid="event-empty">
                  <EmptyState
                    icon="calendar"
                    title={t('events.empty')}
                    action={
                      <Button variant="secondary" block href="/entries/new">
                        {`+ ${t('events.addExpense')}`}
                      </Button>
                    }
                  />
                </div>
              </>
            ) : (
              <>
                {/* Summary card */}
                <div
                  data-testid="event-summary-card"
                  className="rounded-xl bg-card border border-border p-5 flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('events.total')}
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
                        data-testid="event-approx"
                        className="m-0 text-sm text-muted-foreground tabular-nums"
                      >
                        {t('events.approx', {
                          amount: formatMoney(summary.approxVnd, 'VND'),
                        })}
                      </p>
                    )}
                  </div>

                  {event.budgetId !== null && progress !== null && (
                    <div className="flex flex-col gap-2 pt-1">
                      <div
                        data-testid="event-budget-status"
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
                            ? t('events.over', {
                                amount: formatMoney(budgetDiff, budgetCurrency),
                                limit: formatMoney(progress.limit, budgetCurrency),
                              })
                            : t('events.under', {
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
                      <span className="text-muted-foreground">{t('events.own')}</span>
                      <Amount
                        value={activeSummary.own}
                        currency={activeSummary.currency}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{t('events.group')}</span>
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
                    data-testid="event-currency-switch"
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label={t('events.total')}
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
                  <section data-testid="event-by-category" className="flex flex-col gap-2">
                    <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                      {currencies.length > 1
                        ? `${t('events.byCategory')} · ${CURRENCIES[activeSummary.currency].symbol}`
                        : t('events.byCategory')}
                    </h2>
                    <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
                      {activeSummary.byCategory.map((item) => {
                        const cat = categoryById.get(item.categoryId);
                        const pct =
                          activeSummary.total > 0
                            ? Math.min(100, Math.round((item.amount / activeSummary.total) * 100))
                            : 0;
                        const showBar = !(activeSummary.byCategory.length === 1 && pct === 100);
                        return (
                          <div
                            key={item.categoryId}
                            data-testid={`event-cat-row-${item.categoryId}`}
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
                            {showBar && (
                              <div
                                data-testid={`event-cat-bar-${item.categoryId}`}
                                className="relative h-2 rounded-full bg-muted overflow-hidden"
                                aria-hidden="true"
                              >
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Breakdown: By day */}
                {activeSummary.byDay.length > 0 && (
                  <section data-testid="event-by-day" className="flex flex-col gap-2">
                    <h2 className="m-0 px-1 text-sm font-semibold text-muted-foreground">
                      {t('events.byDay')}
                    </h2>
                    <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
                      {activeSummary.byDay.map((item) => (
                        <div
                          key={item.date}
                          data-testid={`event-day-row-${item.date}`}
                          className="min-h-11 px-4 py-3 flex items-center justify-between gap-2"
                        >
                          <span className="text-sm text-foreground">
                            {item.date === 'leadup'
                              ? t('events.leadup')
                              : formatEventDate(item.date, currentYear)}
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
                  data-testid="event-see-tx"
                  className="min-h-11 rounded-xl bg-card border border-border px-4 py-3 flex items-center justify-between text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none no-underline"
                >
                  <span>{t('events.seeTx', { n: totalCount })}</span>
                  <Icon name="chevronRight" size={18} />
                </Link>
              </>
            )}
          </>
        )}
      </div>

      {event && (
        <EventForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          event={event}
          onSaved={handleSaved}
        />
      )}

      {event && state === 'on' && (
        <Modal
          open={confirmStopOpen}
          onClose={() => setConfirmStopOpen(false)}
          title={t('events.stopTitle', { name: event.name })}
        >
          <div className="flex flex-col gap-4" data-testid="event-stop-confirm-modal">
            <p className="m-0 text-sm text-foreground">
              {t('events.stopConfirm', { name: event.name })}
            </p>
            {stopEvent.error && <InlineError error={stopEvent.error} />}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="primary"
                block
                loading={stopEvent.isPending}
                data-testid="event-stop-confirm"
                onClick={handleConfirmStop}
              >
                {t('events.stopAction')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={stopEvent.isPending}
                onClick={() => setConfirmStopOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {event && canResume && (
        <Modal
          open={confirmResumeOpen}
          onClose={() => setConfirmResumeOpen(false)}
          title={t('events.resume')}
        >
          <div className="flex flex-col gap-4" data-testid="event-resume-confirm-modal">
            <p className="m-0 text-sm text-foreground">
              {t('events.resumeConfirm', { name: event.name })}
            </p>
            {event.budgetId !== null && (
              <p className="m-0 text-sm text-muted-foreground">{t('events.resumeDropsLimit')}</p>
            )}
            {resumeEvent.error && <InlineError error={resumeEvent.error} />}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="primary"
                block
                loading={resumeEvent.isPending}
                data-testid="event-resume-confirm"
                onClick={handleConfirmResume}
              >
                {t('events.resume')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                block
                disabled={resumeEvent.isPending}
                onClick={() => setConfirmResumeOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <EventExistingSheet
        eventId={pendingExisting?.eventId ?? null}
        existing={pendingExisting?.existing ?? null}
        onDone={() => setPendingExisting(null)}
      />
    </Screen>
  );
}
