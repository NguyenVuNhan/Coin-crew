import { useMemo, useState } from 'react';
import { turnoutEstimate, type AttendanceScore, type SportParticipantEntry } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useAttendance } from '@cc/web-data-access/attendance';
import { Skeleton } from '@cc/web-ui/components/Skeleton';
import { Button } from '@cc/web-ui/components/Button';
import { TurnoutSheet } from './TurnoutSheet';

export interface TurnoutCardProps {
  tripId: string;
  entries: SportParticipantEntry[];
  people: { id: string; name: string; avatarUrl?: string | null }[];
}

/** Admin-only "Likely to actually come" summary in the plan form. Shows nothing when the scores can't be loaded. */
export function TurnoutCard({ tripId, entries, people }: TurnoutCardProps) {
  const t = useT();
  const { data, isPending, isError } = useAttendance(tripId, { enabled: true });
  const [open, setOpen] = useState(false);

  const scored = useMemo(() => (Array.isArray(data?.people) ? data.people.filter((p) => p?.score) : []), [data]);
  const estimate = useMemo(() => {
    const scores = new Map<string, AttendanceScore>(scored.map((p) => [p.participantId, p.score]));
    return turnoutEstimate(
      entries.map((e) => ({ participantId: e.participantId, slots: e.maleSlots + e.femaleSlots })),
      scores,
    );
  }, [entries, scored]);

  if (isPending) return <Skeleton height="5rem" radius="xl" className="fsl-turnout-card-skeleton" />;
  if (isError || !data) return null;

  const rows = entries.map((e) => {
    const person = people.find((p) => p.id === e.participantId);
    return {
      participantId: e.participantId,
      name: person?.name ?? e.participantId,
      avatarUrl: person?.avatarUrl,
      person: scored.find((p) => p.participantId === e.participantId),
    };
  });
  const pct = (n: number) => (estimate.total > 0 ? `${(n / estimate.total) * 100}%` : '0%');

  return (
    <div
      className="fsl-turnout-card rounded-xl border border-border bg-card p-3 flex flex-col gap-2"
      data-testid="turnout-card"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{t('turnout.title')}</span>
        <span className="text-base font-semibold text-foreground tabular-nums" data-testid="turnout-estimate">
          {t('turnout.estimate', { likely: estimate.likely, total: estimate.total })}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="bg-primary" style={{ width: pct(estimate.sure) }} />
        <div className="bg-primary/40" style={{ width: pct(estimate.unsure) }} />
        <div className="bg-muted-foreground/40" style={{ width: pct(estimate.flaky) }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground tabular-nums" data-testid="turnout-counts">
          {t('turnout.counts', { sure: estimate.sure, unsure: estimate.unsure, flaky: estimate.flaky })}
        </span>
        <Button variant="ghost" onClick={() => setOpen(true)} className="min-h-11 shrink-0">
          {t('turnout.seeWho')}
        </Button>
      </div>
      <TurnoutSheet open={open} onClose={() => setOpen(false)} rows={rows} />
    </div>
  );
}
