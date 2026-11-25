import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, WalletDetailView } from '@cc/core';
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

const cashWallet: WalletDetailView = {
  id: 'w-cash',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const binanceWallet: WalletDetailView = {
  id: 'w-bin',
  name: 'Binance',
  currency: 'USDT',
  balance: 500,
  isDefault: false,
  kind: 'investment',
  startAmount: 500,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: null,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

function baseCategories(): CategoryView[] {
  return [
    {
      id: 'cat-food',
      parentId: null,
      type: 'expense',
      name: 'Ăn uống',
      icon: 'utensils',
      hidden: false,
      sortOrder: 0,
      starterKey: 'food',
    },
    {
      id: 'cat-shopping',
      parentId: null,
      type: 'expense',
      name: 'Mua sắm',
      icon: 'shopping-bag',
      hidden: true,
      sortOrder: 1,
      starterKey: 'shopping',
    },
    {
      id: 'cat-fees',
      parentId: null,
      type: 'expense',
      name: 'Phí & lệ phí',
      icon: 'receipt',
      hidden: false,
      sortOrder: 2,
      starterKey: 'fees',
    },
    {
      id: 'cat-tax',
      parentId: 'cat-fees',
      type: 'expense',
      name: 'Thuế',
      icon: 'landmark',
      hidden: false,
      sortOrder: 0,
      starterKey: 'tax',
    },
    {
      id: 'cat-fee',
      parentId: 'cat-fees',
      type: 'expense',
      name: 'Phí',
      icon: 'badge-percent',
      hidden: false,
      sortOrder: 1,
      starterKey: 'fee',
    },
    {
      id: 'cat-salary',
      parentId: null,
      type: 'income',
      name: 'Lương',
      icon: 'wallet',
      hidden: false,
      sortOrder: 0,
      starterKey: 'salary',
    },
  ];
}

describe('CategoriesScreen parent remap & delete-parent flows', () => {
  it('moves a sub-category to another parent, shows visibility-shift preview for investment wallet, and shows snackbar toast', async () => {
    const user = userEvent.setup();
    let cats = baseCategories();

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [cashWallet, binanceWallet] },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'PATCH /api/me/personal/categories/cat-tax': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          name?: string;
          icon?: string;
          parentId?: string | null;
        };
        cats = cats.map((c) =>
          c.id === 'cat-tax'
            ? {
                ...c,
                name: body.name ?? c.name,
                icon: body.icon ?? c.icon,
                parentId: body.parentId !== undefined ? body.parentId : c.parentId,
                sortOrder: 5,
              }
            : c,
        );
        return Response.json({ category: cats.find((c) => c.id === 'cat-tax') });
      },
    });

    renderVi();
    await screen.findByText('Thuế');

    await user.click(screen.getByTestId('category-edit-cat-tax'));
    const parentTrigger = await screen.findByTestId('category-parent-trigger');
    expect(parentTrigger).toHaveTextContent('Phí & lệ phí');

    // No shift note before changing parent
    expect(screen.queryByTestId('category-parent-visibility-note')).toBeNull();

    await user.click(parentTrigger);
    const parentList = await screen.findByTestId('category-parent-list');
    // Hidden top-level parent still appears with a neutral Hidden badge
    const hiddenOption = within(parentList).getByTestId('category-parent-option-cat-shopping');
    expect(hiddenOption).toHaveTextContent('Mua sắm');
    expect(hiddenOption).toHaveTextContent('Đã ẩn');
    // Income category does not appear
    expect(within(parentList).queryByTestId('category-parent-option-cat-salary')).toBeNull();

    await user.click(within(parentList).getByTestId('category-parent-option-cat-food'));
    await waitFor(() => expect(screen.queryByTestId('category-parent-list')).toBeNull());

    // Moving out of `Phí & lệ phí` flips default on Binance (investment)
    const note = await screen.findByTestId('category-parent-visibility-note');
    expect(note).toHaveTextContent('ẩn ở Binance');

    await user.click(screen.getByTestId('category-save-btn'));
    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-tax',
      );
      expect(patchCall?.body).toMatchObject({ name: 'Thuế', icon: 'landmark', parentId: 'cat-food' });
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Đã chuyển “Thuế” sang “Ăn uống”');
  });

  it('omits visibility-shift preview when explicit override already fixes wallet visibility, and promotes sub-category to top-level', async () => {
    const user = userEvent.setup();
    let cats = baseCategories().map((c) =>
      c.id === 'cat-tax'
        ? { ...c, walletOverrides: [{ walletId: binanceWallet.id, visible: false }] }
        : c,
    );

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [cashWallet, binanceWallet] },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'PATCH /api/me/personal/categories/cat-tax': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { parentId?: string | null };
        cats = cats.map((c) =>
          c.id === 'cat-tax' ? { ...c, parentId: body.parentId ?? null } : c,
        );
        return Response.json({ category: cats.find((c) => c.id === 'cat-tax') });
      },
    });

    renderVi();
    await screen.findByText('Thuế');

    await user.click(screen.getByTestId('category-edit-cat-tax'));
    await user.click(await screen.findByTestId('category-parent-trigger'));
    await user.click(await screen.findByTestId('category-parent-option-none'));

    // Explicit override keeps Binance hidden either way -> no shift note
    expect(screen.queryByTestId('category-parent-visibility-note')).toBeNull();

    await user.click(screen.getByTestId('category-save-btn'));
    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-tax',
      );
      expect(patchCall?.body).toMatchObject({ parentId: null });
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Đã đưa “Thuế” lên làm danh mục chính');
    await waitFor(() => {
      expect(screen.getByTestId('category-row-cat-tax')).not.toHaveClass('pl-10');
    });
  });

  it('nests a childless top-level category excluding self, and locks parent field on parents with children', async () => {
    const user = userEvent.setup();
    let cats = baseCategories();

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [cashWallet] },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'PATCH /api/me/personal/categories/cat-food': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          name?: string;
          icon?: string;
          parentId?: string | null;
        };
        cats = cats.map((c) =>
          c.id === 'cat-food'
            ? {
                ...c,
                name: body.name ?? c.name,
                parentId: body.parentId !== undefined ? body.parentId : c.parentId,
              }
            : c,
        );
        return Response.json({ category: cats.find((c) => c.id === 'cat-food') });
      },
      'PATCH /api/me/personal/categories/cat-fees': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { name?: string };
        cats = cats.map((c) => (c.id === 'cat-fees' ? { ...c, name: body.name ?? c.name } : c));
        return Response.json({ category: cats.find((c) => c.id === 'cat-fees') });
      },
    });

    renderVi();
    await screen.findByText('Phí & lệ phí');

    // 1. Parent with 2 children has locked parent field
    await user.click(screen.getByTestId('category-edit-cat-fees'));
    const locked = await screen.findByTestId('category-parent-locked');
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('category-parent-trigger')).toBeNull();
    expect(
      screen.getByText('Đang có 2 danh mục con — chuyển các danh mục con trước để đổi danh mục cha.'),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('category-save-btn'));
    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-fees',
      );
      expect(patchCall?.body).toEqual({ name: 'Phí & lệ phí', icon: 'receipt' });
    });

    // 2. Childless top-level `Ăn uống` excludes itself from parent picker
    await user.click(screen.getByTestId('category-edit-cat-food'));
    await user.click(await screen.findByTestId('category-parent-trigger'));
    const parentList = await screen.findByTestId('category-parent-list');
    expect(within(parentList).queryByTestId('category-parent-option-cat-food')).toBeNull();
    expect(within(parentList).getByTestId('category-parent-option-cat-fees')).toBeInTheDocument();

    await user.click(within(parentList).getByTestId('category-parent-option-cat-fees'));
    await user.click(screen.getByTestId('category-save-btn'));

    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-food',
      );
      expect(patchCall?.body).toMatchObject({ parentId: 'cat-fees' });
    });
  });

  it('locks parent field with a plain note when editing the sole top-level category of a type', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': { categories: baseCategories(), recentIds: [] },
    });

    renderVi();
    await screen.findByText('Ăn uống');

    await user.click(screen.getByRole('tab', { name: 'Thu' }));
    await screen.findByText('Lương');

    await user.click(screen.getByTestId('category-edit-cat-salary'));
    expect(await screen.findByTestId('category-parent-locked')).toBeInTheDocument();
    expect(screen.getByText('Chưa có danh mục chính nào khác để chuyển vào.')).toBeInTheDocument();
  });

  it('deletes a parent with children by promoting children directly without the confirm modal', async () => {
    const user = userEvent.setup();
    let cats: CategoryView[] = [
      ...baseCategories(),
      { id: 'cat-c3', parentId: 'cat-fees', type: 'expense', name: 'C3', icon: 'receipt', hidden: false, sortOrder: 2 },
      { id: 'cat-c4', parentId: 'cat-fees', type: 'expense', name: 'C4', icon: 'receipt', hidden: false, sortOrder: 3 },
      { id: 'cat-c5', parentId: 'cat-fees', type: 'expense', name: 'C5', icon: 'receipt', hidden: false, sortOrder: 4 },
      { id: 'cat-c6', parentId: 'cat-fees', type: 'expense', name: 'C6', icon: 'receipt', hidden: false, sortOrder: 5 },
    ];

    const deletedUrls: string[] = [];

    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'DELETE /api/me/personal/categories/cat-fees': (_init: RequestInit | undefined, urlStr: string) => {
        deletedUrls.push(urlStr);
        const childrenParam = new URL(urlStr, 'http://x').searchParams.get('children');
        if (childrenParam === 'promote') {
          cats = cats
            .filter((c) => c.id !== 'cat-fees')
            .map((c) => (c.parentId === 'cat-fees' ? { ...c, parentId: null } : c));
          return Response.json({ ok: true });
        }
        return Response.json({ error: { code: 'VALIDATION' } }, { status: 422 });
      },
    });

    renderVi();
    await screen.findByText('Phí & lệ phí');

    const feesRow = screen.getByTestId('category-row-cat-fees');
    await user.click(within(feesRow).getByRole('button', { name: 'Xóa' }));

    // Opens delete-parent sheet directly (no generic confirmDelete modal)
    const sheet = await screen.findByTestId('delete-parent-sheet');
    expect(screen.queryByTestId('category-delete-confirm')).toBeNull();
    expect(within(sheet).getByText('+1 danh mục nữa')).toBeInTheDocument();
    expect(within(sheet).getByTestId('delete-parent-mode-promote')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(within(sheet).getByTestId('delete-parent-confirm'));

    await waitFor(() => expect(screen.queryByTestId('delete-parent-sheet')).toBeNull());
    expect(deletedUrls[0]).toBe('/api/me/personal/categories/cat-fees?children=promote');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã xóa “Phí & lệ phí” và đưa 6 danh mục con lên danh mục chính',
    );
  });

  it('handles deleting a parent with children AND direct transactions in two-step inline flow, and supports Hide instead', async () => {
    const user = userEvent.setup();
    let cats = baseCategories();

    const deletedUrls: string[] = [];

    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/categories': () => Response.json({ categories: cats, recentIds: [] }),
      'DELETE /api/me/personal/categories/cat-fees': (_init: RequestInit | undefined, urlStr: string) => {
        deletedUrls.push(urlStr);
        const params = new URL(urlStr, 'http://x').searchParams;
        const moveTo = params.get('moveTo');
        const childrenParam = params.get('children');
        if (!moveTo) {
          return Response.json(
            { error: { code: 'IN_USE', message: 'Category is in use.', count: 3 } },
            { status: 409 },
          );
        }
        cats = cats
          .filter((c) => c.id !== 'cat-fees')
          .map((c) => (c.parentId === 'cat-fees' ? { ...c, parentId: childrenParam } : c));
        return Response.json({ ok: true });
      },
      'PATCH /api/me/personal/categories/cat-food': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { hidden?: boolean };
        cats = cats.map((c) => (c.id === 'cat-food' ? { ...c, hidden: Boolean(body.hidden) } : c));
        return Response.json({ category: cats.find((c) => c.id === 'cat-food') });
      },
    });

    renderVi();
    await screen.findByText('Phí & lệ phí');

    const feesRow = screen.getByTestId('category-row-cat-fees');
    await user.click(within(feesRow).getByRole('button', { name: 'Xóa' }));

    const sheet = await screen.findByTestId('delete-parent-sheet');
    await user.click(within(sheet).getByTestId('delete-parent-mode-move'));
    const parentSelect = within(sheet).getByTestId('delete-parent-target-select');
    await user.selectOptions(parentSelect, 'cat-food');

    // First submit reveals direct transactions inline while preserving chosen parent target
    await user.click(within(sheet).getByTestId('delete-parent-confirm'));

    const txSelect = await within(sheet).findByTestId('delete-parent-tx-move-select');
    expect(within(sheet).getByText(/“Phí & lệ phí” cũng đang có 3 giao dịch trực tiếp/)).toBeInTheDocument();
    expect(within(sheet).getByTestId('delete-parent-mode-move')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect((parentSelect as HTMLSelectElement).value).toBe('cat-food');

    await user.selectOptions(txSelect, 'cat-tax');
    await user.click(within(sheet).getByTestId('delete-parent-confirm'));

    await waitFor(() => expect(screen.queryByTestId('delete-parent-sheet')).toBeNull());
    expect(deletedUrls[1]).toBe(
      '/api/me/personal/categories/cat-fees?moveTo=cat-tax&children=cat-food',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã xóa “Phí & lệ phí” và chuyển 2 danh mục con sang “Ăn uống”',
    );

    // Now `cat-food` has children (`Thuế`, `Phí`) -> test Hide instead
    const foodRow = screen.getByTestId('category-row-cat-food');
    await user.click(within(foodRow).getByRole('button', { name: 'Xóa' }));
    const foodSheet = await screen.findByTestId('delete-parent-sheet');
    await user.click(within(foodSheet).getByTestId('delete-parent-hide-instead'));

    await waitFor(() => expect(screen.queryByTestId('delete-parent-sheet')).toBeNull());
    const hidePatch = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal/categories/cat-food',
    );
    expect(hidePatch?.body).toEqual({ hidden: true });
  });
});
