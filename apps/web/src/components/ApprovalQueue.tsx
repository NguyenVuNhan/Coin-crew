import { useEffect, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router';
import type { TripView } from '@fsl/core';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { useApprovalsLink } from '../lib/detailsNav';
import { usePrefersReducedMotion } from '../lib/media';
import { ApprovalItem, approvalKey, waitingApprovals } from './ApprovalsCard';
import { FocusWatch } from './FocusWatch';
import { Icon } from './icons';
import { Pill } from './Pill';

type Direction = 'next' | 'prev';
interface Cursor {
  key: string | null;
  index: number;
  dir: Direction | null;
}

export function ApprovalQueue({
  view,
  switching = false,
}: {
  view: TripView;
  switching?: boolean;
}): JSX.Element | null {
  const t = useT();
  const reduced = usePrefersReducedMotion();
  const seeAll = useApprovalsLink(view.trip.id, switching);
  const [cursor, setCursor] = useState<Cursor>({ key: null, index: 0, dir: null });
  // Approving the shown card removes it: whichever card shows next takes the keyboard focus the removed one held.
  const handoff = useRef(false);
  // The hand-off is for the card that mounts in the same commit. A passive effect runs after that, so whatever it did
  // not use (the last card went, nothing took over) is dropped here and cannot move focus when a card arrives later.
  useEffect(() => {
    handoff.current = false;
  });

  const approvals = waitingApprovals(view);
  const keys = approvals.map(approvalKey);
  const n = keys.length;

  if (n === 0) return null;

  let index = 0;
  let dir = cursor.dir;
  const found = cursor.key === null ? -1 : keys.indexOf(cursor.key);
  if (found >= 0) {
    index = found; // still here (it may have moved up when an earlier one was handled)
  } else {
    index = Math.min(cursor.index, n - 1); // handled: the next one takes its place
    if (cursor.key !== null) dir = 'next';
  }
  const shownKey = keys[index]!;
  if (cursor.key !== shownKey || cursor.index !== index || cursor.dir !== dir) {
    setCursor({ key: shownKey, index, dir }); // adjusting state while rendering is intended here
  }

  const go = (delta: 1 | -1) => {
    const i = index + delta;
    if (i < 0 || i >= n) return;
    setCursor({ key: keys[i]!, index: i, dir: delta > 0 ? 'next' : 'prev' });
  };

  return (
    <section className="fsl-approval-queue flex flex-col gap-3 rounded-xl border border-border bg-card p-4 overflow-hidden shadow-xs" role="region" aria-label={t('approvals.title')}>
      <div className="fsl-approval-queue__bar flex min-h-11 items-center justify-between gap-2">
        <Pill tone="warning" className="fsl-approval-queue__position" aria-live="polite">
          {t('approvals.position', { i: index + 1, n })}
        </Pill>
        {n > 1 && (
          <div className="fsl-approval-queue__nav inline-flex -mr-2">
            <button
              type="button"
              className="fsl-approval-queue__arrow fsl-approval-queue__arrow--prev inline-flex size-11 items-center justify-center rounded-full bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              aria-label={t('approvals.previous')}
              title={t('approvals.previous')}
              disabled={index === 0}
              onClick={() => go(-1)}
            >
              <Icon name="chevronRight" size={20} className="-scale-x-100" />
            </button>
            <button
              type="button"
              className="fsl-approval-queue__arrow inline-flex size-11 items-center justify-center rounded-full bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              aria-label={t('approvals.next')}
              title={t('approvals.next')}
              disabled={index === n - 1}
              onClick={() => go(1)}
            >
              <Icon name="chevronRight" size={20} />
            </button>
          </div>
        )}
      </div>
      <FocusWatch
        key={shownKey}
        handoff={handoff}
        className={cn(
          'fsl-approval-queue__item min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-lg',
          dir && !reduced ? (dir === 'next' ? 'fsl-approval-queue__item--next animate-in fade-in-0 slide-in-from-right-6 duration-200' : 'fsl-approval-queue__item--prev animate-in fade-in-0 slide-in-from-left-6 duration-200') : '',
        )}
      >
        <ApprovalItem view={view} approval={approvals[index]!} switching={switching} />
      </FocusWatch>
      {n > 1 && (
        <Link className="fsl-approval-queue__all -mr-2 -mt-2 inline-flex min-h-11 items-center self-end px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...seeAll}>
          {t('approvals.seeAll', { n })}
        </Link>
      )}
    </section>
  );
}
