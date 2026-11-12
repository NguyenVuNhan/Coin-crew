import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { TripView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useTrip } from '../lib/tripBase';
import { linkTokens } from '@cc/web-util/linkTokens';
import { SignInSheet } from './SignInSheet';
import { Icon } from '@cc/web-ui/components/icons';
import { useMe } from '@cc/web-data-access/hooks';
import { Button } from '@cc/web-ui/components/Button';

/** The pages a guest (not signed in) still opens: the name picker, what they owe, paying, and their own bank details. */
const GUEST_PAGES = [/^\/who$/, /^\/owe$/, /^\/pay\/[^/]+$/, /^\/expenses\/[^/]+\/pay$/, /^\/bank$/, /^\/e\/[^/]+$/];

/** Whether a guest may open `rest`, the path after the group's base (`/j/<token>` or `/t/<id>`). */
export function guestMayOpen(rest: string): boolean {
  const path = rest.replace(/\/+$/, '');
  return GUEST_PAGES.some((re) => re.test(path));
}

/**
 * Guests only reach their pay pages (owner, 2026-11-12): any other group page, the group itself included, opens what
 * they owe instead. Seeing the group takes signing in. It reads the trip the pages below already fetch, and decides
 * nothing until that has arrived.
 */
export function GuestGate({ children }: { children: ReactNode }) {
  const { tripId, base, viaLink, href } = useTrip();
  const location = useLocation();
  // Read from the cache itself, not through a query observer: an observer keeps the entry the name picker just
  // dropped after a join, and would send a brand-new member to their pay page on the old guest view.
  const queryClient = useQueryClient();
  const subscribe = useCallback((cb: () => void) => queryClient.getQueryCache().subscribe(cb), [queryClient]);
  const view = useSyncExternalStore(subscribe, () => queryClient.getQueryData<TripView>(['trip', tripId]));
  const rest = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname;
  if (view?.me.kind === 'guest' && !guestMayOpen(rest)) {
    // No name yet: pick one first, keeping where they were going. Signing in and joining there opens the group;
    // picking a guest's name comes back here and lands on what they owe.
    if (view.me.participantId === null) {
      return <Navigate replace to={`${href('/who')}?next=${encodeURIComponent(location.pathname + location.search)}`} />;
    }
    // On the trip's own address with the link saved here, move under the link (the API needs its token).
    const saved = viaLink ? null : linkTokens.get(tripId);
    return <Navigate replace to={saved ? `/j/${encodeURIComponent(saved)}/owe` : href('/owe')} />;
  }
  return <>{children}</>;
}

/**
 * In place of "See the group" on a guest's pay pages. Signed out: sign in (Google or Zalo), then the name picker,
 * where joining under their own name opens the group and claiming a guest's name waits for a member. Already signed
 * in: join from the name picker. Asked to join already: a member will approve it.
 */
export function GuestSignIn({ pending = false, className }: { pending?: boolean; className?: string }) {
  const t = useT();
  const { href } = useTrip();
  const me = useMe();
  const [signInOpen, setSignInOpen] = useState(false);
  const sectionClass = `fsl-guest-signin flex flex-col gap-3 pt-2${className ? ` ${className}` : ''}`;
  if (pending) {
    return (
      <section className={sectionClass}>
        <p className="fsl-guest-signin__note m-0 px-4 py-3 rounded-xl text-sm text-center bg-secondary text-secondary-foreground">
          {t('guest.memberRequested')}
        </p>
      </section>
    );
  }
  if (me.data?.user) {
    return (
      <section className={sectionClass}>
        <p className="fsl-guest-signin__note m-0 text-sm text-muted-foreground text-center">{t('owe.joinToSee')}</p>
        <Button variant="secondary" block href={href('/who')} className="fsl-guest-signin__join">
          {t('owe.joinGroup')}
        </Button>
      </section>
    );
  }
  // One quiet button where "See the group" was: the pay page's one primary stays "Open bank app".
  return (
    <section className={sectionClass}>
      <p className="fsl-guest-signin__note m-0 text-sm text-muted-foreground text-center">{t('owe.signInToSee')}</p>
      <Button variant="secondary" block onClick={() => setSignInOpen(true)} className="fsl-guest-signin__open">
        <Icon name="user" size={16} />
        {t('owe.logIn')}
      </Button>
      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} returnTo={href('/who')} />
    </section>
  );
}
