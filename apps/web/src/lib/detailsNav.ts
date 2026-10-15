import { useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** Router state on a details entry that a trip list opened: the list is the entry right behind it. */
interface DetailsState {
  fromList: true;
}

function cameFromList(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Partial<DetailsState>).fromList === true;
}

/** How a trip list opens a details or approvals entry; switching inside the wide panel replaces the entry and keeps its state. */
function entryOptions(state: unknown, switching: boolean): { replace?: true; state: unknown } {
  return switching ? { replace: true, state } : { state: { fromList: true } satisfies DetailsState };
}

/**
 * Opens the details of an expense or payment from a trip list. Opening marks the entry `fromList`, so leaving
 * it can go back in history. Switching to another row while details are showing (the wide panel) replaces
 * that entry and keeps its state: an entry reached from a shared link stays unmarked, one opened from the list stays marked.
 */
export function useOpenDetails(tripId: string): (kind: 'expense' | 'payment', id: string, switching?: boolean) => void {
  const navigate = useNavigate();
  const { state } = useLocation();
  return useCallback(
    (kind, id, switching = false) => {
      navigate(`/t/${tripId}/${kind === 'expense' ? 'expenses' : 'payments'}/${id}`, entryOptions(state, switching));
    },
    [navigate, state, tripId],
  );
}

/** `<Link>` props for the full approvals list, marked and replaced by the same rules as `useOpenDetails`. */
export function useApprovalsLink(tripId: string, switching = false): { to: string; replace?: true; state: unknown } {
  const { state } = useLocation();
  return { to: `/t/${tripId}/approvals`, ...entryOptions(state, switching) };
}

/**
 * Leaves the details of a transaction: one step back in history when a trip list opened them (so the list
 * underneath is the page they left, and history does not grow), or, for a shared link that has nothing
 * behind it, to the trip page in place of the link.
 * The phone details page's back arrow, "Back to trip" and the wide panel's × and Esc use it.
 */
export function useBackToTrip(tripId: string): () => void {
  const navigate = useNavigate();
  const fromList = cameFromList(useLocation().state);
  return useCallback(() => {
    if (fromList) navigate(-1);
    else navigate(`/t/${tripId}`, { replace: true });
  }, [navigate, fromList, tripId]);
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
