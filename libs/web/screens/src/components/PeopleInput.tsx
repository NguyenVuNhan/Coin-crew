import { useId, useMemo, useRef, useEffect } from 'react';
import { UserCheck, X } from 'lucide-react';
import { normalizeName, type Gender } from '@cc/core';
import { cn } from '@cc/web-ui/lib/utils';
import { useT } from '@cc/web-i18n';
import { newPersonEntry, type PersonEntry } from '@cc/web-util/recentPeople';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { AddPeopleBar, type NewPerson } from './AddPeopleBar';
import { GenderPill } from './GenderPill';
import { showUndo } from './UndoSnackbarHost';

export interface PeopleInputMe {
  name: string;
  gender: Gender | null;
  onGenderChange(g: Gender): void;
}

/** The roster of a group being created: you first, then everyone added with the add bar under the list. */
export function PeopleInput({
  value,
  onChange,
  showGender = false,
  me,
  onDraftChange,
}: {
  value: PersonEntry[];
  onChange(v: PersonEntry[]): void;
  showGender?: boolean;
  me?: PeopleInputMe;
  onDraftChange?: (draft: string, gender: Gender | null) => void;
}) {
  const t = useT();
  const baseId = useId();
  const labelId = `${baseId}-label`;

  // Undo runs after later renders: it must remove its rows from the list as it is then, not as it was.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  const commit = (next: PersonEntry[]) => {
    valueRef.current = next;
    onChange(next);
  };

  const exclude = useMemo(() => new Set(value.flatMap((e) => (e.userId ? [e.userId] : []))), [value]);
  const accountNames = useMemo(
    () => new Map(value.flatMap((e) => (e.userId ? [[normalizeName(e.name), e.name] as const] : []))),
    [value],
  );

  const setGender = (key: string, gender: Gender) => {
    commit(valueRef.current.map((e) => (e.key === key ? { ...e, gender } : e)));
  };

  const remove = (key: string) => {
    commit(valueRef.current.filter((e) => e.key !== key));
  };

  const handleAdd = (people: NewPerson[]): Promise<NewPerson[]> => {
    const existingPlainNorms = new Set([
      ...(me ? [normalizeName(me.name)] : []),
      ...valueRef.current.filter((e) => !e.userId).map((e) => normalizeName(e.name)),
    ]);
    const existingUserIds = new Set(
      valueRef.current.flatMap((e) => (e.userId ? [e.userId] : [])),
    );

    const uniqueToAdd: NewPerson[] = [];
    const skipped: NewPerson[] = [];

    for (const p of people) {
      const norm = normalizeName(p.name);
      if (norm === '') {
        skipped.push(p);
        continue;
      }
      if (p.userId && existingUserIds.has(p.userId)) {
        skipped.push(p);
        continue;
      }
      if (!p.userId && existingPlainNorms.has(norm)) {
        skipped.push(p);
        continue;
      }

      if (!p.userId) {
        existingPlainNorms.add(norm);
      }
      if (p.userId) {
        existingUserIds.add(p.userId);
      }
      uniqueToAdd.push(p);
    }
    if (uniqueToAdd.length === 0) return Promise.resolve(skipped);

    const added = uniqueToAdd.map((p) => newPersonEntry(p.name, p.userId, p.gender));
    commit([...valueRef.current, ...added]);
    const keys = new Set(added.map((e) => e.key));
    const first = uniqueToAdd[0];
    const message =
      skipped.length > 0
        ? t('addBar.addedManyWithSkipped', { count: uniqueToAdd.length, skipped: skipped.length })
        : uniqueToAdd.length > 1 || !first
          ? t('addBar.addedMany', { count: uniqueToAdd.length })
          : first.gender
            ? t('addBar.addedWithGender', {
                name: first.name,
                gender: first.gender === 'M' ? t('gender.pillM') : t('gender.pillF'),
              })
            : t('addBar.added', { name: first.name });
    showUndo({
      message,
      actionLabel: t('common.undo'),
      onAction: () => commit(valueRef.current.filter((e) => !keys.has(e.key))),
    });
    return Promise.resolve(skipped);
  };

  const rowClass =
    'fsl-people-input__row flex flex-col gap-1 min-h-14 px-4 py-2 justify-center';
  const nameClass = 'fsl-people-input__name min-w-0 truncate text-base font-medium text-foreground';

  return (
    <div className={cn('fsl-people-input flex flex-col gap-2')}>
      <span id={labelId} className={cn('fsl-form-label text-sm font-medium text-foreground')}>
        {t('create.others')}
      </span>
      <ul
        aria-labelledby={labelId}
        className={cn(
          'fsl-people-input__list list-none m-0 p-0 bg-card border border-border rounded-xl divide-y divide-border',
        )}
      >
        {me && (
          <li className={cn(rowClass, 'fsl-people-input__row--me')}>
            <div className={cn('flex items-center gap-3 min-w-0')}>
              <Avatar name={me.name} />
              <span className={cn('flex flex-col flex-1 min-w-0')}>
                <span className={cn(nameClass)}>{me.name}</span>
                <span className={cn('fsl-people-input__you text-xs text-muted-foreground')}>{t('trip.you')}</span>
              </span>
              {showGender && (
                <GenderPill name={me.name} value={me.gender} editable onChange={me.onGenderChange} />
              )}
            </div>
          </li>
        )}
        {value.map((entry) => {
          const removeLabel = t('create.removePerson', { name: entry.name });
          // A plain name that is a picked account's name (ignoring accents and capitals) is probably the same person.
          const typed = normalizeName(entry.name);
          const accountName = entry.userId || typed === '' ? undefined : accountNames.get(typed);
          return (
            <li
              key={entry.key}
              className={cn(rowClass, entry.userId && 'fsl-people-input__row--locked')}
            >
              <div className={cn('flex items-center gap-3 min-w-0')}>
                <Avatar name={entry.name} />
                {entry.userId ? (
                  <div
                    role="group"
                    aria-label={t('create.hasAccount', { name: entry.name })}
                    className={cn('fsl-people-input__locked flex items-center gap-2 flex-1 min-w-0')}
                  >
                    <span className={cn(nameClass)}>{entry.name}</span>
                    <UserCheck className="fsl-people-input__locked-icon shrink-0 size-[18px] text-primary" />
                  </div>
                ) : (
                  <span className={cn(nameClass, 'flex-1')}>{entry.name}</span>
                )}
                {showGender && (
                  <GenderPill
                    name={entry.name}
                    value={entry.gender ?? null}
                    editable
                    onChange={(g) => setGender(entry.key, g)}
                  />
                )}
                <button
                  type="button"
                  className={cn(
                    'fsl-people-input__remove inline-flex items-center justify-center size-11 min-w-11 shrink-0 -mr-2 rounded-full bg-transparent text-muted-foreground hover:bg-danger-soft hover:text-danger transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                  )}
                  aria-label={removeLabel}
                  title={removeLabel}
                  onClick={() => remove(entry.key)}
                >
                  <X className="size-5" />
                </button>
              </div>
              {accountName !== undefined && (
                <p className={cn('fsl-people-input__hint m-0 text-sm text-warning-foreground')}>
                  {t('create.alreadyListed', { name: accountName })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <AddPeopleBar sport={showGender} suggest={{ exclude }} onAdd={handleAdd} onDraftChange={onDraftChange} />
    </div>
  );
}
