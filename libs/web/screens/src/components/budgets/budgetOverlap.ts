import type { BudgetDef, BudgetProgress, orderBudgets } from '@cc/core';

/** Maps each budgetId in grouped progress results to its BudgetProgress. */
export function progressById(
  groups: ReturnType<typeof orderBudgets>,
): Map<string, BudgetProgress> {
  const map = new Map<string, BudgetProgress>();
  for (const item of [...groups.over, ...groups.fast, ...groups.onPace, ...groups.ended]) {
    map.set(item.budgetId, item);
  }
  return map;
}

/**
 * Finds the nearest ancestor category (walking `parentId` up) that has its own
 * category budget in the same currency as `def`. Tag budgets never overlap.
 */
export function findParentBudget(
  def: BudgetDef,
  defs: BudgetDef[],
  parentById: Map<string, string | null>,
): BudgetDef | null {
  if (def.target.kind !== 'category') return null;

  const byCategoryId = new Map<string, BudgetDef>();
  for (const candidate of defs) {
    if (
      candidate.id !== def.id &&
      candidate.target.kind === 'category' &&
      candidate.currency === def.currency &&
      !byCategoryId.has(candidate.target.categoryId)
    ) {
      byCategoryId.set(candidate.target.categoryId, candidate);
    }
  }

  const visited = new Set<string>([def.target.categoryId]);
  let currentId: string | null = parentById.get(def.target.categoryId) ?? null;

  while (currentId !== null) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const match = byCategoryId.get(currentId);
    if (match) return match;

    currentId = parentById.get(currentId) ?? null;
  }

  return null;
}

/**
 * Finds category budgets in the same currency whose nearest budgeted ancestor is `def`.
 * Tag budgets never overlap.
 */
export function findChildBudgets(
  def: BudgetDef,
  defs: BudgetDef[],
  parentById: Map<string, string | null>,
): BudgetDef[] {
  if (def.target.kind !== 'category') return [];

  const children: BudgetDef[] = [];
  for (const candidate of defs) {
    if (
      candidate.id === def.id ||
      candidate.target.kind !== 'category' ||
      candidate.currency !== def.currency
    ) {
      continue;
    }
    const parent = findParentBudget(candidate, defs, parentById);
    if (parent?.id === def.id) {
      children.push(candidate);
    }
  }
  return children;
}
