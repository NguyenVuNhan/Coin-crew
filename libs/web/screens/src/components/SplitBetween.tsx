import type { JSX } from 'react';
import type { PersonView } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';
import { useT } from '@cc/web-i18n';
import { Avatar } from '@cc/web-ui/components/Avatar';

export interface SplitBetweenProps {
  people: readonly PersonView[];
  chosen: ReadonlySet<string>;
  me: string | null;
  onOpen(): void;
  /** Nobody chosen is allowed (the entry page's "Chia với ai?"): no error under the line. */
  optional?: boolean;
}

/** The line above the split picker that says who the bill is split between; tapping it opens the sheet. */
export function SplitBetween({ people, chosen, me, onOpen, optional = false }: SplitBetweenProps): JSX.Element {
  const t = useT();
  const inGroup = people.filter((p) => chosen.has(p.id));
  const n = inGroup.length;
  const total = people.length;
  const names = inGroup.map((p) => (p.id === me ? t('splitBetween.you') : p.name)).join(', ');
  const label = optional
    ? n > 0
      ? t('splitBetween.count', { n })
      : null
    : n > 0 && n === total
      ? t('splitBetween.everyone', { n })
      : t('splitBetween.label', { n, total });
  const ariaLabel = t('splitBetween.aria', {
    label: label ?? t('splitBetween.empty'),
    names: names || t('splitBetween.none'),
  });

  return (
    <div className={cn('fsl-split-between', !optional && 'mb-3')}>
      <button
        type="button"
        className={cn(
          'fsl-split-between__button flex items-center gap-3 w-full min-h-12 p-3 bg-card border border-border rounded-xl text-foreground text-left cursor-pointer hover:bg-muted/50 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label={ariaLabel}
        onClick={onOpen}
      >
        {inGroup.length > 0 && (
          <span className={cn('fsl-split-between__avatars flex shrink-0 -space-x-2')} aria-hidden="true">
            {inGroup.slice(0, 3).map((p) => (
              <Avatar key={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" className="ring-2 ring-card" />
            ))}
          </span>
        )}
        <span className={cn('fsl-split-between__text flex flex-col flex-1 min-w-0')}>
          {label !== null && (
            <span className={cn('fsl-split-between__label text-sm text-muted-foreground')}>{label}</span>
          )}
          <span className={cn('fsl-split-between__names text-base font-medium text-foreground truncate')}>
            {n > 0 ? names : t('splitBetween.none')}
          </span>
        </span>
        <span className={cn('fsl-split-between__change shrink-0 text-sm font-semibold text-primary')} aria-hidden="true">
          {t('splitBetween.change')}
        </span>
      </button>
      {n === 0 && !optional && (
        <p role="alert" className={cn('fsl-split-between__error mt-2 text-sm text-danger')}>
          {t('splitError.NO_PARTICIPANTS')}
        </p>
      )}
    </div>
  );
}
