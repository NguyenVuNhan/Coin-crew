import type { ExpenseView, PaidBy, PaymentView, SlotTile } from './api-types';
import type { Gender } from './split';
export { canRevisePayment } from './permissions';

export function expenseShareOf(e: ExpenseView, participantId: string): number {
  return e.shares.find((s) => s.participantId === participantId)?.amount ?? 0;
}

export function rowSlots(e: ExpenseView, participantId: string): number {
  if (expenseShareOf(e, participantId) <= 0) return 0;
  const sport = e.meta?.sport;
  if (!sport) return 1;
  const entry = sport.entries.find((x) => x.participantId === participantId);
  if (!entry) return 0;
  if (entry.fixedAmount !== undefined && entry.fixedAmount !== null) return 1;
  return entry.maleSlots + entry.femaleSlots;
}

export function slotTiles(
  e: ExpenseView,
  participantId: string,
  gender: Gender | null | undefined,
  remaining: number,
): SlotTile[] {
  if (remaining <= 0) return [];
  const sport = e.meta?.sport;
  if (!sport) return [];
  const entry = sport.entries.find((x) => x.participantId === participantId);
  if (!entry || (entry.fixedAmount !== undefined && entry.fixedAmount !== null)) return [];

  let f = entry.femaleSlots;
  let m = entry.maleSlots;
  if (f + m < 2) return [];

  if (gender === 'M') {
    if (m > 0) m -= 1;
    else if (f > 0) f -= 1;
  } else {
    if (f > 0) f -= 1;
    else if (m > 0) m -= 1;
  }

  const tiles: SlotTile[] = [];
  if (f > 0) {
    const amount = Math.min(sport.femaleSlotRate, remaining);
    if (amount > 0) tiles.push({ gender: 'F', amount });
  }
  if (m > 0) {
    const amount = Math.min(sport.maleSlotRate, remaining);
    if (amount > 0) tiles.push({ gender: 'M', amount });
  }
  return tiles;
}

export function linkedPaid(payments: PaymentView[], expenseRootId: string, fromId: string): number {
  let sum = 0;
  for (const p of payments) {
    if (p.expenseId !== expenseRootId || p.fromId !== fromId) continue;
    if (p.notArrived) continue;
    if (p.status !== 'says_paid' && p.status !== 'confirmed') continue;
    sum += p.amountConfirmed ?? p.amountClaimed;
  }
  return sum;
}

export function expenseRemaining(share: number, paid: number, pairOwed: number): number {
  return Math.max(0, Math.min(share - paid, pairOwed));
}

export function payerLabel(a: {
  paidBy: PaidBy;
  fromIsMember: boolean;
  slots: number;
}): 'name' | 'friend' | 'name_or_friend' {
  if (a.paidBy === 'friend') return 'friend';
  if (!a.fromIsMember && a.slots >= 2) return 'name_or_friend';
  return 'name';
}
