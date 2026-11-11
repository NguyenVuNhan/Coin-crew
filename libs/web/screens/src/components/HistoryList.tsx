import { formatVnd, type HistoryGap, type HistoryLine } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import { Pill } from '@cc/web-ui/components/Pill';
import { cn } from '@cc/web-ui/lib/utils';

export interface HistoryListProps {
  lines: HistoryLine[];
  /** The other person from the viewer's side: the owner's counterparty, or the owner when `perspective` is 'other'. */
  otherName: string;
  /** Shown above the list when there is a gap: twoWay, suggested, gap. */
  summary?: { twoWay: number; suggested: number; gap: HistoryGap | null; viaName?: string | null };
  /** 'other' flips wording and colour for /r (the viewer is `other`). Default 'owner'. */
  perspective?: 'owner' | 'other';
  /** /r: title, date, effect only. */
  compact?: boolean;
  /** Tag lines from these tripIds with history.inTheirLedger. */
  theirsTripIds?: Set<string>;
}

export function HistoryList({
  lines,
  otherName,
  summary,
  perspective = 'owner',
  compact = false,
  theirsTripIds,
}: HistoryListProps) {
  const t = useT();
  const viewerIsOwner = perspective === 'owner';
  const gap = summary?.gap ?? null;

  const gapText = (g: HistoryGap): string => {
    if (g.kind === 'rounding') return t('history.rounded');
    if (summary?.viaName) {
      return t('history.reroutedVia', { amount: formatVnd(Math.abs(g.difference)), name: summary.viaName });
    }
    return t('history.rerouted', { amount: formatVnd(summary!.suggested) });
  };

  const titleOf = (l: HistoryLine): string => {
    if (l.kind === 'expense') return l.title ?? '';
    const viewerPaid = (l.paidBy === 'owner') === viewerIsOwner;
    return t(viewerPaid ? 'history.youPaid' : 'history.theyPaid', { name: otherName });
  };

  const metaOf = (l: HistoryLine): string => {
    const parts = [l.date];
    if (!compact && l.kind === 'expense') {
      const viewerPaid = (l.paidBy === 'owner') === viewerIsOwner;
      parts.push(
        t('history.paidBy', { name: viewerPaid ? t('trip.you') : otherName, amount: formatVnd(l.amount) }),
      );
      const mine = viewerIsOwner ? l.ownerShare : l.otherShare;
      const theirs = viewerIsOwner ? l.otherShare : l.ownerShare;
      parts.push(t('history.shares', { mine: formatVnd(mine), name: otherName, theirs: formatVnd(theirs) }));
    }
    return parts.join(' · ');
  };

  return (
    <div className="fsl-history">
      {gap && summary && (
        <div className="fsl-history__gap mb-2 rounded-xl bg-card px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{t('history.betweenYou')}</span>
            <Amount value={viewerIsOwner ? summary.twoWay : -summary.twoWay} tone="auto" size="sm" />
          </div>
          <p className="mt-1 text-muted-foreground">{gapText(gap)}</p>
        </div>
      )}
      {lines.length > 0 && (
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card">
        {lines.map((l) => {
          const disabled = l.state === 'disabled';
          const effect = viewerIsOwner ? l.effect : -l.effect;
          return (
            <li
              key={l.id}
              className="fsl-history__line flex min-h-11 items-center justify-between gap-3 px-4 py-3"
              data-testid={`history-line-${l.id}`}
            >
              <div className="min-w-0">
                <p className={cn('text-sm font-semibold', disabled && 'line-through text-muted-foreground')}>
                  {titleOf(l)}
                </p>
                <p className="text-xs text-muted-foreground">{metaOf(l)}</p>
                {(l.state === 'waiting' ||
                  l.state === 'unapproved' ||
                  (theirsTripIds?.has(l.tripId) ?? false)) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.state === 'waiting' && <Pill tone="warning">{t('history.waiting')}</Pill>}
                    {l.state === 'unapproved' && <Pill tone="warning">{t('history.notApproved')}</Pill>}
                    {theirsTripIds?.has(l.tripId) && (
                      <Pill tone="neutral">{t('history.inTheirLedger', { name: otherName })}</Pill>
                    )}
                  </div>
                )}
              </div>
              <span
                className={cn(
                  'fsl-history__effect inline-flex shrink-0 items-center tabular-nums font-semibold',
                  disabled ? 'text-muted-foreground' : effect > 0 ? 'text-success' : effect < 0 ? 'text-danger' : 'text-foreground',
                )}
              >
                {effect > 0 ? '+' : effect < 0 ? '−' : ''}
                <Amount
                  value={Math.abs(effect)}
                  tone={disabled ? 'neutral' : effect > 0 ? 'success' : effect < 0 ? 'danger' : 'neutral'}
                  size="md"
                  className={disabled ? 'text-muted-foreground' : undefined}
                />
              </span>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
