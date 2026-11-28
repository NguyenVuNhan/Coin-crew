import type { JSX } from 'react';
import type { EventMatch } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon } from '@cc/web-ui/components/icons';

export interface EntryEventRowProps {
  match: EventMatch | null;
  on: boolean;
  onToggle(next: boolean): void;
}

/**
 * Trip tag row shown in the expense entry form when the entry date falls inside
 * a trip's active or lead-up range.
 */
export function EntryEventRow({ match, on, onToggle }: EntryEventRowProps): JSX.Element | null {
  const t = useT();

  if (!match) return null;

  const { name } = match.event;

  if (on) {
    return (
      <div
        data-testid="entry-event-row"
        className="w-full min-h-11 px-4 py-1.5 flex items-center justify-between gap-3 rounded-xl bg-card text-foreground"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden="true"
            className="size-8 rounded-full bg-secondary text-secondary-foreground grid place-items-center shrink-0"
          >
            <Icon name="plane" size={16} />
          </span>
          <span className="text-sm font-semibold text-foreground truncate">
            {t('events.entryOn', { name })}
          </span>
        </span>
        <button
          type="button"
          aria-label={t('events.entryRemove', { name })}
          onClick={() => onToggle(false)}
          className="size-11 -mr-1.5 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 cursor-pointer border-0 bg-transparent transition-colors motion-reduce:transition-none"
        >
          <span
            aria-hidden="true"
            className="size-8 rounded-full bg-muted grid place-items-center"
          >
            <Icon name="x" size={16} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="entry-event-row"
      onClick={() => onToggle(true)}
      className="w-full min-h-11 px-4 py-2.5 flex items-center justify-between gap-3 rounded-xl bg-card text-left text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-0 cursor-pointer transition-colors motion-reduce:transition-none"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon name="plane" size={18} className="shrink-0" />
        <span className="text-sm font-semibold truncate">
          {t('events.entrySuggest', { name })}
        </span>
      </span>
      <Icon name="plus" size={18} className="shrink-0" />
    </button>
  );
}
