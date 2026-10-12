import type { LedgerExpense } from '../src/balances';

export const P = ['M', 'A', 'B', 'C'];

const eq = (ids: string[], each: number) => ids.map((participantId) => ({ participantId, amount: each }));

// Mockup trip: Minh, An, Bình, Chi (docs/superpowers/mockups/v1-flow.html)
export const X: LedgerExpense[] = [
  { id: 'E1', payerId: 'M', amount: 3200000, status: 'approved', createdById: 'M', shares: eq(P, 800000) },
  { id: 'E2', payerId: 'A', amount: 860000, status: 'approved', createdById: 'M', shares: eq(P, 215000) },
  { id: 'E3', payerId: 'B', amount: 600000, status: 'approved', createdById: 'M', shares: eq(P, 150000) },
  { id: 'E4', payerId: 'M', amount: 240000, status: 'approved', createdById: 'M', shares: eq(['M', 'A', 'C'], 80000) },
];

export const E5: LedgerExpense = { id: 'E5', payerId: 'C', amount: 180000, status: 'pending', createdById: 'C', shares: eq(P, 45000) };
