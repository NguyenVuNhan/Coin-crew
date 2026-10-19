import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiSend } from '../api/client';

export interface PendingPayment {
  fromId: string;
  toId: string;
  amount: number;
}

/** How long Undo is on offer before a tick is recorded. */
export const UNDO_MS = 5000;

type InFlight = PendingPayment & { tripId: string };

/**
 * Ticks sent and not yet back from the server with the reloaded trip, kept outside any component: a tick sent as its
 * screen goes away must still show as done (and not be sent again) if the screen comes back within the round trip.
 * An entry lives only for that round trip.
 */
let inFlight: readonly InFlight[] = [];
const inFlightListeners = new Set<() => void>();

function setInFlight(next: readonly InFlight[]): void {
  inFlight = next;
  for (const listener of [...inFlightListeners]) listener();
}

function subscribeInFlight(listener: () => void): () => void {
  inFlightListeners.add(listener);
  return () => {
    inFlightListeners.delete(listener);
  };
}

const getInFlight = () => inFlight;

const isInFlight = (tripId: string, p: PendingPayment) =>
  inFlight.some((s) => s.tripId === tripId && s.fromId === p.fromId && s.toId === p.toId);

/**
 * A tick that is recorded only once Undo has had its 5 seconds (spec §5.4), so an undone tick leaves no trace on the
 * server. The payment goes out at once if the page is hidden or left or the component goes away first, and every
 * send uses `fetch` keepalive (the body is tiny), so closing the tab mid-request never loses a tick. Ticking a
 * second row sends the first one straight away. Ticks send `settles: true` to prevent recording stale debts.
 *
 * `sending` holds this trip's payments sent but not yet in the reloaded trip, so their rows can stay done in the
 * meantime, even across a remount; `error` is the last failed send (cleared after a while, or by the next tick).
 */
export function usePendingPayment(tripId: string): {
  pending: PendingPayment | null;
  sending: PendingPayment[];
  error: unknown;
  schedule(p: PendingPayment): void;
  undo(): void;
} {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [error, setError] = useState<unknown>(null);
  const allInFlight = useSyncExternalStore(subscribeInFlight, getInFlight, getInFlight);
  const sending = useMemo(() => allInFlight.filter((p) => p.tripId === tripId), [allInFlight, tripId]);
  // The source of truth for timers and page listeners, which outlive the render that started them.
  const current = useRef<{ payment: PendingPayment; tripId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const mounted = useRef(false);

  const flush = useCallback(() => {
    const cur = current.current;
    if (!cur) return;
    current.current = null;
    clearTimeout(cur.timer);
    const { payment, tripId: id } = cur;
    if (mounted.current) setPending(null);
    const entry: InFlight = { ...payment, tripId: id };
    setInFlight([...inFlight, entry]);
    apiSend(`/api/trips/${id}/payments`, 'POST', { ...payment, settles: true }, id, { keepalive: true })
      // Reload the trip even if nothing shows it now, so a screen that comes back finds the debt gone.
      .then(() => queryClient.invalidateQueries({ queryKey: ['trip', id], refetchType: 'all' }))
      .catch((err: unknown) => {
        // Someone recorded it first: reload so the row goes away, and say so.
        if (err instanceof ApiClientError && err.code === 'ALREADY_HANDLED') {
          void queryClient.invalidateQueries({ queryKey: ['trip', id], refetchType: 'all' });
        }
        if (mounted.current) setError(err);
      })
      .finally(() => setInFlight(inFlight.filter((p) => p !== entry)));
  }, [queryClient]);

  useEffect(() => {
    mounted.current = true;
    const onPageHide = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      mounted.current = false;
      flush(); // leaving the screen within the 5 seconds still records the tick
    };
  }, [flush]);

  useEffect(() => {
    if (error === null) return;
    const timer = setTimeout(() => setError(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const schedule = useCallback(
    (payment: PendingPayment) => {
      if (isInFlight(tripId, payment)) return; // already on its way: never record it twice
      flush();
      setError(null);
      current.current = { payment, tripId, timer: setTimeout(flush, UNDO_MS) };
      setPending(payment);
    },
    [flush, tripId],
  );

  const undo = useCallback(() => {
    const cur = current.current;
    if (!cur) return;
    current.current = null;
    clearTimeout(cur.timer);
    setPending(null);
  }, []);

  return { pending, sending, error, schedule, undo };
}
