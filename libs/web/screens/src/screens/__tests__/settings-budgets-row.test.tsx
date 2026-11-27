import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BudgetDef } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { PersonalSettingsMenu } from '../../components/PersonalSettingsMenu';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('en');
});

const twoBudgets: BudgetDef[] = [
  {
    id: 'b-1',
    name: 'Ăn uống',
    target: { kind: 'category', categoryId: 'cat-food' },
    currency: 'VND',
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-01-01',
  },
  {
    id: 'b-2',
    name: 'Cà phê',
    target: { kind: 'category', categoryId: 'cat-coffee' },
    currency: 'VND',
    periodKind: 'month',
    monthStartDay: 1,
    from: null,
    to: null,
    excludedWalletIds: [],
    limits: [{ effectiveFrom: '2026-01-01', amount: 500_000 }],
    suggestionDismissedUntil: null,
    createdOn: '2026-01-01',
  },
];

describe('PersonalSettingsMenu Ngân sách row', () => {
  it('shows the Ngân sách row with count when budgets exist and navigates to /budgets', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/group-settings': {
        settings: { defaultGroupCategoryId: null, countLoans: false },
      },
      'GET /api/me/personal/categories': { categories: [] },
      'GET /api/me/personal/budgets': { budgets: twoBudgets },
    });

    renderAt(<PersonalSettingsMenu />, { route: '/trips' });
    setLang('vi', false);

    await user.click(screen.getByTestId('personal-settings-btn'));

    const budgetsRow = await screen.findByTestId('personal-settings-budgets');
    expect(budgetsRow).toHaveTextContent('Ngân sách');
    expect(await screen.findByTestId('personal-settings-budgets-count')).toHaveTextContent('2');

    await user.click(budgetsRow);
    expect(screen.getByTestId('location')).toHaveTextContent('/budgets');
  });

  it('omits the count when no budgets exist', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/group-settings': {
        settings: { defaultGroupCategoryId: null, countLoans: false },
      },
      'GET /api/me/personal/categories': { categories: [] },
      'GET /api/me/personal/budgets': { budgets: [] },
    });

    renderAt(<PersonalSettingsMenu />, { route: '/trips' });

    await user.click(screen.getByTestId('personal-settings-btn'));

    const budgetsRow = await screen.findByTestId('personal-settings-budgets');
    expect(budgetsRow).toHaveTextContent('Budgets');
    expect(screen.queryByTestId('personal-settings-budgets-count')).not.toBeInTheDocument();
  });
});
