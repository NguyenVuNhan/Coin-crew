import { useState, type JSX } from 'react';
import type { RequestItem } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';
import { HistoryList } from './HistoryList';

/** Under a /r row: which expenses it covers, opening into the compact history. Nothing for an item with no lines. */
export function RequestCovers({ item, owner }: { item: RequestItem; owner: string }): JSX.Element | null {
  const t = useT();
  const [open, setOpen] = useState(false);
  const lines = item.lines ?? [];
  const gap = item.gap ?? null;
  if (lines.length === 0) return null;

  const titles = lines
    // Name only what counts: a disabled expense stays in the list but is never the headline.
    .filter((l) => l.kind === 'expense' && l.title && l.state !== 'disabled')
    .slice(0, 2)
    .map((l) => l.title as string);
  const rest = lines.length - titles.length;
  const names = titles.join(', ');
  // Only payments: no titles to name, so fall back to the section title.
  const label =
    titles.length === 0
      ? t('history.title')
      : rest > 0
        ? t('history.covers', { names, count: rest })
        : names;

  const twoWay = lines
    .filter((l) => l.state === 'counted' || l.state === 'waiting')
    .reduce((sum, l) => sum + l.effect, 0);

  return (
    <div className="px-4 pb-3 text-sm">
      <button
        type="button"
        data-testid={`request-covers-${item.tripId}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">{label}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="shrink-0" />
      </button>
      {open && (
        <HistoryList
          lines={lines}
          otherName={owner}
          perspective="other"
          compact
          summary={gap ? { twoWay, suggested: item.amount, gap, viaName: null } : undefined}
        />
      )}
    </div>
  );
}
