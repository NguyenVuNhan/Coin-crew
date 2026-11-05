import type { TripView } from '@cc/core';

/** I'm a person in this group and have no bank details (pending or approved → false). */
export function needsBankFirst(view: TripView): boolean {
  if (!view.me.participantId) return false;
  const me = view.people.find((p) => p.id === view.me.participantId);
  return Boolean(me && me.bank === 'none');
}

/** "Share anyway" was chosen for this group on this phone. localStorage key `cc.bankFirst.skip.<tripId>`; every read/write in try/catch (no storage → false / no-op). */
export function bankFirstSkipped(tripId: string): boolean {
  try {
    return Boolean(localStorage.getItem(`cc.bankFirst.skip.${tripId}`));
  } catch {
    return false;
  }
}

export function skipBankFirst(tripId: string): void {
  try {
    localStorage.setItem(`cc.bankFirst.skip.${tripId}`, '1');
  } catch {
    // blocked storage -> no-op
  }
}

/** Members (signed in) go to `/me/bank`; guests to `href('/bank')`. */
export function bankDetailsHref(view: TripView, href: (path?: string) => string): string {
  if (view.me.kind === 'member') {
    return '/me/bank';
  }
  return href('/bank');
}
