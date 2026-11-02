import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useParams } from 'react-router';

/**
 * Where a trip's pages live: `/t/<tripId>` for members, `/j/<token>` for guests and view-only links. A guest's
 * address carries the link token, so it still opens when Zalo hands the page to another browser (whose storage
 * has no token).
 */
interface TripBase {
  tripId: string;
  base: string;
}

const TripBaseContext = createContext<TripBase | null>(null);

export function TripBaseProvider({ tripId, token, children }: { tripId: string; token: string; children: ReactNode }) {
  return <TripBaseContext.Provider value={{ tripId, base: `/j/${token}` }}>{children}</TripBaseContext.Provider>;
}

/**
 * The trip this page belongs to and `href(path)` for its pages (`href('/settings')`, `href()` for the trip itself).
 * Under `/t/:tripId`, or with no route at all (a component on its own), it falls back to `/t/<tripId>`, using
 * `fallbackTripId` when the route has none.
 */
export function useTrip(fallbackTripId?: string): { tripId: string; base: string; viaLink: boolean; href: (path?: string) => string } {
  const ctx = useContext(TripBaseContext);
  const params = useParams<{ tripId?: string }>();
  const tripId = ctx?.tripId ?? params.tripId ?? fallbackTripId ?? '';
  const base = ctx?.base ?? `/t/${tripId}`;
  const href = useCallback((path = '') => base + path, [base]);
  return { tripId, base, viaLink: ctx !== null, href };
}
