import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import type { CategoryView, GroupRow, GroupSettingsView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { ExpenseRow } from '../ExpenseRow';
import { ExpenseDetails } from '../ExpenseDetails';
import { GroupTxRow } from '../GroupTxRow';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Group danh mục and Nội dung display', () => {
  it('expense row shows food-dining icon', () => {
    const view = tripView();
    const base = view.expenses[0]!;
    const withCategory = { ...base, categoryKey: 'food-dining' };
    const withoutCategory = { ...base, categoryKey: null };

    const { container, rerender } = renderAt(
      <ExpenseRow expense={withCategory} view={view} />,
    );
    expect(container.querySelector('.lucide-utensils-crossed')).not.toBeNull();
    expect(container.querySelector('.lucide-receipt')).toBeNull();

    rerender(<ExpenseRow expense={withoutCategory} view={view} />);
    expect(container.querySelector('.lucide-utensils-crossed')).toBeNull();
    expect(container.querySelector('.lucide-receipt')).not.toBeNull();
  });

  it('expense details shows Nội dung only when set', () => {
    mockApi({});
    const base = tripView();
    const withNote = {
      ...base,
      expenses: base.expenses.map((e, i) =>
        i === 0 ? { ...e, note: 'Quán quen gần hồ' } : e,
      ),
    };
    const withoutNote = {
      ...base,
      expenses: base.expenses.map((e, i) =>
        i === 0 ? { ...e, note: null } : e,
      ),
    };

    renderAt(
      <ExpenseDetails view={withNote} expenseId={withNote.expenses[0]!.id} onClose={() => {}} />,
    );
    const noteEl = screen.getByTestId('expense-note');
    expect(noteEl).toHaveTextContent('Quán quen gần hồ');
    expect(noteEl).toHaveClass('text-sm', 'text-muted-foreground');

    cleanup();
    renderAt(
      <ExpenseDetails view={withoutNote} expenseId={withoutNote.expenses[0]!.id} onClose={() => {}} />,
    );
    expect(screen.queryByTestId('expense-note')).toBeNull();
  });

  it('Sổ chi tiêu group row uses group danh mục when no override', () => {
    const categories: CategoryView[] = [
      {
        id: 'cat-food-dining',
        parentId: 'cat-food',
        type: 'expense',
        name: 'Ăn ngoài',
        icon: 'utensils-crossed',
        hidden: false,
        sortOrder: 0,
      },
    ];
    const settings: GroupSettingsView = {
      defaultGroupCategoryId: null,
      countLoans: false,
    };
    const row: GroupRow = {
      kind: 'group',
      activityAt: '2026-11-01T00:00:00.000Z',
      id: 'g-1',
      rootId: 'r-1',
      tripId: 't-1',
      tripName: 'Đà Lạt',
      isDirect: false,
      source: 'expense',
      date: '2026-11-15',
      title: 'Lẩu gà lá é',
      total: 300000,
      myShare: 100000,
      iPaid: false,
      payerName: 'Hùng',
      counterpartName: null,
      people: ['Hùng', 'Bạn', 'Lan'],
      pending: false,
      link: null,
      groupCategoryId: 'cat-food-dining',
      createdAt: '2026-11-15T12:00:00Z',
    };

    const { container } = renderAt(
      <GroupTxRow row={row} categories={categories} settings={settings} />,
    );
    expect(container.querySelector('.lucide-utensils-crossed')).not.toBeNull();
    expect(container.querySelector('.lucide-users')).toBeNull();
  });
});
