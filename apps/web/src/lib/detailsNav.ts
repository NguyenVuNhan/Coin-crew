import { useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Leaves the details of a transaction: one step back in history when the person got here from inside
 * the app (so the list underneath is the page they left, and history does not grow), or, for a shared
 * link that has nothing behind it, to the trip page in place of the link.
 * The phone details page's back arrow and the "Back to trip" button use it, and so will the wide panel's close button.
 */
export function useBackToTrip(tripId: string): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key !== 'default') navigate(-1);
    else navigate(`/t/${tripId}`, { replace: true });
  }, [navigate, key, tripId]);
}

function scrollWindowTo(y: number): void {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, y);
}

/**
 * While `away` is true the trip page is replaced by a page of its own (the phone details). Remembers how far
 * the list was scrolled when that began, puts it back when `away` ends, and starts the other page at its top.
 */
export function useListScroll(away: boolean): void {
  const saved = useRef(0);
  const committedAway = useRef(away);

  // Read while rendering: React has not touched the page yet, so this is still where the list was scrolled.
  if (away && !committedAway.current && typeof window !== 'undefined') saved.current = window.scrollY;

  useLayoutEffect(() => {
    if (committedAway.current === away) return; // first render, or nothing changed
    committedAway.current = away;
    scrollWindowTo(away ? 0 : saved.current);
  }, [away]);
}
