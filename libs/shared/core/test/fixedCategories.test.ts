import { describe, it, expect } from 'vitest';
import {
  FIXED_CATEGORIES,
  FIXED_CATEGORY_KEYS,
  GENERAL_CATEGORY_KEY,
  ADOPTED_STARTER_KEYS,
  fixedCategory,
  isFixedExpenseKey,
} from '../src';

describe('fixedCategories', () => {
  it('has 6 expense groups with 36 subs, plus general and lend, and borrow plus 4 income', () => {
    expect(FIXED_CATEGORIES).toHaveLength(49);
    expect(FIXED_CATEGORY_KEYS.size).toBe(49);
    expect(GENERAL_CATEGORY_KEY).toBe('general');

    const expenses = FIXED_CATEGORIES.filter((c) => c.type === 'expense');
    const expenseParentsWithChildren = expenses.filter(
      (c) => c.parentKey === null && expenses.some((child) => child.parentKey === c.key),
    );
    const expenseChildren = expenses.filter((c) => c.parentKey !== null);
    const childlessExpense = expenses.filter(
      (c) => c.parentKey === null && !expenses.some((child) => child.parentKey === c.key),
    );
    const incomes = FIXED_CATEGORIES.filter((c) => c.type === 'income');

    expect(expenseParentsWithChildren).toHaveLength(6);
    expect(expenseChildren).toHaveLength(36);
    expect(childlessExpense.map((c) => c.key)).toEqual(['general', 'lend']);
    expect(incomes).toHaveLength(5);
    expect(incomes.map((c) => c.key)).toEqual(['borrow', 'salary', 'bonus', 'interest', 'other-income']);
  });

  it('keys are unique and every parentKey exists earlier in the list', () => {
    const seen = new Set<string>();
    for (const cat of FIXED_CATEGORIES) {
      expect(seen.has(cat.key)).toBe(false);
      if (cat.parentKey !== null) {
        expect(seen.has(cat.parentKey)).toBe(true);
      }
      seen.add(cat.key);
    }
  });

  it('parents and children share a type', () => {
    for (const cat of FIXED_CATEGORIES) {
      if (cat.parentKey !== null) {
        const parent = fixedCategory(cat.parentKey);
        expect(parent).toBeDefined();
        expect(parent?.type).toBe(cat.type);
      }
    }
  });

  it('assigns sortOrder within siblings', () => {
    const topExpense = FIXED_CATEGORIES.filter((c) => c.parentKey === null && c.type === 'expense');
    expect(topExpense.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const topIncome = FIXED_CATEGORIES.filter((c) => c.parentKey === null && c.type === 'income');
    expect(topIncome.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4]);

    const transportChildren = FIXED_CATEGORIES.filter((c) => c.parentKey === 'transport');
    expect(transportChildren.map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('isFixedExpenseKey checks existence and expense type', () => {
    expect(isFixedExpenseKey('food-dining')).toBe(true);
    expect(isFixedExpenseKey('salary')).toBe(false);
    expect(isFixedExpenseKey('nope')).toBe(false);
  });

  it('ADOPTED_STARTER_KEYS matches the expected set and every key is in FIXED_CATEGORY_KEYS', () => {
    const expected = ['food', 'transport', 'bills', 'lend', 'borrow', 'salary', 'interest', 'other-income'];
    expect(ADOPTED_STARTER_KEYS).toEqual(new Set(expected));
    for (const key of ADOPTED_STARTER_KEYS) {
      expect(FIXED_CATEGORY_KEYS.has(key)).toBe(true);
    }
  });
});
