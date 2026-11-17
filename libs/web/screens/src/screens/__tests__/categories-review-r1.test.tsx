import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { CategoriesScreen } from '../CategoriesScreen';

beforeEach(() => {
  localStorage.clear();
  setLang('vi');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const foodParent: CategoryView = {
  id: 'cat-food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const salaryParent: CategoryView = {
  id: 'cat-salary',
  type: 'income',
  name: 'Lương',
  icon: 'wallet',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

describe('Review Round 1 — CategoriesScreen icon & parent pickers (R8)', () => {
  it('filters the icon sheet by Vietnamese keyword and icon name, and selects an icon', async () => {
    const user = userEvent.setup();
    let createdBody: unknown = null;

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': { categories: [foodParent, salaryParent], recentIds: [] },
      'POST /api/me/personal/categories': (init?: RequestInit) => {
        createdBody = JSON.parse(String(init?.body ?? '{}'));
        return Response.json({ id: 'cat-new' }, { status: 201 });
      },
    });

    renderAt(<CategoriesScreen />, { route: '/categories' });
    await screen.findByText('Ăn uống');

    await user.click(screen.getByTestId('category-add-btn'));
    await screen.findByTestId('category-name-input');
    await user.type(screen.getByTestId('category-name-input'), 'Cà phê sáng');

    // Open icon sheet
    await user.click(screen.getByTestId('category-icon-trigger'));
    const searchInput = await screen.findByTestId('category-icon-search');
    await user.type(searchInput, 'cà phê');

    const grid = screen.getByTestId('category-icon-grid');
    expect(within(grid).getByTestId('category-icon-option-coffee')).toBeInTheDocument();
    expect(within(grid).queryByTestId('category-icon-option-car')).toBeNull();

    await user.click(within(grid).getByTestId('category-icon-option-coffee'));
    await waitFor(() => expect(screen.queryByTestId('category-icon-search')).toBeNull());
    expect(screen.getByTestId('category-icon-trigger')).toHaveTextContent('coffee');

    await user.click(screen.getByTestId('category-save-btn'));
    await waitFor(() => expect(createdBody).not.toBeNull());
    expect(createdBody).toMatchObject({
      type: 'expense',
      name: 'Cà phê sáng',
      icon: 'coffee',
      parentId: null,
    });
  });

  it('opens the parent picker sheet with icons and top-level categories of the same type', async () => {
    const user = userEvent.setup();
    let createdBody: unknown = null;

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': { categories: [foodParent, salaryParent], recentIds: [] },
      'POST /api/me/personal/categories': (init?: RequestInit) => {
        createdBody = JSON.parse(String(init?.body ?? '{}'));
        return Response.json({ id: 'cat-sub' }, { status: 201 });
      },
    });

    renderAt(<CategoriesScreen />, { route: '/categories' });
    await screen.findByText('Ăn uống');

    await user.click(screen.getByTestId('category-add-btn'));
    await user.type(await screen.findByTestId('category-name-input'), 'Ăn trưa');

    await user.click(screen.getByTestId('category-parent-trigger'));
    const parentList = await screen.findByTestId('category-parent-list');
    expect(within(parentList).getByTestId('category-parent-option-none')).toHaveTextContent(
      'None (top-level)',
    );
    const foodOption = within(parentList).getByTestId('category-parent-option-cat-food');
    expect(foodOption).toHaveTextContent('Ăn uống');
    expect(foodOption.querySelector('svg')).not.toBeNull();
    // Income parent is not listed under expense
    expect(within(parentList).queryByTestId('category-parent-option-cat-salary')).toBeNull();

    await user.click(foodOption);
    await waitFor(() => expect(screen.queryByTestId('category-parent-list')).toBeNull());
    expect(screen.getByTestId('category-parent-trigger')).toHaveTextContent('Ăn uống');

    await user.click(screen.getByTestId('category-save-btn'));
    await waitFor(() => expect(createdBody).not.toBeNull());
    expect(createdBody).toMatchObject({
      type: 'expense',
      name: 'Ăn trưa',
      parentId: 'cat-food',
    });
  });
});
