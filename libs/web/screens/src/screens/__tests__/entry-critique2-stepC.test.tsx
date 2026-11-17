import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  hideUndo();
});

const vndCash: WalletDetailView = {
  id: 'w-vnd',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'USD Card',
  currency: 'USD',
  balance: 10_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 10_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 250_000_000,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const foodCat: CategoryView = {
  id: 'cat-food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat],
  recentIds: ['cat-food'],
};

function renderEntryPage(initialPath = '/entries/new?type=expense') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PlatformProvider platform={browserPlatform}>
        <MemoryRouter initialEntries={[initialPath]}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/trips" element={<div data-testid="trips-screen">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </PlatformProvider>
    </QueryClientProvider>,
  );
}

describe('EntryPage critique round 2 step C (polish)', () => {
  it('1. row buttons in the main grouped list do not carry bare border-0', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    const walletRow = await screen.findByTestId('entry-wallet-row');
    expect(walletRow.className.split(/\s+/)).not.toContain('border-0');
    expect(walletRow.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['border-x-0', 'border-b-0']),
    );
  });

  it('2. date row text contains "Hôm nay · " with spaces', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    const dateRow = await screen.findByTestId('entry-date-row');
    expect(dateRow.textContent).toContain('Hôm nay · ');
  });

  it('3. leave guard "Tiếp tục nhập" with keypad open puts focus back inside the keypad', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('entry-back'));
    const keepBtn = await screen.findByTestId('leave-guard-keep');
    await user.click(keepBtn);

    const keypad = await screen.findByTestId('amount-keypad');
    await waitFor(() => {
      expect(keypad.contains(document.activeElement)).toBe(true);
    });
  });

  it('4. transfer with an empty second amount shows the reason line and disabled Lưu', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=transfer');
    await screen.findByTestId('amount-keypad');

    await user.click(screen.getByTestId('key-1'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-0'));

    // Close keypad by tapping outside (e.g. note input)
    await user.click(screen.getByTestId('entry-note-input'));

    const saveBtn = await screen.findByTestId('entry-save-btn');
    expect(saveBtn).toBeDisabled();
    expect(screen.getByTestId('transfer-disabled-reason')).toHaveTextContent('Nhập số nhận được');
  });

  it('5. tapping the exclude row text toggles aria-checked on the switch', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('entry-more-details-toggle');
    await user.click(screen.getByTestId('entry-more-details-toggle'));

    const sw = await screen.findByTestId('entry-exclude-switch');
    expect(sw).toHaveAttribute('role', 'switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByText('Không tính vào báo cáo'));
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('6. small-amount modal secondary button reads "Lưu 85₫"', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    const secondaryBtn = await screen.findByTestId('small-amount-keep');
    expect(secondaryBtn).toHaveTextContent('Lưu 85₫');
  });

  it('7. empty amount display has text-muted-foreground and font-medium, typed amount does not', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
    });

    renderEntryPage('/entries/new?type=expense');
    const amountDisplay = await screen.findByTestId('amount-display');
    expect(amountDisplay).toHaveAttribute('aria-label', 'Số tiền: chưa nhập');

    const emptyText = within(amountDisplay).getByText('0₫');
    expect(emptyText.className).toContain('text-muted-foreground');
    expect(emptyText.className).toContain('font-medium');

    await user.click(screen.getByTestId('key-5'));
    const typedText = within(amountDisplay).getByText('5₫');
    expect(typedText.className).not.toContain('text-muted-foreground');
  });
});
