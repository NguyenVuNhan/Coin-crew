import type { ExpenseView, TripView } from '@cc/core';
import { computeSportShares } from '@cc/core';
import { nameOf } from '@cc/web-util/tripText';

export interface SportBillRow {
  participantId: string;
  name: string;
  rosterGender: 'M' | 'F' | null;
  maleSlots: number;
  femaleSlots: number;
  fixedAmount: number | null;
  amount: number;
}

export interface SportBillCalc {
  court: number;
  shuttlecocksTotal: number;
  extra: number;
  totalMaleSlots: number;
  totalFemaleSlots: number;
  maleSlotRate: number;
  femaleSlotRate: number;
  participants: SportBillRow[];
}

export function sportBillCalc(view: TripView, expense: ExpenseView): SportBillCalc | null {
  if (!expense?.meta?.sport) return null;
  const sport = expense.meta.sport;
  const court = sport.court ?? 0;
  const shuttlecocksTotal =
    sport.shuttlecocks?.reduce((acc, s) => acc + (s.qty || 0) * (s.unitPrice || 0), 0) ?? 0;
  const extra = sport.extra ?? 0;

  const place = new Map(view.people.map((p, i) => [p.id, i]));
  const shares = [...expense.shares].sort(
    (a, b) => (place.get(a.participantId) ?? view.people.length) - (place.get(b.participantId) ?? view.people.length),
  );

  const participants: SportBillRow[] = shares.map((s) => {
    const person = view.people.find((p) => p.id === s.participantId);
    const rosterGender = person?.gender ?? null;
    const entry = sport.entries?.find((en) => en.participantId === s.participantId);
    const maleSlots = entry ? entry.maleSlots : rosterGender === 'F' ? 0 : 1;
    const femaleSlots = entry ? entry.femaleSlots : rosterGender === 'F' ? 1 : 0;
    const fixedAmount = entry?.fixedAmount ?? null;
    return {
      participantId: s.participantId,
      name: nameOf(view, s.participantId),
      rosterGender,
      maleSlots,
      femaleSlots,
      fixedAmount,
      amount: s.amount,
    };
  });

  const rule = sport.rule ?? { kind: 'equal' };
  const calc = computeSportShares(
    expense.amount,
    rule,
    participants.map((p) => ({
      participantId: p.participantId,
      maleSlots: p.maleSlots,
      femaleSlots: p.femaleSlots,
      fixedAmount: p.fixedAmount,
    })),
  );

  const totalMaleSlots = calc.ok
    ? calc.totalMaleSlots
    : sport.entries?.reduce((acc, x) => acc + (x.fixedAmount ? 0 : x.maleSlots), 0) ?? 0;
  const totalFemaleSlots = calc.ok
    ? calc.totalFemaleSlots
    : sport.entries?.reduce((acc, x) => acc + (x.fixedAmount ? 0 : x.femaleSlots), 0) ?? 0;
  const maleSlotRate = calc.ok ? calc.maleSlotRate : (sport.maleSlotRate ?? 0);
  const femaleSlotRate = calc.ok ? calc.femaleSlotRate : (sport.femaleSlotRate ?? 0);

  return {
    court,
    shuttlecocksTotal,
    extra,
    totalMaleSlots,
    totalFemaleSlots,
    maleSlotRate,
    femaleSlotRate,
    participants,
  };
}
