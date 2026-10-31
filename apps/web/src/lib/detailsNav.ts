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
 * Opens the details of an expense, payment or fund income from a trip list. Opening marks the entry `fromList`, so leaving
 * it can go back in history. Switching to another row while details are showing (the wide panel) replaces
 * that entry and keeps its state: an entry reached from a shared link stays unmarked, one opened from the list stays marked.
 */
export function useOpenDetails(tripId: string): (kind: 'expense' | 'payment' | 'income', id: string, switching?: boolean) => void {
  const navigate = useNavigate();
  const { state } = useLocation();
  return useCallback(
    (kind, id, switching = false) => {
      const segment = kind === 'expense' ? 'expenses' : kind === 'payment' ? 'payments' : 'fund';
      navigate(`/t/${tripId}/${segment}/${id}`, entryOptions(state, switching));
    },
    [navigate, state, tripId],
  );
}

/** `<Link>` props for the full approvals list, marked and replaced by the same rules as `useOpenDetails`. */
export function useApprovalsLink(tripId: string, switching = false): { to: string; replace?: true; state: unknown } {
  const { state } = useLocation();
  return { to: `/t/${tripId}/approvals`, ...entryOptions(state, switching) };
}

/** `<Link>` props for the player ratings leaderboard, marked and replaced by the same rules as `useOpenDetails`. */
export function useRatingsLink(tripId: string, switching = false): { to: string; replace?: true; state: unknown } {
  const { state } = useLocation();
  return { to: `/t/${tripId}/ratings`, ...entryOptions(state, switching) };
}

/**
 * Leaves the details of a transaction: one step back in history when a trip list opened them (so the list
 * underneath is the page they left, and history does not grow), or, for a shared link that has nothing
 * behind it, to the trip page (or `fallback`, e.g. the main screen for the ledger) in place of the link.
 * The phone details page's back arrow, "Back to trip" and the wide panel's × and Esc use it.
 */
export function useBackToTrip(tripId: string, fallback = `/t/${tripId}`): () => void {
  const navigate = useNavigate();
  const fromList = cameFromList(useLocation().state);
  return useCallback(() => {
    if (fromList) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fromList, fallback]);
}

/**
 * Leaves the add or edit expense form, after saving or on back. When something in the app linked to the form, the
 * page it came from is right behind it, so one step back returns there (the list, or the details the edit was opened
 * from) and history does not grow. A form that was the first page of the visit (a shared or typed address) has nothing
 * of the app behind it: it is replaced by the trip page. The router gives only that first entry the key `default`.
 */
export function useLeaveForm(tripId: string, fallback = `/t/${tripId}`): () => void {
  const navigate = useNavigate();
  const openedInApp = useLocation().key !== 'default';
  return useCallback(() => {
    if (openedInApp) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, openedInApp, fallback]);
}

function scrollWindowTo(y: number): void {
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, y);
}

/** The pages a trip route can show, from the list itself down to the one opened on top of it. */
export type TripPage = 'list' | 'approvals' | 'ratings' | 'details';
const DEPTH: Record<TripPage, number> = { list: 0, approvals: 1, ratings: 1, details: 2 };

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

/** Kinds of transaction details the main screen can show, and the search param each one uses on `/trips`. */
export type HomeDetailKind = 'expense' | 'payment' | 'income';
const HOME_DETAIL_KINDS: readonly HomeDetailKind[] = ['expense', 'payment', 'income'];

/** The main screen with one of the ledger's transactions open in its right column (from 1024px). */
export function homeDetailsHref(kind: HomeDetailKind, id: string): string {
  return `/trips?${kind}=${encodeURIComponent(id)}`;
}

/** The transaction `homeDetailsHref` put in the search params, if any. */
export function homeDetailsFrom(params: URLSearchParams): { kind: HomeDetailKind; id: string } | null {
  for (const kind of HOME_DETAIL_KINDS) {
    const id = params.get(kind);
    if (id) return { kind, id };
  }
  return null;
}

/** The ledger transaction's own details page (phones). */
export function ledgerDetailsPath(ledgerId: string, kind: HomeDetailKind, id: string): string {
  const segment = kind === 'expense' ? 'expenses' : kind === 'payment' ? 'payments' : 'fund';
  return `/t/${ledgerId}/${segment}/${encodeURIComponent(id)}`;
}
