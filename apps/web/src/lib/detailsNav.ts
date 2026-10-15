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

/** The pages a trip route can show, from the list itself down to the one opened on top of it. */
export type TripPage = 'list' | 'approvals' | 'details';
const DEPTH: Record<TripPage, number> = { list: 0, approvals: 1, details: 2 };

/**
 * Keeps the window's scroll place across the trip's pages (on phones the approvals list and the details are pages
 * of their own). Going deeper remembers where the page being left was scrolled and starts the new one at its top;
 * going back puts each page where it was left, and a page that was left behind is forgotten, so opening it again
 * is a new visit that starts at the top.
 */
export function useListScroll(page: TripPage): void {
  const saved = useRef<Partial<Record<TripPage, number>>>({});
  const committed = useRef(page);

  // Read while rendering: React has not touched the page yet, so this is still where the page being left was scrolled.
  if (page !== committed.current && DEPTH[page] > DEPTH[committed.current] && typeof window !== 'undefined') {
    saved.current[committed.current] = window.scrollY;
  }

  useLayoutEffect(() => {
    const from = committed.current;
    if (from === page) return; // first render, or nothing changed
    committed.current = page;
    if (DEPTH[page] > DEPTH[from]) {
      scrollWindowTo(0);
      return;
    }
    scrollWindowTo(saved.current[page] ?? 0);
    for (const left of Object.keys(saved.current) as TripPage[]) {
      if (DEPTH[left] > DEPTH[page]) delete saved.current[left];
    }
  }, [page]);
}
