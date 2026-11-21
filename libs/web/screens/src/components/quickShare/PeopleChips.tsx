import { useState, type JSX } from 'react';
import type { PersonView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { SplitPeopleSheet } from '../SplitPeopleSheet';
import type { QuickSplit } from './useQuickSplit';

export interface PeopleChipsProps {
  split: QuickSplit;
  label: string;
  me: string | null;
  testId?: string;
}

/**
 * Horizontal wrapping row of recent-person toggle chips plus a "+" button that opens SplitPeopleSheet.
 */
export function PeopleChips({
  split,
  label,
  me,
  testId = 'entry-people',
}: PeopleChipsProps): JSX.Element {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);

  const byId = new Map<string, PersonView>(split.people.map((p) => [p.id, p]));
  const chipIdSet = new Set(split.chipIds);

  const orderedIds: string[] = [];
  for (const id of split.chipIds) {
    if (byId.has(id)) orderedIds.push(id);
  }
  for (const id of split.chosen) {
    if (id !== me && !chipIdSet.has(id) && byId.has(id)) {
      orderedIds.push(id);
    }
  }

  const showMeChip = me !== null && split.chosen.has(me);
  const mePerson = me !== null ? byId.get(me) : undefined;

  return (
    <div data-testid={testId} className="fsl-people-chips flex flex-col gap-2">
      <span className="text-sm font-semibold text-muted-foreground px-1">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {orderedIds.map((id) => {
          const person = byId.get(id);
          if (!person) return null;
          const isChosen = split.chosen.has(id);
          return (
            <button
              key={id}
              type="button"
              data-testid={`entry-person-${id}`}
              aria-pressed={isChosen}
              onClick={() => split.toggle(id)}
              className={cn(
                'fsl-people-chip',
                'inline-flex items-center gap-2 min-h-11 rounded-full pl-1.5 pr-3.5 py-1.5 text-sm font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isChosen
                  ? 'bg-secondary text-secondary-foreground border-primary'
                  : 'bg-card text-foreground border-border hover:bg-muted',
              )}
            >
              <Avatar name={person.name} avatarUrl={person.avatarUrl} size="sm" />
              <span>{person.name}</span>
            </button>
          );
        })}

        {showMeChip && me !== null && (
          <button
            key={me}
            type="button"
            data-testid={`entry-person-${me}`}
            aria-pressed={true}
            onClick={() => split.toggle(me)}
            className={cn(
              'fsl-people-chip',
              'inline-flex items-center gap-2 min-h-11 rounded-full pl-1.5 pr-3.5 py-1.5 text-sm font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'bg-secondary text-secondary-foreground border-primary',
            )}
          >
            <Avatar
              name={mePerson?.name ?? t('entry.me')}
              avatarUrl={mePerson?.avatarUrl}
              size="sm"
            />
            <span>{t('entry.me')}</span>
          </button>
        )}

        <button
          type="button"
          data-testid="entry-people-more"
          aria-label={t('splitSheet.title')}
          onClick={() => setSheetOpen(true)}
          className={cn(
            'fsl-people-chip-more',
            'inline-flex items-center justify-center min-h-11 min-w-11 rounded-full px-3 bg-card text-muted-foreground border border-border hover:bg-muted transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Icon name="plus" size={18} />
        </button>
      </div>

      <SplitPeopleSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        people={split.people}
        chosen={split.chosen}
        onChange={(next) => split.setChosen(next)}
        me={me}
        recent={[]}
        extra={split.splitExtra}
      />
    </div>
  );
}
