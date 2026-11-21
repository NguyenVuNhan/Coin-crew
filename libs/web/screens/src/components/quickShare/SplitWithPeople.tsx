import { useMemo, useState, type JSX } from 'react';
import { cn } from '@cc/web-ui/lib/utils';
import { SplitBetween } from '../SplitBetween';
import { SplitPeopleSheet } from '../SplitPeopleSheet';
import type { QuickSplit, QuickSplitKind } from './useQuickSplit';

export interface SplitWithPeopleProps {
  split: QuickSplit;
  /** The heading: "Chia với ai? (không bắt buộc)" on Chi, "Với ai?" on Vay/Nợ. */
  label: string;
  me: string | null;
  kind: QuickSplitKind;
  testId?: string;
}

/**
 * Who the money is with, as the group expense form shows it: the "Chia cho" line (`SplitBetween`) that opens
 * the same people sheet. On Chi you are always in the split, so you are counted in once anyone is picked.
 */
export function SplitWithPeople({
  split,
  label,
  me,
  kind,
  testId = 'entry-people',
}: SplitWithPeopleProps): JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);

  // You first, as in a group expense; then the people you used most recently.
  const people = useMemo(() => {
    const rank = new Map(split.chipIds.map((id, i) => [id, i]));
    const order = (id: string) => (id === me ? -1 : (rank.get(id) ?? Number.MAX_SAFE_INTEGER));
    return [...split.people].sort((a, b) => order(a.id) - order(b.id));
  }, [split.people, split.chipIds, me]);

  const shown = useMemo(() => {
    if (kind === 'shared' && me && split.chosen.size > 0) return new Set([me, ...split.chosen]);
    return new Set(split.chosen);
  }, [kind, me, split.chosen]);

  const handleChange = (next: Set<string>) => {
    const chosen = new Set(next);
    // Chi always includes you; the split hook adds you back itself.
    if (kind === 'shared' && me) chosen.delete(me);
    split.setChosen(chosen);
  };

  return (
    <div data-testid={testId} className={cn('fsl-split-with flex flex-col gap-2')}>
      <h2 className={cn('fsl-section-heading text-sm font-semibold text-muted-foreground m-0')}>{label}</h2>
      <SplitBetween people={people} chosen={shown} me={me} onOpen={() => setSheetOpen(true)} optional />
      <SplitPeopleSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        people={people}
        chosen={shown}
        onChange={handleChange}
        me={me}
        recent={[]}
        extra={split.splitExtra}
      />
    </div>
  );
}
