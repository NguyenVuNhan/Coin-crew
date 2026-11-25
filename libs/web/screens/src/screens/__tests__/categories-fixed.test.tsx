import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { CategoriesScreen } from '../CategoriesScreen';

function renderVi() {
  const result = renderAt(<CategoriesScreen />, { route: '/personal/categories' });
  act(() => setLang('vi'));
  return result;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function sampleCategories(): CategoryView[] {
  return [
    {
      id: 'cat-fixed-food',
      parentId: null,
      type: 'expense',
      name: 'Ăn uống',
      icon: 'utensils',
      hidden: false,
      sortOrder: 0,
      systemKey: 'food',
    },
    {
      id: 'cat-fixed-move',
      parentId: null,
      type: 'expense',
      name: 'Di chuyển',
      icon: 'car',
      hidden: false,
      sortOrder: 1,
      systemKey: 'transport',
    },
    {
      id: 'cat-custom-coffee',
      parentId: null,
      type: 'expense',
      name: 'Cà phê',
      icon: 'coffee',
      hidden: false,
      sortOrder: 2,
      systemKey: null,
    },
    {
      id: 'cat-fixed-salary',
      parentId: null,
      type: 'income',
      name: 'Lương',
      icon: 'wallet',
      hidden: false,
      sortOrder: 0,
      systemKey: 'salary',
    },
  ];
}

describe('CategoriesScreen fixed, hidden & merge', () => {
  it('fixed row has no delete or rename', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': { categories: sampleCategories(), recentIds: [] },
    });

    renderVi();

    const fixedRow = await screen.findByTestId('category-row-cat-fixed-food');
    expect(within(fixedRow).getByLabelText('Có sẵn')).toBeInTheDocument();
    expect(within(fixedRow).getByTestId('category-hide-cat-fixed-food')).toBeInTheDocument();

    expect(within(fixedRow).queryByTestId('category-edit-cat-fixed-food')).not.toBeInTheDocument();
    expect(within(fixedRow).queryByTestId('category-merge-cat-fixed-food')).not.toBeInTheDocument();
    expect(within(fixedRow).queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument();
    expect(within(fixedRow).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
  });

  it('own categories hide with the same switch and also move to Đã ẩn', async () => {
    const user = userEvent.setup();
    let cats = sampleCategories();

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'PATCH /api/me/personal/categories/cat-custom-coffee': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { hidden?: boolean };
        cats = cats.map((c) =>
          c.id === 'cat-custom-coffee' ? { ...c, hidden: body.hidden ?? c.hidden } : c,
        );
        return Response.json({ category: cats.find((c) => c.id === 'cat-custom-coffee') });
      },
    });

    renderVi();

    const customRow = await screen.findByTestId('category-row-cat-custom-coffee');
    expect(within(customRow).getByTestId('category-merge-cat-custom-coffee')).toBeInTheDocument();
    expect(within(customRow).getByTestId('category-edit-cat-custom-coffee')).toBeInTheDocument();
    expect(within(customRow).queryByTestId('category-toggle-hidden-cat-custom-coffee')).toBeNull();

    await user.click(within(customRow).getByTestId('category-hide-cat-custom-coffee'));

    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-custom-coffee',
      );
      expect(patchCall?.body).toEqual({ hidden: true });
    });
    const hiddenSection = await screen.findByTestId('categories-hidden-section');
    expect(within(hiddenSection).getByTestId('category-row-cat-custom-coffee')).toBeInTheDocument();
    expect(within(hiddenSection).getByTestId('category-hide-cat-custom-coffee')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('hide switch moves it to Đã ẩn', async () => {
    const user = userEvent.setup();
    let cats = sampleCategories();

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'PATCH /api/me/personal/categories/cat-fixed-food': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { hidden?: boolean };
        cats = cats.map((c) =>
          c.id === 'cat-fixed-food' ? { ...c, hidden: body.hidden ?? c.hidden } : c,
        );
        return Response.json({ category: cats.find((c) => c.id === 'cat-fixed-food') });
      },
    });

    renderVi();

    const hideSwitch = await screen.findByTestId('category-hide-cat-fixed-food');
    expect(hideSwitch).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('categories-hidden-section')).not.toBeInTheDocument();

    await user.click(hideSwitch);

    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-fixed-food',
      );
      expect(patchCall?.body).toEqual({ hidden: true });
    });

    const hiddenSection = await screen.findByTestId('categories-hidden-section');
    expect(within(hiddenSection).getByText('Đã ẩn')).toBeInTheDocument();
    expect(within(hiddenSection).getByTestId('category-row-cat-fixed-food')).toBeInTheDocument();
    expect(within(hiddenSection).getByTestId('category-hide-cat-fixed-food')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('merge sends DELETE ?moveTo=<fixed id> after confirm', async () => {
    const user = userEvent.setup();
    let cats = sampleCategories();

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'DELETE /api/me/personal/categories/cat-custom-coffee': (
        _init: RequestInit | undefined,
        urlStr: string,
      ) => {
        const moveTo = new URL(urlStr, 'http://x').searchParams.get('moveTo');
        expect(moveTo).toBe('cat-fixed-food');
        cats = cats.filter((c) => c.id !== 'cat-custom-coffee');
        return Response.json({ ok: true });
      },
    });

    renderVi();

    const mergeBtn = await screen.findByTestId('category-merge-cat-custom-coffee');
    expect(mergeBtn).toHaveAttribute('aria-label', 'Gộp vào…');
    await user.click(mergeBtn);

    const targetList = await screen.findByTestId('merge-target-list');
    await user.click(within(targetList).getByTestId('merge-target-cat-fixed-food'));

    expect(
      await screen.findByText('Gộp “Cà phê” vào “Ăn uống”? Các giao dịch sẽ chuyển sang “Ăn uống”.'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('category-merge-confirm'));

    await waitFor(() => {
      const delCall = calls.find(
        (c) =>
          c.method === 'DELETE' && c.path === '/api/me/personal/categories/cat-custom-coffee',
      );
      expect(delCall).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('category-row-cat-custom-coffee')).not.toBeInTheDocument();
    });
  });

  it('merge targets are only fixed categories of the same type', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': { categories: sampleCategories(), recentIds: [] },
    });

    renderVi();

    const mergeBtn = await screen.findByTestId('category-merge-cat-custom-coffee');
    await user.click(mergeBtn);

    const targetList = await screen.findByTestId('merge-target-list');
    expect(within(targetList).getByText('Ăn uống')).toBeInTheDocument();
    expect(within(targetList).getByText('Di chuyển')).toBeInTheDocument();
    expect(within(targetList).queryByText('Cà phê')).not.toBeInTheDocument();
    expect(within(targetList).queryByText('Lương')).not.toBeInTheDocument();
  });
});
