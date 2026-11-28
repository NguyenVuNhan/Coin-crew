import { useMemo, type JSX } from 'react';
import { Link } from 'react-router';
import {
  daysUntil,
  formatMoney,
  eventDayIndex,
  eventState,
  type CurrencyCode,
  type EventView,
} from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { useT } from '@cc/web-i18n';
import { useBudgetsProgress } from '@cc/web-data-access/budgets';
import { useEvents, useEventSummary } from '@cc/web-data-access/events';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { BudgetBar } from '../budgets/BudgetBar';

function pickFeaturedEvent(
  events: EventView[],
  today: string,
): { event: EventView; state: 'on' | 'upcoming' } | null {
  let onTrip: EventView | null = null;
  let nearestUpcoming: EventView | null = null;

  for (const item of events) {
    const state = eventState(item, today);
    if (state === 'on') {
      if (!onTrip || item.start < onTrip.start) {
        onTrip = item;
      }
    } else if (state === 'upcoming') {
      if (!nearestUpcoming || item.start < nearestUpcoming.start) {
        nearestUpcoming = item;
      }
    }
  }

  if (onTrip) return { event: onTrip, state: 'on' };
  if (nearestUpcoming) return { event: nearestUpcoming, state: 'upcoming' };
  return null;
}

/**
 * Trip row inside Sổ chi tiêu's top list (after Báo cáo).
 * Shows the active trip (with day index and optional budget bar), the nearest upcoming
 * trip (with days left and lead-up spending), or the idle Trips link.
 */
export function BookEventRow(): JSX.Element {
  const t = useT();
  const today = todayLocal();
  const eventsQuery = useEvents();
  const events = eventsQuery.data?.events ?? [];

  const featured = useMemo(() => pickFeaturedEvent(events, today), [events, today]);
  const activeId = featured?.event.id ?? '';
  const { event: resolvedEvent, summary, progress } = useEventSummary(activeId);

  const activeEvent = featured && resolvedEvent ? resolvedEvent : null;
  const activeState = activeEvent && featured ? featured.state : null;

  const hasBudget = Boolean(activeEvent?.budgetId);
  const budgetsProgress = useBudgetsProgress({ enabled: hasBudget });
  const budgetCurrency: CurrencyCode = useMemo(() => {
    if (!activeEvent?.budgetId) return 'VND';
    const def = budgetsProgress.defs.find((b) => b.id === activeEvent.budgetId);
    return def?.currency ?? 'VND';
  }, [activeEvent?.budgetId, budgetsProgress.defs]);

  const href = activeEvent
    ? `/events/${encodeURIComponent(activeEvent.id)}`
    : '/events';

  let titleText = t('events.bookIdle');
  let subtitleText: string | null = null;
  let rightMeta: string | null = null;

  if (activeEvent && activeState === 'on') {
    titleText = t('events.bookOn', { name: activeEvent.name });
    const dayInfo = eventDayIndex(activeEvent, today);
    if (dayInfo) {
      rightMeta = t('events.bookDayOf', { day: dayInfo.day, of: dayInfo.of });
    }
  } else if (activeEvent && activeState === 'upcoming') {
    titleText = t('events.bookUpcoming', { name: activeEvent.name });
    rightMeta = t('events.bookDaysLeft', { n: daysUntil(activeEvent, today) });
    const firstCurrency = summary?.currencies[0];
    const leadupAmount = firstCurrency?.byDay.find((d) => d.date === 'leadup')?.amount ?? 0;
    if (firstCurrency && leadupAmount > 0) {
      subtitleText = t('events.bookLeadSpent', {
        amount: formatMoney(leadupAmount, firstCurrency.currency),
      });
    }
  }

  const showBar = activeState === 'on' && activeEvent?.budgetId !== null && progress !== null;
  const usedPct =
    showBar && progress
      ? progress.limit > 0
        ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
        : progress.spent > 0
          ? 100
          : 0
      : 0;
  const todayPct = showBar && progress ? Math.round(progress.elapsed * 100) : undefined;
  const isOver = Boolean(showBar && progress && progress.spent > progress.limit);

  return (
    <Link
      to={href}
      data-testid="book-event-row"
      className="fsl-book__event-row flex flex-col gap-2 min-h-14 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline"
    >
      <div className="flex items-center gap-3 w-full">
        <span
          aria-hidden="true"
          className="size-9 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
        >
          <Icon name="plane" size={18} />
        </span>
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-sm font-semibold text-foreground leading-snug truncate">
            {titleText}
          </span>
          {subtitleText && (
            <span className="text-xs text-muted-foreground leading-snug truncate tabular-nums">
              {subtitleText}
            </span>
          )}
        </div>
        {rightMeta && (
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {rightMeta}
          </span>
        )}
        <Icon name="chevronRight" className="text-muted-foreground shrink-0" />
      </div>

      {showBar && progress && (
        <div className="flex flex-col gap-1.5 pl-12">
          <BudgetBar state={progress.state} used={usedPct} today={todayPct} />
          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
            <span className={cn(isOver ? 'text-danger font-medium' : 'text-muted-foreground')}>
              {isOver
                ? `${formatMoney(Math.abs(progress.left), budgetCurrency)} ${t('budgets.overLabel')}`
                : `${formatMoney(progress.left, budgetCurrency)} ${t('budgets.left')}`}
            </span>
            <span className="text-muted-foreground">
              {`${formatMoney(progress.spent, budgetCurrency)} / ${formatMoney(progress.limit, budgetCurrency)}`}
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
