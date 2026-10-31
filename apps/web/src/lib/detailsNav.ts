import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTrip } from './tripBase';

/** How a trip list opens a details or approvals entry; switching inside the wide panel replaces the entry and keeps its state. */
function entryOptions(state: unknown, switching: boolean): { replace?: true; state?: unknown } {
  return switching ? { replace: true, state } : {};
}

/**
 * Opens the details of an expense, payment or fund income from a trip list. Switching to another row while
 * details are showing (the wide panel) replaces that entry and keeps its state.
 */
export function useOpenDetails(tripId: string): (kind: 'expense' | 'payment' | 'income', id: string, switching?: boolean) => void {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { href } = useTrip(tripId);
  return useCallback(
    (kind, id, switching = false) => {
      const segment = kind === 'expense' ? 'expenses' : kind === 'payment' ? 'payments' : 'fund';
      navigate(href(`/${segment}/${id}`), entryOptions(state, switching));
    },
    [navigate, state, href],
  );
}

/** `<Link>` props for the full approvals list, pushed or replaced by the same rules as `useOpenDetails`. */
export function useApprovalsLink(tripId: string, switching = false): { to: string; replace?: true; state?: unknown } {
  const { state } = useLocation();
  return { to: useTrip(tripId).href('/approvals'), ...entryOptions(state, switching) };
}

/** `<Link>` props for the player ratings leaderboard, pushed or replaced by the same rules as `useOpenDetails`. */
export function useRatingsLink(tripId: string, switching = false): { to: string; replace?: true; state?: unknown } {
  const { state } = useLocation();
  return { to: useTrip(tripId).href('/ratings'), ...entryOptions(state, switching) };
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
