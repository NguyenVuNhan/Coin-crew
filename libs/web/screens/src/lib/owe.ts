import type { PaymentView, Transfer, TripView } from '@cc/core';

/** What the viewer still has to pay, one transfer per person, in the order the group view suggests them. */
export function owedTransfers(view: TripView): Transfer[] {
  const me = view.me.participantId;
  if (me === null) return [];
  return view.suggestions.filter((s) => s.fromId === me);
}

/** The viewer's payments that are marked paid and wait for the receiver to confirm. */
export function waitingPayments(view: TripView): PaymentView[] {
  const me = view.me.participantId;
  if (me === null) return [];
  return view.payments.filter((p) => p.fromId === me && p.status === 'says_paid');
}
