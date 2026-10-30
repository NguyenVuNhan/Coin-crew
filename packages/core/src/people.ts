import type { Transfer } from './transfers';

export type PersonKey = `u:${string}` | `p:${string}`; // user id, or personal-ledger / unlinked guest participant id

export interface TripPairInput {
  tripId: string;
  tripName: string;
  kind: 'group' | 'direct';
  ownerPid: string;
  otherPid: string;
  suggestions: Transfer[];
  oldestOpenAt: string;
  writable: boolean;
}

export interface PersonItem {
  tripId: string;
  tripName: string;
  kind: 'group' | 'direct';
  amount: number;
  oldestOpenAt: string;
} // amount > 0: they owe owner

export function pairItems(inputs: TripPairInput[]): PersonItem[] {
  const items: PersonItem[] = [];

  for (const input of inputs) {
    let amount = 0;
    for (const s of input.suggestions) {
      if (s.fromId === input.otherPid && s.toId === input.ownerPid) {
        amount += s.amount;
      } else if (s.fromId === input.ownerPid && s.toId === input.otherPid) {
        amount -= s.amount;
      }
    }

    if (amount !== 0) {
      items.push({
        tripId: input.tripId,
        tripName: input.tripName,
        kind: input.kind,
        amount,
        oldestOpenAt: input.oldestOpenAt,
      });
    }
  }

  items.sort((a, b) => a.oldestOpenAt.localeCompare(b.oldestOpenAt));
  return items;
}

export interface SettlementPart {
  tripId: string;
  fromOwner: boolean;
  amount: number;
}

export function spreadSettlement(
  items: (PersonItem & { writable: boolean })[],
  paid: number,
  direction: 'toOwner' | 'fromOwner',
  directTripId: string,
): SettlementPart[] {
  const isToOwner = direction === 'toOwner';
  const targetFromOwner = !isToOwner;
  const counterFromOwner = isToOwner;

  const counterItems = items.filter((item) =>
    isToOwner ? item.amount < 0 : item.amount > 0,
  );
  const targetItems = items
    .filter((item) => (isToOwner ? item.amount > 0 : item.amount < 0))
    .slice()
    .sort((a, b) => a.oldestOpenAt.localeCompare(b.oldestOpenAt));

  const counterTotal = counterItems.reduce(
    (sum, item) => sum + Math.abs(item.amount),
    0,
  );
  let remainingBudget = paid + counterTotal;

  const parts: SettlementPart[] = [];

  // Walk positive/target items oldest-first assigning min(remaining, amount)
  for (const item of targetItems) {
    const itemAmt = Math.abs(item.amount);
    const assigned = Math.min(remainingBudget, itemAmt);
    if (assigned > 0) {
      const tripId = item.writable ? item.tripId : directTripId;
      parts.push({
        tripId,
        fromOwner: targetFromOwner,
        amount: assigned,
      });
      remainingBudget -= assigned;
    }
  }

  // Leftover budget -> part on directTripId
  if (remainingBudget > 0) {
    parts.push({
      tripId: directTripId,
      fromOwner: targetFromOwner,
      amount: remainingBudget,
    });
    remainingBudget = 0;
  }

  // Settle every negative/counter item fully (part fromOwner:true)
  for (const item of counterItems) {
    const itemAmt = Math.abs(item.amount);
    if (itemAmt > 0) {
      const tripId = item.writable ? item.tripId : directTripId;
      parts.push({
        tripId,
        fromOwner: counterFromOwner,
        amount: itemAmt,
      });
    }
  }

  // Merge parts with the same (tripId, fromOwner)
  const merged: SettlementPart[] = [];
  const map = new Map<string, SettlementPart>();

  for (const p of parts) {
    const key = `${p.tripId}:${p.fromOwner}`;
    const existing = map.get(key);
    if (existing) {
      existing.amount += p.amount;
    } else {
      const entry: SettlementPart = { ...p };
      map.set(key, entry);
      merged.push(entry);
    }
  }

  return merged;
}
