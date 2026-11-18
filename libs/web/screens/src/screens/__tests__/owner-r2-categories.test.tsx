import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
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

const coffeeSub: CategoryView = {
  id: 'cat-coffee',
  type: 'expense',
  name: 'Cà phê',
  icon: 'coffee',
  parentId: 'cat-food',
  sortOrder: 1,
  hidden: false,
};

describe('owner review round 2: CategoriesScreen', () => {
  it('renders TabsList with h-auto and matching pill track classes', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': { categories: [foodParent], recentIds: [] },
    });

    renderAt(<CategoriesScreen />, { route: '/personal/categories' });
    act(() => setLang('vi'));
    await screen.findByText('Ăn uống');

    const tabsList = screen.getByRole('tablist');
    expect(tabsList.className).toContain('h-auto');
    expect(tabsList.className).toContain('p-1');
    expect(tabsList.className).toContain('rounded-full');

    const tabs = within(tabsList).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      expect(tab.className).toContain('min-h-11');
      expect(tab.className).toContain('rounded-full');
    }
  });

  it('opens the edit sheet with name prefilled when clicking the visible edit icon and sends PATCH on save', async () => {
    const user = userEvent.setup();
    let categoriesState: CategoryView[] = [foodParent, coffeeSub];

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': () =>
        Response.json({ categories: categoriesState, recentIds: [] }),
      'PATCH /api/me/personal/categories/cat-coffee': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Partial<CategoryView>;
        categoriesState = categoriesState.map((c) =>
          c.id === 'cat-coffee' ? { ...c, ...body } : c,
        );
        return Response.json({ category: categoriesState.find((c) => c.id === 'cat-coffee') });
      },
    });

    renderAt(<CategoriesScreen />, { route: '/personal/categories' });
    act(() => setLang('vi'));
    await screen.findByText('Cà phê');

    // Both parent and sub have visible edit buttons with ≥44px touch target
    const parentEditBtn = screen.getByRole('button', { name: 'Sửa Ăn uống' });
    const subEditBtn = screen.getByRole('button', { name: 'Sửa Cà phê' });
    expect(parentEditBtn.className).toContain('min-h-11');
    expect(subEditBtn.className).toContain('min-h-11');

    await user.click(subEditBtn);
    const nameInput = (await screen.findByTestId('category-name-input')) as HTMLInputElement;
    expect(nameInput.value).toBe('Cà phê');

    await user.clear(nameInput);
    await user.type(nameInput, 'Trà sữa');
    await user.click(screen.getByTestId('category-save-btn'));

    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-coffee',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toMatchObject({ name: 'Trà sữa', icon: 'coffee' });
    });
  });

  it('sends PATCH hidden: true when clicking the hide icon and updates the row button to Hiện', async () => {
    const user = userEvent.setup();
    let categoriesState: CategoryView[] = [foodParent, coffeeSub];

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': () =>
        Response.json({ categories: categoriesState, recentIds: [] }),
      'PATCH /api/me/personal/categories/cat-food': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Partial<CategoryView>;
        categoriesState = categoriesState.map((c) =>
          c.id === 'cat-food' ? { ...c, ...body } : c,
        );
        return Response.json({ category: categoriesState.find((c) => c.id === 'cat-food') });
      },
    });

    renderAt(<CategoriesScreen />, { route: '/personal/categories' });
    act(() => setLang('vi'));
    await screen.findByText('Ăn uống');

    const hideBtn = screen.getByRole('button', { name: 'Ẩn Ăn uống' });
    expect(hideBtn.className).toContain('min-h-11');
    await user.click(hideBtn);

    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-food',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toEqual({ hidden: true });
    });

    const row = screen.getByTestId('category-row-cat-food');
    await waitFor(() => {
      expect(within(row).getByRole('button', { name: 'Hiện Ăn uống' })).toBeInTheDocument();
    });
  });
});
