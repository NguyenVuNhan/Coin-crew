import { useEffect, useLayoutEffect, useRef } from 'react';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useBackToTrip } from '../lib/detailsNav';
import { Screen } from '../components/Screen';
import { ApprovalItem, approvalKey, waitingApprovals } from '../components/ApprovalsCard';
import { FocusWatch } from '../components/FocusWatch';

/**
 * Every approval that is waiting, each with its own actions. Handled ones drop out as the trip refreshes,
 * and when none are left it leaves by itself (a shared link with nothing waiting goes to the trip).
 */
export function ApprovalList({ view, onClose, switching = false }: { view: TripView; onClose(): void; switching?: boolean }) {
  const approvals = waitingApprovals(view);
  const empty = approvals.length === 0;

  // Strict mode runs effects twice on mount, and closing steps back in history: leave only once per emptying.
  const left = useRef(false);
  useEffect(() => {
    if (!empty) {
      left.current = false;
    } else if (!left.current) {
      left.current = true;
      onClose();
    }
  }, [empty, onClose]);

  // Handling an item removes it from the list: the item that takes its place gets the keyboard focus the removed one held.
  const list = useRef<HTMLUListElement>(null);
  const handoff = useRef(false);
  const keys = approvals.map(approvalKey);
  const previousKeys = useRef(keys);
  useLayoutEffect(() => {
    const before = previousKeys.current;
    previousKeys.current = keys;
    if (!handoff.current) return;
    handoff.current = false;
    const items = list.current?.children;
    if (!items || items.length === 0) return;
    const gone = before.findIndex((k) => !keys.includes(k));
    (items[Math.min(Math.max(gone, 0), items.length - 1)] as HTMLElement).focus();
  }, [keys.join('|')]);

  if (empty) return null;
  return (
    <ul ref={list} className="fsl-approvals__list m-0 p-0 list-none flex flex-col gap-3">
      {approvals.map((a) => (
        <FocusWatch
          key={approvalKey(a)}
          as="li"
          handoff={handoff}
          className="fsl-approvals__item min-w-0 bg-warning-soft border border-warning-border rounded-xl px-4 py-3"
        >
          <ApprovalItem view={view} approval={a} switching={switching} />
        </FocusWatch>
      ))}
    </ul>
  );
}

/** The full approvals list as a page of its own (phones). The wide trip page shows the same list in its right panel. */
export function Approvals({ view }: { view: TripView }) {
  const t = useT();
  const close = useBackToTrip(view.trip.id);
  return (
    <Screen title={t('approvals.allTitle')} onBack={close}>
      <div className="fsl-approvals py-4">
        <ApprovalList view={view} onClose={close} />
      </div>
    </Screen>
  );
}
