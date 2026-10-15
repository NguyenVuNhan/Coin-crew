import { useRef, useState, type JSX } from 'react';
import { Link } from 'react-router';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useApprovalsLink } from '../lib/detailsNav';
import { usePrefersReducedMotion } from '../lib/media';
import { ApprovalItem, approvalKey, waitingApprovals } from './ApprovalsCard';
import { FocusWatch } from './FocusWatch';
import { Icon } from './icons';
import './ApprovalQueue.css';

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
    <section className="fsl-approval-queue" role="region" aria-label={t('approvals.title')}>
      <div className="fsl-approval-queue__bar">
        <span className="fsl-approval-queue__position" aria-live="polite">
          {t('approvals.position', { i: index + 1, n })}
        </span>
        {n > 1 && (
          <div className="fsl-approval-queue__nav">
            <button
              type="button"
              className="fsl-approval-queue__arrow fsl-approval-queue__arrow--prev"
              aria-label={t('approvals.previous')}
              title={t('approvals.previous')}
              disabled={index === 0}
              onClick={() => go(-1)}
            >
              <Icon name="chevronRight" size={20} />
            </button>
            <button
              type="button"
              className="fsl-approval-queue__arrow"
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
        className={`fsl-approval-queue__item${dir && !reduced ? ` fsl-approval-queue__item--${dir}` : ''}`}
      >
        <ApprovalItem view={view} approval={approvals[index]!} switching={switching} />
      </FocusWatch>
      {n > 1 && (
        <Link className="fsl-approval-queue__all" {...seeAll}>
          {t('approvals.seeAll', { n })}
        </Link>
      )}
    </section>
  );
}
