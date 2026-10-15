import { useState, useRef, useId, useMemo, useEffect } from 'react';
import type { KeyboardEvent, ClipboardEvent } from 'react';
import { normalizeName, type RecentPerson } from '@fsl/core';
import { useT } from '../i18n';
import { newPersonEntry, filterRecentPeople, type PersonEntry } from '../lib/recentPeople';
import { useRecentPeople } from '../api/recentPeople';
import { Button } from './Button';
import { Avatar } from './Avatar';
import { Icon } from './icons';
import './PeopleInput.css';

function withEmptyLineAfter(list: PersonEntry[], index: number): { list: PersonEntry[]; focusKey: string; added: boolean } {
  const nextEntry = list[index + 1];
  if (nextEntry && !nextEntry.userId && nextEntry.name.trim() === '') {
    return { list, focusKey: nextEntry.key, added: false };
  }
  const fresh = newPersonEntry();
  const nextList = [...list.slice(0, index + 1), fresh, ...list.slice(index + 1)];
  return { list: nextList, focusKey: fresh.key, added: true };
}

export function PeopleInput({ value, onChange }: { value: PersonEntry[]; onChange(v: PersonEntry[]): void }) {
  const t = useT();
  const baseId = useId();
  const labelId = `${baseId}-label`;

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number>(-1);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const { data } = useRecentPeople();
  const exclude = useMemo(() => new Set(value.flatMap((e) => (e.userId ? [e.userId] : []))), [value]);
  const accountNames = useMemo(
    () => new Map(value.flatMap((e) => (e.userId ? [[normalizeName(e.name), e.name] as const] : []))),
    [value],
  );
  const activeEntry = value.find((e) => e.key === activeKey && !e.userId);
  const activeName = activeEntry?.name;
  const suggestions = useMemo(
    () => (activeName === undefined ? [] : filterRecentPeople(activeName, data ?? [], exclude)),
    [activeName, data, exclude],
  );
  const open = activeEntry !== undefined && suggestions.length > 0 && closedFor !== `${activeEntry.key}|${activeEntry.name}`;
  const highlighted = suggestions.length > 0 ? Math.min(highlight, suggestions.length - 1) : -1;

  const elements = useRef(new Map<string, HTMLElement>());
  const pendingFocusKey = useRef<string | null>(null);
  const registerRef = (key: string, el: HTMLElement | null) => {
    if (el) elements.current.set(key, el);
    else elements.current.delete(key);
  };
  const focusNow = (key: string) => {
    const el = elements.current.get(key);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
  };
  const focusAfterRender = (key: string) => {
    pendingFocusKey.current = key;
  };
  useEffect(() => {
    if (pendingFocusKey.current !== null) {
      const k = pendingFocusKey.current;
      pendingFocusKey.current = null;
      focusNow(k);
    }
  });

  const removeLabel = (entry: PersonEntry, index: number) =>
    t('create.removePerson', { name: entry.name.trim() || String(index + 1) });

  const setName = (key: string, name: string) => {
    onChange(value.map((e) => (e.key === key ? { ...e, name } : e)));
    setHighlight(-1);
  };

  const pick = (entry: PersonEntry, person: RecentPerson) => {
    setHighlight(-1);
    const picked = value.map((e) => (e.key === entry.key ? { ...e, name: person.name, userId: person.userId } : e));
    const index = value.findIndex((e) => e.key === entry.key);
    const r = withEmptyLineAfter(picked, index >= 0 ? index : 0);
    onChange(r.list);
    focusAfterRender(r.focusKey);
  };

  const removeAt = (index: number) => {
    let next = value.filter((_, i) => i !== index);
    if (next.length === 0) next = [newPersonEntry()];
    const target = next[Math.max(0, index - 1)];
    onChange(next);
    if (target) focusAfterRender(target.key);
  };

  const add = () => {
    const fresh = newPersonEntry();
    onChange([...value, fresh]);
    focusAfterRender(fresh.key);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, entry: PersonEntry, index: number) => {
    // Safari sends the Enter that ends an IME composition (Vietnamese Telex on macOS and iOS) with `isComposing`
    // false but keyCode 229: it belongs to the IME, not to the list.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      if (open) {
        e.preventDefault();
        setHighlight((prev) => (prev + 1) % suggestions.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      if (open) {
        e.preventDefault();
        setHighlight((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setClosedFor(`${entry.key}|${entry.name}`);
        setHighlight(-1);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlighted >= 0) {
        const person = suggestions[highlighted];
        if (person) pick(entry, person);
        return;
      }
      if (entry.name.trim() === '') return;
      const r = withEmptyLineAfter(value, index);
      if (r.added) {
        onChange(r.list);
        focusAfterRender(r.focusKey);
      } else {
        focusNow(r.focusKey);
      }
      return;
    }
    if (e.key === 'Backspace') {
      if (entry.name === '' && value.length > 1) {
        e.preventDefault();
        removeAt(index);
      }
      return;
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, entry: PersonEntry, index: number) => {
    const text = e.clipboardData.getData('text');
    if (!/[,\n\r]/.test(text)) return;
    e.preventDefault();
    const names = text
      .split(/[,\n\r]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, 40));
    const [first, ...others] = names;
    if (first === undefined) return;
    // An empty line takes the first name itself; a line with text stays as it is and the names go below it.
    const lines =
      entry.name.trim() === ''
        ? [{ ...entry, name: first }, ...others.map((n) => newPersonEntry(n))]
        : [entry, ...names.map((n) => newPersonEntry(n))];
    onChange([...value.slice(0, index), ...lines, ...value.slice(index + 1)]);
    const last = lines[lines.length - 1];
    if (last) focusAfterRender(last.key);
  };

  return (
    <div className="fsl-people-input" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="fsl-form-label">
        {t('create.others')}
      </span>
      <div className="fsl-people-input__list">
        {value.map((entry, index) => {
          if (entry.userId) {
            return (
              <div
                key={entry.key}
                className="fsl-people-input__row fsl-people-input__row--locked"
                role="group"
                aria-label={t('create.hasAccount', { name: entry.name })}
              >
                <div className="fsl-people-input__locked">
                  <Icon name="userCheck" size={20} className="fsl-people-input__locked-icon" />
                  <span className="fsl-people-input__locked-name">{entry.name}</span>
                </div>
                <button
                  type="button"
                  className="fsl-people-input__remove"
                  aria-label={removeLabel(entry, index)}
                  title={removeLabel(entry, index)}
                  onClick={() => removeAt(index)}
                  ref={(el) => registerRef(entry.key, el)}
                >
                  <Icon name="x" size={20} />
                </button>
              </div>
            );
          }

          const isOpen = open && entry.key === activeKey;
          const listboxId = `${baseId}-listbox-${entry.key}`;
          const optionId = (idx: number) => `${listboxId}-opt-${idx}`;
          // A plain name that is a picked account's name (ignoring accents and capitals) is probably the same person.
          const typed = normalizeName(entry.name);
          const accountName = typed === '' ? undefined : accountNames.get(typed);
          const hintId = `${baseId}-hint-${entry.key}`;

          return (
            <div key={entry.key} className="fsl-people-input__item">
              <div className="fsl-people-input__row">
                <div className="fsl-people-input__field">
                  <input
                    className="fsl-input"
                    type="text"
                    maxLength={40}
                    autoComplete="off"
                    placeholder={t('create.otherPlaceholder')}
                    aria-label={`${t('create.otherPlaceholder')} ${index + 1}`}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? listboxId : undefined}
                    aria-activedescendant={isOpen && highlighted >= 0 ? optionId(highlighted) : undefined}
                    aria-describedby={accountName === undefined ? undefined : hintId}
                    value={entry.name}
                    onChange={(e) => setName(entry.key, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, entry, index)}
                    onPaste={(e) => handlePaste(e, entry, index)}
                    onFocus={() => {
                      // A suggestion chosen with the arrows belongs to the line it was chosen on: Enter on this line
                      // must never pick an account the person did not choose here.
                      setActiveKey(entry.key);
                      setHighlight(-1);
                    }}
                    onBlur={() => setActiveKey((prev) => (prev === entry.key ? null : prev))}
                    ref={(el) => registerRef(entry.key, el)}
                  />
                  {isOpen && (
                    <div className="fsl-people-input__dropdown">
                      <div className="fsl-people-input__dropdown-title" aria-hidden="true">
                        {t('create.suggestTitle')}
                      </div>
                      <ul role="listbox" id={listboxId} aria-label={t('create.suggestTitle')} className="fsl-people-input__options">
                        {suggestions.map((p, i) => (
                          <li
                            key={p.userId}
                            id={optionId(i)}
                            role="option"
                            aria-selected={i === highlighted}
                            className={`fsl-people-input__option${i === highlighted ? ' fsl-people-input__option--active' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(entry, p)}
                          >
                            <Avatar name={p.name} size="sm" />
                            <span className="fsl-people-input__option-text">
                              <span className="fsl-people-input__option-name">{p.name}</span>
                              <span className="fsl-people-input__option-trips">{p.trips.join(' · ')}</span>
                            </span>
                            <Icon name="userCheck" size={18} className="fsl-people-input__option-icon" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {value.length > 1 && (
                  <button
                    type="button"
                    className="fsl-people-input__remove"
                    aria-label={removeLabel(entry, index)}
                    title={removeLabel(entry, index)}
                    onClick={() => removeAt(index)}
                  >
                    <Icon name="x" size={20} />
                  </button>
                )}
              </div>
              {accountName !== undefined && (
                <p id={hintId} className="fsl-people-input__hint">
                  {t('create.alreadyListed', { name: accountName })}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Button type="button" variant="secondary" className="fsl-people-input__add" onClick={add}>
        {t('create.addPerson')}
      </Button>
    </div>
  );
}
