import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent, MouseEvent } from 'react';
import type { PersonView } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Pill } from './Pill';
import { Icon } from './icons';
import { formatDay } from '../lib/time';
import { matchesWordStart } from '../lib/nameSearch';
import type { RecentGroup } from '../lib/recentGroups';

export interface SplitPeopleSheetProps {
  open: boolean;
  onClose(): void;
  people: readonly PersonView[];
  chosen: ReadonlySet<string>;
  onChange(next: Set<string>): void;
  me: string | null;
  recent: readonly RecentGroup[];
}

/** Tapping these must not move focus off the search box: on a phone that would close the keyboard and reopen it. */
const keepSearchFocus = (e: MouseEvent) => e.preventDefault();

/** The sheet behind the Split between line; every change applies at once, Done only closes it. */
export function SplitPeopleSheet({
  open,
  onClose,
  people,
  chosen,
  onChange,
  me,
  recent,
}: SplitPeopleSheetProps): JSX.Element {
  const t = useT();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  const byId = new Map(people.map((p) => [p.id, p]));
  // Chips follow the order people were added (a Set keeps insertion order), so the newest sits next to the text box
  // and Backspace takes it off. Ids of people no longer offered are skipped.
  const chips = [...chosen].map((id) => byId.get(id)).filter((p): p is PersonView => p !== undefined);
  const n = chips.length;
  const total = people.length;

  const shown = (p: PersonView) => (p.id === me ? t('splitBetween.you') : p.name);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    onChange(next);
  };

  const clearAll = () => onChange(new Set());
  const addEveryone = () => onChange(new Set([...chips.map((p) => p.id), ...people.map((p) => p.id)]));
  const applyGroup = (g: RecentGroup) => onChange(new Set(g.people));

  const typed = query.trim() !== '';
  const suggestions = people.filter((p) => !chosen.has(p.id) && matchesWordStart(query, p.name));
  const alreadyIn = typed ? chips.filter((p) => matchesWordStart(query, p.name)) : [];

  const add = (id: string) => {
    toggle(id, true);
    setQuery('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Only a typed name picks someone: Enter on an empty field is the phone keyboard closing, and Enter while a
      // Vietnamese input method is still composing a word is not a choice yet.
      if (typed && !e.nativeEvent.isComposing && suggestions[0]) {
        add(suggestions[0].id);
      }
    } else if (e.key === 'Backspace' && query === '' && n > 0) {
      toggle(chips[n - 1]!.id, false);
    }
  };

  // A new search each time the sheet opens.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // The text box comes after the chips in a field that stops at about three lines: keep it scrolled to the end so the
  // text box is always in view, on open and whenever a chip comes or goes.
  const chipKey = chips.map((p) => p.id).join(' ');
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (field) field.scrollTop = field.scrollHeight;
  }, [open, chipKey]);

  // The sheet's content mounts a render after `open` turns true (Radix portal), so also scroll when the field attaches.
  const attachField = useCallback((field: HTMLDivElement | null) => {
    fieldRef.current = field;
    if (field) field.scrollTop = field.scrollHeight;
  }, []);

  const displayedRecent = recent.slice(0, 3);

  return (
    <Sheet open={open} onClose={onClose} title={t('splitSheet.title')} className="fsl-split-sheet">
      {displayedRecent.length > 0 && (
        <section className={cn('fsl-split-sheet__recent', 'mb-4')}>
          <h3 className={cn('fsl-split-sheet__section-title', 'm-0 mb-2 text-xs leading-4 font-semibold tracking-wider uppercase text-muted-foreground')}>
            {t('splitSheet.recent')}
          </h3>
          <ul className={cn('fsl-split-sheet__recent-list', 'm-0 p-0 list-none flex flex-col gap-2')}>
            {displayedRecent.map((g) => {
              const groupPeople = g.people
                .map((id) => byId.get(id))
                .filter((p): p is PersonView => p !== undefined);
              const rest = groupPeople.length - 3;
              const names =
                groupPeople.slice(0, 3).map(shown).join(', ') +
                (rest > 0 ? ' ' + t('splitSheet.more', { n: rest }) : '');

              return (
                <li
                  key={g.expenseId}
                  className={cn(
                    'fsl-split-sheet__recent-row',
                    'flex items-center gap-3 min-h-14 px-3 py-2 border border-border rounded-xl bg-card',
                  )}
                >
                  <span className={cn('fsl-split-sheet__stack', 'flex shrink-0 -space-x-2')} aria-hidden="true">
                    {groupPeople.slice(0, 3).map((p) => (
                      <Avatar key={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" className="ring-2 ring-card" />
                    ))}
                  </span>
                  <span className={cn('fsl-split-sheet__recent-text', 'flex flex-col flex-1 min-w-0')}>
                    <span className={cn('fsl-split-sheet__recent-title', 'text-base leading-normal font-medium text-foreground truncate')}>
                      {g.description}
                    </span>
                    <span className={cn('fsl-split-sheet__recent-meta', 'text-sm leading-5 text-muted-foreground truncate')}>
                      {t('splitSheet.recentMeta', {
                        date: formatDay(g.spentOn),
                        n: g.people.length,
                        names,
                      })}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className={cn('fsl-split-sheet__use', 'shrink-0 min-h-11 px-4')}
                    aria-label={t('splitSheet.useAria', { description: g.description })}
                    onClick={() => applyGroup(g)}
                  >
                    {t('splitSheet.use')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className={cn('fsl-split-sheet__search', 'sticky top-[-1rem] z-1 -mx-4 px-4 py-2 bg-card')}>
        <div className={cn('fsl-split-sheet__toolbar', 'flex items-center justify-between gap-3 min-h-11 mb-2')}>
          <span className={cn('fsl-split-sheet__count', 'text-sm text-muted-foreground tabular-nums')}>
            {t('splitSheet.count', { n, total })}
          </span>
          <span className={cn('fsl-split-sheet__actions', 'flex gap-1')}>
            {n > 0 && (
              <button
                type="button"
                className={cn(
                  'fsl-split-sheet__link',
                  'min-h-11 px-2 border-0 rounded-sm bg-transparent text-primary text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                )}
                onClick={clearAll}
              >
                {t('splitSheet.clearAll')}
              </button>
            )}
            {n < total && (
              <button
                type="button"
                className={cn(
                  'fsl-split-sheet__link',
                  'min-h-11 px-2 border-0 rounded-sm bg-transparent text-primary text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                )}
                onClick={addEveryone}
              >
                {t('splitSheet.addEveryone')}
              </button>
            )}
          </span>
        </div>

        <div
          ref={attachField}
          className={cn(
            'fsl-split-sheet__field',
            'flex flex-wrap items-center gap-2 min-h-12 max-h-[7.5rem] overflow-y-auto p-2 border border-border rounded-xl bg-card cursor-text focus-within:border-primary focus-within:ring-2 focus-within:ring-ring',
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {chips.map((p) => (
            <span
              key={p.id}
              className={cn(
                'fsl-split-sheet__chip',
                'inline-flex items-center gap-1 max-w-full h-8 pl-1 pr-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium',
              )}
            >
              <Avatar name={p.name} avatarUrl={p.avatarUrl} size="sm" />
              <span className={cn('fsl-split-sheet__chip-name', 'truncate')}>{shown(p)}</span>
              <button
                type="button"
                className={cn(
                  'fsl-split-sheet__chip-remove',
                  'relative inline-flex items-center justify-center shrink-0 size-7 p-0 border-0 rounded-full bg-transparent text-inherit cursor-pointer hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                aria-label={t('splitSheet.remove', { name: p.name })}
                onMouseDown={keepSearchFocus}
                onClick={() => toggle(p.id, false)}
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            className={cn(
              'fsl-split-sheet__input',
              'flex-1 min-w-24 min-h-8 px-1 border-0 outline-none bg-transparent text-foreground text-base leading-normal placeholder:text-muted-foreground focus-visible:ring-0',
            )}
            aria-label={t('splitSheet.searchLabel')}
            placeholder={t('splitSheet.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
          />
        </div>

        {n === 0 && (
          <p role="alert" className={cn('fsl-split-sheet__error', 'mt-2 text-sm leading-5 text-danger')}>
            {t('splitError.NO_PARTICIPANTS')}
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className={cn('fsl-split-sheet__sr-only', 'sr-only')}>
        {typed ? t('splitSheet.matches', { n: suggestions.length }) : ''}
      </p>

      {suggestions.length > 0 ? (
        <ul className={cn('fsl-split-sheet__suggestions', 'mt-2 p-0 list-none divide-y divide-border')}>
          {suggestions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={cn(
                  'fsl-split-sheet__suggestion',
                  'flex items-center gap-3 w-full min-h-12 px-2 py-1 border-0 bg-transparent text-foreground text-left cursor-pointer hover:bg-muted/50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                aria-label={t('splitSheet.add', { name: p.name })}
                onMouseDown={keepSearchFocus}
                onClick={() => add(p.id)}
              >
                <Avatar name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                <span className={cn('fsl-split-sheet__name', 'flex-1 min-w-0 truncate text-foreground font-medium')}>{p.name}</span>
                {p.status === 'left' && <Pill tone="neutral">{t('people.leftBadge')}</Pill>}
                <Icon name="plus" size={18} className="text-primary shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      ) : alreadyIn.length > 0 ? (
        <p className={cn('fsl-split-sheet__empty', 'mt-3 text-sm leading-5 text-muted-foreground')}>
          {t('splitSheet.alreadyIn', { names: alreadyIn.map(shown).join(', ') })}
        </p>
      ) : n === total ? (
        <p className={cn('fsl-split-sheet__empty', 'mt-3 text-sm leading-5 text-muted-foreground')}>
          {t('splitSheet.allChosen')}
        </p>
      ) : (
        <p className={cn('fsl-split-sheet__empty', 'mt-3 text-sm leading-5 text-muted-foreground')}>
          {t('splitSheet.noMatch', { q: query.trim() })}
        </p>
      )}

      <div className={cn('fsl-split-sheet__footer', 'sticky bottom-0 mt-4 pt-2 bg-card')}>
        <Button variant="primary" block onClick={onClose}>
          {t('splitSheet.done')}
        </Button>
      </div>
    </Sheet>
  );
}
