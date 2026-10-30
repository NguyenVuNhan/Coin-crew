import type { JSX } from 'react';
import type { PersonView } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { Avatar } from './Avatar';

export interface SplitBetweenProps {
  people: readonly PersonView[];
  chosen: ReadonlySet<string>;
  me: string | null;
  onOpen(): void;
}

/** The line above the split picker that says who the bill is split between; tapping it opens the sheet. */
export function SplitBetween({ people, chosen, me, onOpen }: SplitBetweenProps): JSX.Element {
  const t = useT();
  const inGroup = people.filter((p) => chosen.has(p.id));
  const n = inGroup.length;
  const total = people.length;
  const names = inGroup.map((p) => (p.id === me ? t('splitBetween.you') : p.name)).join(', ');
  const label = n > 0 && n === total ? t('splitBetween.everyone', { n }) : t('splitBetween.label', { n, total });

  return (
    <div className={cn('fsl-split-between mb-3')}>
      <button
        type="button"
        className={cn(
          'fsl-split-between__button flex items-center gap-3 w-full min-h-12 p-3 bg-card border border-border rounded-xl text-foreground text-left cursor-pointer hover:bg-muted/50 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label={t('splitBetween.aria', { label, names: names || t('splitBetween.none') })}
        onClick={onOpen}
      >
        <span className={cn('fsl-split-between__avatars flex shrink-0 -space-x-2')} aria-hidden="true">
          {inGroup.slice(0, 3).map((p) => (
            <Avatar key={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" className="ring-2 ring-card" />
          ))}
        </span>
        <span className={cn('fsl-split-between__text flex flex-col flex-1 min-w-0')}>
          <span className={cn('fsl-split-between__label text-sm text-muted-foreground')}>{label}</span>
          <span className={cn('fsl-split-between__names text-base font-medium text-foreground truncate')}>
            {n > 0 ? names : t('splitBetween.none')}
          </span>
        </span>
        <span className={cn('fsl-split-between__change shrink-0 text-sm font-semibold text-primary')} aria-hidden="true">
          {t('splitBetween.change')}
        </span>
      </button>
      {n === 0 && (
        <p role="alert" className={cn('fsl-split-between__error mt-2 text-sm text-danger')}>
          {t('splitError.NO_PARTICIPANTS')}
        </p>
      )}
    </div>
  );
}
