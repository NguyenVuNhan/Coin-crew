import { useState, useRef } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import type { PersonView } from '@fsl/core';
import { useT } from '../i18n';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Pill } from './Pill';
import { Icon } from './icons';
import { formatDay } from '../lib/time';
import { matchesWordStart } from '../lib/nameSearch';
import type { RecentGroup } from '../lib/recentGroups';
import './SplitPeopleSheet.css';

export const SEARCH_ABOVE = 12;

export interface SplitPeopleSheetProps {
  open: boolean;
  onClose(): void;
  people: readonly PersonView[];
  chosen: ReadonlySet<string>;
  onChange(next: Set<string>): void;
  me: string | null;
  recent: readonly RecentGroup[];
}

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

  const inGroup = people.filter((p) => chosen.has(p.id));
  const n = inGroup.length;
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
  const addEveryone = () => onChange(new Set(people.map((p) => p.id)));
  const applyGroup = (g: RecentGroup) => onChange(new Set(g.people));

  const search = people.length > SEARCH_ABOVE;
  const suggestions = people.filter((p) => !chosen.has(p.id) && matchesWordStart(query, p.name));

  const add = (id: string) => {
    toggle(id, true);
    setQuery('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[0]) {
        add(suggestions[0].id);
      }
    } else if (e.key === 'Backspace' && query === '' && inGroup.length > 0) {
      toggle(inGroup[inGroup.length - 1]!.id, false);
    }
  };

  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const displayedRecent = recent.slice(0, 3);

  return (
    <Sheet open={open} onClose={onClose} title={t('splitSheet.title')} className="fsl-split-sheet">
      {displayedRecent.length > 0 && (
        <section className="fsl-split-sheet__recent">
          <h3 className="fsl-split-sheet__section-title">{t('splitSheet.recent')}</h3>
          <ul className="fsl-split-sheet__recent-list">
            {displayedRecent.map((g) => {
              const groupPeople = g.people
                .map((id) => peopleMap.get(id))
                .filter((p): p is PersonView => p !== undefined);
              const rest = groupPeople.length - 3;
              const names =
                groupPeople.slice(0, 3).map(shown).join(', ') +
                (rest > 0 ? ' ' + t('splitSheet.more', { n: rest }) : '');

              return (
                <li key={g.expenseId} className="fsl-split-sheet__recent-row">
                  <span className="fsl-split-sheet__stack" aria-hidden="true">
                    {groupPeople.slice(0, 3).map((p) => (
                      <Avatar key={p.id} name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                    ))}
                  </span>
                  <span className="fsl-split-sheet__recent-text">
                    <span className="fsl-split-sheet__recent-title">{g.description}</span>
                    <span className="fsl-split-sheet__recent-meta">
                      {t('splitSheet.recentMeta', {
                        date: formatDay(g.spentOn),
                        n: g.people.length,
                        names,
                      })}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="fsl-split-sheet__use"
                    aria-label={t('splitSheet.useAria', { description: g.description })}
                    onClick={() => applyGroup(g)}
                  >
                    {t('splitSheet.use')}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="fsl-split-sheet__toolbar">
        <span className="fsl-split-sheet__count">{t('splitSheet.count', { n, total })}</span>
        <span className="fsl-split-sheet__actions">
          {n > 0 && (
            <button type="button" className="fsl-split-sheet__link" onClick={clearAll}>
              {t('splitSheet.clearAll')}
            </button>
          )}
          {n < total && (
            <button type="button" className="fsl-split-sheet__link" onClick={addEveryone}>
              {t('splitSheet.addEveryone')}
            </button>
          )}
        </span>
      </div>

      {n === 0 && (
        <p role="alert" className="fsl-split-sheet__error">
          {t('splitError.NO_PARTICIPANTS')}
        </p>
      )}

      {!search && (
        <ul className="fsl-split-sheet__list">
          {people.map((p) => (
            <li key={p.id}>
              <label className="fsl-split-sheet__tick-row">
                <input
                  type="checkbox"
                  className="fsl-split-sheet__checkbox"
                  checked={chosen.has(p.id)}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                />
                <Avatar name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                <span className="fsl-split-sheet__name">
                  {p.id === me ? t('splitSheet.you', { name: p.name }) : p.name}
                </span>
                {p.status === 'left' && <Pill tone="neutral">{t('people.leftBadge')}</Pill>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {search && (
        <>
          <div className="fsl-split-sheet__field" onClick={() => inputRef.current?.focus()}>
            {inGroup.map((p) => (
              <span key={p.id} className="fsl-split-sheet__chip">
                <Avatar name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                <span className="fsl-split-sheet__chip-name">{shown(p)}</span>
                <button
                  type="button"
                  className="fsl-split-sheet__chip-remove"
                  aria-label={t('splitSheet.remove', { name: p.name })}
                  onClick={() => toggle(p.id, false)}
                >
                  <Icon name="x" size={14} />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              className="fsl-split-sheet__input"
              aria-label={t('splitSheet.searchLabel')}
              placeholder={t('splitSheet.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
            />
          </div>

          <p role="status" aria-live="polite" className="fsl-split-sheet__sr-only">
            {query.trim() !== '' ? t('splitSheet.matches', { n: suggestions.length }) : ''}
          </p>

          {suggestions.length > 0 ? (
            <ul className="fsl-split-sheet__suggestions">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="fsl-split-sheet__suggestion"
                    aria-label={t('splitSheet.add', { name: p.name })}
                    onClick={() => add(p.id)}
                  >
                    <Avatar name={p.name} avatarUrl={p.avatarUrl} size="sm" />
                    <span className="fsl-split-sheet__name">{p.name}</span>
                    {p.status === 'left' && <Pill tone="neutral">{t('people.leftBadge')}</Pill>}
                    <Icon name="plus" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          ) : n === total ? (
            <p className="fsl-split-sheet__empty">{t('splitSheet.allChosen')}</p>
          ) : (
            <p className="fsl-split-sheet__empty">
              {t('splitSheet.noMatch', { q: query.trim() })}
            </p>
          )}
        </>
      )}

      <div className="fsl-split-sheet__footer">
        <Button variant="primary" block onClick={onClose}>
          {t('splitSheet.done')}
        </Button>
      </div>
    </Sheet>
  );
}
