import { useState, useRef, useId, useMemo } from 'react';
import type { JSX, KeyboardEvent, ClipboardEvent } from 'react';
import { UserCheck } from 'lucide-react';
import type { RecentPerson, Gender } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';
import { useT } from '@cc/web-i18n';
import { filterRecentPeople } from '@cc/web-util/recentPeople';
import { useRecentPeople } from '@cc/web-data-access/recentPeople';
import { Button } from '@cc/web-ui/components/Button';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Input } from '@cc/web-ui/components/ui/input';

export interface NewPerson {
  name: string;
  gender: Gender | null;
  userId?: string;
}

export interface AddPeopleBarProps {
  /** Sport groups: "+ Male" and "+ Female". Trip groups: one "+ Add". */
  sport: boolean;
  /** Resolves with the people that could NOT be added (empty when all were). */
  onAdd(people: NewPerson[]): Promise<NewPerson[]>;
  /** Creating a group: suggest friends from your other groups; these userIds are already listed. */
  suggest?: { exclude: Set<string> };
}

export function AddPeopleBar({ sport, onAdd, suggest }: AddPeopleBarProps): JSX.Element {
  const t = useT();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (idx: number) => `${listboxId}-opt-${idx}`;

  const [name, setName] = useState('');
  const [lastGender, setLastGender] = useState<Gender>('M');
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data } = useRecentPeople({ enabled: suggest !== undefined });
  const exclude = suggest?.exclude;
  const suggestions = useMemo(
    () => (exclude === undefined ? [] : filterRecentPeople(name, data ?? [], exclude)),
    [name, data, exclude],
  );
  const isOpen = suggest !== undefined && focused && suggestions.length > 0 && closedFor !== name;
  const highlighted = suggestions.length > 0 ? Math.min(highlight, suggestions.length - 1) : -1;

  const submit = (people: NewPerson[], clearField = true) => {
    const pending = onAdd(people);
    if (clearField) {
      setName('');
      setHighlight(-1);
      setClosedFor(null);
    }
    inputRef.current?.focus();
    if (clearField) {
      void pending.then((left) => {
        if (left.length === 1 && left[0]) {
          const restore = left[0].name;
          setName((current) => (current === '' ? restore : current));
        }
      });
    }
  };

  const addTyped = (gender: Gender | null) => {
    if (gender !== null) setLastGender(gender);
    const trimmed = name.trim();
    if (trimmed === '') return;
    submit([{ name: trimmed, gender }], true);
  };

  const pick = (person: RecentPerson) => {
    setHighlight(-1);
    submit(
      [{ name: person.name, userId: person.userId, gender: sport ? lastGender : null }],
      true,
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Safari sends the Enter that ends an IME composition (Vietnamese Telex on macOS and iOS) with `isComposing`
    // false but keyCode 229: it belongs to the IME, not to the list.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      if (isOpen) {
        e.preventDefault();
        setHighlight((prev) => (prev + 1) % suggestions.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (isOpen) {
        e.preventDefault();
        setHighlight((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
      return;
    }
    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setClosedFor(name);
        setHighlight(-1);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlighted >= 0) {
        const person = suggestions[highlighted];
        if (person) pick(person);
        return;
      }
      const trimmed = name.trim();
      if (trimmed === '') return;
      submit([{ name: trimmed, gender: sport ? lastGender : null }], true);
      return;
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!/[,\n\r]/.test(text)) return;
    e.preventDefault();
    const names = text
      .split(/[,\n\r]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 40));
    if (names.length === 0) return;
    submit(
      names.map((n) => ({ name: n, gender: null })),
      false,
    );
  };

  const empty = name.trim() === '';

  return (
    <div className={cn('fsl-add-bar flex items-center gap-2 w-full')}>
      <div className={cn('relative flex-1 min-w-0')}>
        <Input
          ref={inputRef}
          className={cn('fsl-add-bar__field fsl-input flex-1 min-w-0 text-base')}
          type="text"
          maxLength={40}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={t('create.otherPlaceholder')}
          aria-label={t('addBar.nameLabel')}
          role={suggest ? 'combobox' : undefined}
          aria-autocomplete={suggest ? 'list' : undefined}
          aria-expanded={suggest ? isOpen : undefined}
          aria-controls={suggest && isOpen ? listboxId : undefined}
          aria-activedescendant={suggest && isOpen && highlighted >= 0 ? optionId(highlighted) : undefined}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFocused(true);
            setHighlight(-1);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => {
            setFocused(true);
            setHighlight(-1);
          }}
          onBlur={() => setFocused(false)}
        />
        {isOpen && (
          <div
            className={cn(
              'fsl-add-bar__dropdown fsl-people-input__dropdown absolute bottom-[calc(100%+4px)] left-0 right-0 z-10 bg-card border border-border rounded-xl shadow-md overflow-hidden py-1',
            )}
          >
            <div
              className={cn('fsl-people-input__dropdown-title px-3 pt-2 pb-1 text-xs text-muted-foreground')}
              aria-hidden="true"
            >
              {t('create.suggestTitle')}
            </div>
            <ul
              role="listbox"
              id={listboxId}
              aria-label={t('create.suggestTitle')}
              className={cn('fsl-people-input__options list-none m-0 p-0')}
            >
              {suggestions.map((p, i) => (
                <li
                  key={p.userId}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === highlighted}
                  className={cn(
                    'fsl-people-input__option flex items-center gap-3 min-h-11 px-3 py-2 cursor-pointer transition-colors motion-reduce:transition-none hover:bg-secondary',
                    i === highlighted && 'fsl-people-input__option--active bg-secondary',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                >
                  <Avatar name={p.name} size="sm" />
                  <span className={cn('fsl-people-input__option-text flex flex-col flex-1 min-w-0')}>
                    <span className={cn('fsl-people-input__option-name text-base font-medium text-foreground truncate')}>
                      {p.name}
                    </span>
                    <span className={cn('fsl-people-input__option-trips text-xs text-muted-foreground truncate')}>
                      {p.trips.join(' · ')}
                    </span>
                  </span>
                  <UserCheck className="fsl-people-input__option-icon shrink-0 size-[18px] text-primary" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {sport ? (
        <>
          <Button
            type="button"
            variant="secondary"
            className={cn('fsl-add-bar__add min-h-11')}
            disabled={empty}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => addTyped('M')}
          >
            {t('addBar.addM')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={cn('fsl-add-bar__add min-h-11')}
            disabled={empty}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => addTyped('F')}
          >
            {t('addBar.addF')}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className={cn('fsl-add-bar__add min-h-11')}
          disabled={empty}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => addTyped(null)}
        >
          {t('addBar.add')}
        </Button>
      )}
    </div>
  );
}
