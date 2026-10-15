import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend } from '../api/client';

export interface PendingPayment {
  fromId: string;
  toId: string;
  amount: number;
}

/** How long Undo is on offer before a tick is recorded. */
export const UNDO_MS = 5000;

/**
 * A tick that is recorded only once Undo has had its 5 seconds (spec §5.4), so an undone tick leaves no trace on the
 * server. The payment goes out at once, with `fetch` keepalive, if the page is hidden or left or the component goes
 * away first: a tick is never lost. Ticking a second row sends the first one straight away.
 *
 * `sending` holds payments sent but not yet in the reloaded trip, so their rows can stay done in the meantime;
 * `error` is the last failed send (cleared after a while, or by the next tick).
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
  const [sending, setSending] = useState<PendingPayment[]>([]);
  const [error, setError] = useState<unknown>(null);
  // The source of truth for timers and page listeners, which outlive the render that started them.
  const current = useRef<{ payment: PendingPayment; tripId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const mounted = useRef(false);

  const flush = useCallback(
    (keepalive: boolean) => {
      const cur = current.current;
      if (!cur) return;
      current.current = null;
      clearTimeout(cur.timer);
      const { payment, tripId: id } = cur;
      if (mounted.current) {
        setPending(null);
        setSending((list) => [...list, payment]);
      }
      apiSend(`/api/trips/${id}/payments`, 'POST', payment, id, { keepalive })
        .then(() => queryClient.invalidateQueries({ queryKey: ['trip', id] }))
        .catch((err: unknown) => {
          if (mounted.current) setError(err);
        })
        .finally(() => {
          if (mounted.current) setSending((list) => list.filter((p) => p !== payment));
        });
    },
    [queryClient],
  );

  useEffect(() => {
    mounted.current = true;
    const onPageHide = () => flush(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      mounted.current = false;
      flush(true); // leaving the screen within the 5 seconds still records the tick
    };
  }, [flush]);

  useEffect(() => {
    if (error === null) return;
    const timer = setTimeout(() => setError(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [error]);

  const schedule = useCallback(
    (payment: PendingPayment) => {
      flush(false);
      setError(null);
      current.current = { payment, tripId, timer: setTimeout(() => flush(false), UNDO_MS) };
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
