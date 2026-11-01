import type { ExpenseView, PersonView } from '@fsl/core';

export interface RecentGroup {
  expenseId: string;
  description: string;
  spentOn: string;
  people: string[];
}

/** Offers the groups of people on the latest expenses as one-tap choices. */
export function recentGroups(
  expenses: readonly ExpenseView[],
  offered: readonly PersonView[],
  current: ReadonlySet<string>,
  editingId: string | undefined,
  max = 3,
): RecentGroup[] {
  if (max <= 0) return [];
  const groups: RecentGroup[] = [];

  for (const e of expenses) {
    if (e.status !== 'approved' && e.status !== 'pending') continue;
    if (editingId !== undefined && e.id === editingId) continue;

    const participantIds = new Set(e.shares.map((s) => s.participantId));
    const people = offered.filter((p) => participantIds.has(p.id)).map((p) => p.id);

    if (people.length === 0) continue;
    if (people.length === offered.length) continue;
    if (people.length === current.size && people.every((id) => current.has(id))) continue;

    const personSet = new Set(people);
    if (groups.some((g) => g.people.length === people.length && g.people.every((id) => personSet.has(id)))) {
      continue;
    }

    groups.push({
      expenseId: e.id,
      description: e.description,
      spentOn: e.spentOn,
      people,
    });

    if (groups.length >= max) break;
  }

  return groups;
}
