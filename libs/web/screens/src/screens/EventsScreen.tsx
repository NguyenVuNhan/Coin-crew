import { useMemo, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  daysUntil,
  formatMoney,
  eventState,
  type BudgetDef,
  type BudgetProgress,
  type EventExisting,
  type EventSavedResponse,
  type EventState,
  type EventView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useBudgetsProgress } from '@cc/web-data-access/budgets';
import { useEvents, useEventSummary } from '@cc/web-data-access/events';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { Skeleton, SkeletonList } from '@cc/web-ui/components/Skeleton';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { BudgetBar } from '../components/budgets/BudgetBar';
import { EventExistingSheet } from '../components/events/EventExistingSheet';
import { formatEventRange, EventForm } from '../components/events/EventForm';

interface EventRowItem {
  event: EventView;
  state: EventState;
  progress: BudgetProgress | null;
  budgetDef: BudgetDef | null;
}

function EventRow({
  event,
  state,
  progress,
  budgetDef,
  today,
}: EventRowItem & { today: string }): JSX.Element {
  const t = useT();
  const { summary, isPending } = useEventSummary(event.id);

  const firstCurrency = summary?.currencies[0] ?? null;
  const totalText = firstCurrency
    ? formatMoney(firstCurrency.total, firstCurrency.currency)
    : formatMoney(0, budgetDef?.currency ?? 'VND');
  const rangeText = formatEventRange(event.start, event.end);

  const usedPct =
    progress && progress.limit > 0
      ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
      : 0;
  const todayPct = progress ? Math.round(progress.elapsed * 100) : undefined;

  let endingNode: JSX.Element | null = null;
  if (state === 'done') {
    if (event.budgetId === null) {
      endingNode = <span className="text-muted-foreground">{t('events.noLimit')}</span>;
    } else if (progress && budgetDef) {
      const over = progress.spent > progress.limit;
      const diff = Math.abs(progress.limit - progress.spent);
      const text = over
        ? t('events.over', {
            amount: formatMoney(diff, budgetDef.currency),
            limit: formatMoney(progress.limit, budgetDef.currency),
          })
        : t('events.under', {
            amount: formatMoney(diff, budgetDef.currency),
            limit: formatMoney(progress.limit, budgetDef.currency),
          });
      endingNode = (
        <span className={cn(over ? 'text-danger' : 'text-muted-foreground')}>{text}</span>
      );
    }
  }

  return (
    <Link
      to={`/events/${encodeURIComponent(event.id)}`}
      data-testid={`event-row-${event.id}`}
      className="fsl-event-row w-full min-h-11 px-4 py-3 flex flex-col gap-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline text-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground truncate">{event.name}</span>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5">
            <span>{rangeText}</span>
            {state === 'upcoming' && (
              <span>{`· ${t('events.bookDaysLeft', { n: daysUntil(event, today) })}`}</span>
            )}
            {state === 'done' && endingNode && (
              <>
                <span>·</span>
                {endingNode}
              </>
            )}
          </div>
        </div>
        {isPending ? (
          <Skeleton width={72} height={18} radius="sm" className="shrink-0" />
        ) : (
          <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
            {totalText}
          </span>
        )}
      </div>

      {state === 'on' && progress && budgetDef && (
        <div className="flex flex-col gap-1">
          <BudgetBar state={progress.state} used={usedPct} today={todayPct} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {`${formatMoney(progress.spent, budgetDef.currency)} / ${formatMoney(progress.limit, budgetDef.currency)}`}
          </span>
        </div>
      )}
    </Link>
  );
}

function EventSection({
  testId,
  heading,
  items,
  today,
}: {
  testId: string;
  heading: string;
  items: EventRowItem[];
  today: string;
}): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section data-testid={testId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">{heading}</h2>
      </div>
      <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
        {items.map((item) => (
          <EventRow key={item.event.id} {...item} today={today} />
        ))}
      </div>
    </section>
  );
}

export function EventsScreen(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const today = todayLocal();

  const eventsQuery = useEvents();
  const budgetsProgress = useBudgetsProgress();

  const [formOpen, setFormOpen] = useState(false);
  const [pendingExisting, setPendingExisting] = useState<{
    eventId: string;
    existing: EventExisting;
  } | null>(null);

  const events = eventsQuery.data?.events ?? [];

  const progressByBudgetId = useMemo(() => {
    const map = new Map<string, BudgetProgress>();
    const all = [
      ...budgetsProgress.groups.over,
      ...budgetsProgress.groups.fast,
      ...budgetsProgress.groups.onPace,
      ...budgetsProgress.groups.ended,
    ];
    for (const p of all) {
      map.set(p.budgetId, p);
    }
    return map;
  }, [budgetsProgress.groups]);

  const budgetDefById = useMemo(() => {
    const map = new Map<string, BudgetDef>();
    for (const d of budgetsProgress.defs) {
      map.set(d.id, d);
    }
    return map;
  }, [budgetsProgress.defs]);

  const sections = useMemo(() => {
    const on: EventRowItem[] = [];
    const upcoming: EventRowItem[] = [];
    const done: EventRowItem[] = [];

    for (const event of events) {
      const state = eventState(event, today);
      const progress = event.budgetId ? progressByBudgetId.get(event.budgetId) ?? null : null;
      const budgetDef = event.budgetId ? budgetDefById.get(event.budgetId) ?? null : null;

      const item: EventRowItem = { event, state, progress, budgetDef };
      if (state === 'on') on.push(item);
      else if (state === 'upcoming') upcoming.push(item);
      else done.push(item);
    }

    upcoming.sort((a, b) => a.event.start.localeCompare(b.event.start));
    done.sort((a, b) =>
      (b.event.end ?? b.event.start).localeCompare(a.event.end ?? a.event.start),
    );

    return { on, upcoming, done };
  }, [events, today, progressByBudgetId, budgetDefById]);

  const handleSaved = (res: EventSavedResponse) => {
    setFormOpen(false);
    const totalExisting =
      res.existing.ownIds !== undefined || res.existing.shareRootIds !== undefined
        ? (res.existing.ownIds?.length ?? 0) + (res.existing.shareRootIds?.length ?? 0)
        : res.existing.own.count + res.existing.shares.count;
    if (totalExisting > 0) {
      setPendingExisting({ eventId: res.event.id, existing: res.existing });
    } else {
      navigate(`/events/${encodeURIComponent(res.event.id)}`);
    }
  };

  const handleExistingDone = () => {
    const id = pendingExisting?.eventId;
    setPendingExisting(null);
    if (id) {
      navigate(`/events/${encodeURIComponent(id)}`);
    }
  };

  const isLoading = eventsQuery.isPending && events.length === 0;
  const error = eventsQuery.error;

  return (
    <Screen
      title={t('events.listTitle')}
      back="/trips"
      bottomBar={
        events.length > 0 ? (
          <Button
            type="button"
            variant="primary"
            block
            data-testid="events-new-button"
            onClick={() => setFormOpen(true)}
          >
            {`+ ${t('events.newEvent')}`}
          </Button>
        ) : undefined
      }
    >
      <div className="fsl-events flex flex-col gap-4">
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : error && events.length === 0 ? (
          <InlineError error={error} onRetry={() => eventsQuery.refetch()} />
        ) : events.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={t('events.listTitle')}
            body={t('events.empty')}
            action={
              <Button
                type="button"
                variant="primary"
                block
                data-testid="events-empty-add"
                onClick={() => setFormOpen(true)}
              >
                {`+ ${t('events.newEvent')}`}
              </Button>
            }
          />
        ) : (
          <>
            <EventSection
              testId="events-section-on"
              heading={t('events.sectionOn')}
              items={sections.on}
              today={today}
            />
            <EventSection
              testId="events-section-upcoming"
              heading={t('events.sectionUpcoming')}
              items={sections.upcoming}
              today={today}
            />
            <EventSection
              testId="events-section-done"
              heading={t('events.sectionDone')}
              items={sections.done}
              today={today}
            />
          </>
        )}
      </div>

      <EventForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={handleSaved} />

      <EventExistingSheet
        eventId={pendingExisting?.eventId ?? null}
        existing={pendingExisting?.existing ?? null}
        onDone={handleExistingDone}
      />
    </Screen>
  );
}
