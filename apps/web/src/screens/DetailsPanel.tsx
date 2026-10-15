import { useCallback, useEffect, useRef } from 'react';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useBackToTrip, useOpenDetails } from '../lib/detailsNav';
import { Icon } from '../components/icons';
import { ExpenseDetails } from '../components/ExpenseDetails';
import { PaymentDetails } from '../components/PaymentDetails';
import type { Selection } from './TripRoute';
import { ApprovalList } from './Approvals';
import './DetailsPanel.css';

/** The expense or payment whose details are open (the approvals list is not one). */
export type Detail = Exclude<Selection, { kind: 'approvals' }>;

/**
 * The wide screen's right panel showing one expense or payment, or the full approvals list (members only).
 * Not modal: it takes focus when it opens, × and Esc close it (back in history, or to the trip for a shared link),
 * and nothing else is trapped.
 */
export function DetailsPanel({ view, selection }: { view: TripView; selection: Selection }) {
  const t = useT();
  const close = useBackToTrip(view.trip.id);
  const panel = useRef<HTMLElement>(null);
  const label = selection.kind === 'expense' ? t('details.expense') : selection.kind === 'payment' ? t('details.payment') : t('approvals.allTitle');
  const selectedId = selection.kind === 'approvals' ? null : selection.id;

  useEffect(() => {
    const el = panel.current;
    (el?.querySelector<HTMLElement>('h2') ?? el)?.focus();
  }, [selection.kind, selectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A sheet open on top (Invite) handles its own Esc.
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="fsl-details-panel"
      aria-label={label}
    >
      <div className="fsl-details-panel__head">
        <span className="fsl-details-panel__kind">{label}</span>
        <button type="button" className="fsl-details-panel__close" aria-label={t('common.close')} title={t('common.close')} onClick={close}>
          <Icon name="x" size={20} />
        </button>
      </div>
      {/* Keyed by id so a reject reason or an error never carries over to the next row. */}
      {selection.kind === 'expense' ? (
        <ExpenseDetails key={selection.id} view={view} expenseId={selection.id} onClose={close} />
      ) : selection.kind === 'payment' ? (
        <PaymentDetails key={selection.id} view={view} paymentId={selection.id} onClose={close} />
      ) : (
        <ApprovalList view={view} onClose={close} switching />
      )}
    </section>
  );
}

/**
 * How a trip page's lists open the details panel. `detail` is the open expense or payment (null when nothing, or the
 * approvals list, is selected); `open` selects another row, and when the panel closes again focus goes back to the
 * row that opened it.
 */
export function useDetailsSelection(tripId: string, selection: Selection | null): { detail: Detail | null; open(kind: Detail['kind'], id: string): void } {
  const openDetails = useOpenDetails(tripId);
  const opener = useRef<HTMLElement | null>(null);
  const detail: Detail | null = selection && selection.kind !== 'approvals' ? selection : null;
  const detailKey = detail ? `${detail.kind}/${detail.id}` : null;

  const open = useCallback(
    (kind: Detail['kind'], id: string) => {
      if (detail?.kind === kind && detail.id === id) return;
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // The panel shows one thing at a time (details or the approvals list): switching replaces the entry, so × is one step from the list.
      openDetails(kind, id, selection !== null);
    },
    [detail, openDetails, selection],
  );

  const lastDetail = useRef(detailKey);
  useEffect(() => {
    if (lastDetail.current !== null && detailKey === null && opener.current?.isConnected) opener.current.focus();
    lastDetail.current = detailKey;
  }, [detailKey]);

  return { detail, open };
}
