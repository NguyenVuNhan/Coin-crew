import { useEffect, useRef } from 'react';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useBackToTrip } from '../lib/detailsNav';
import { Screen } from '../components/Screen';
import { ApprovalItem, approvalKey, waitingApprovals } from '../components/ApprovalsCard';
import './Approvals.css';

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

  if (empty) return null;
  return (
    <ul className="fsl-approvals__list">
      {approvals.map((a) => (
        <li key={approvalKey(a)} className="fsl-approvals__item">
          <ApprovalItem view={view} approval={a} switching={switching} />
        </li>
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
      <div className="fsl-approvals">
        <ApprovalList view={view} onClose={close} />
      </div>
    </Screen>
  );
}
