import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WalletDetailView } from '@cc/core';
import { mockApi, renderAt } from '../../test/render';
import { categoryIconName } from '../categoryIcon';
import { WalletForm } from '../WalletForm';
import { FirstWalletSheet } from '../FirstWalletSheet';
import { CurrencyPickerSheet } from '../CurrencyPickerSheet';
import { WalletIconPickerSheet } from '../WalletIconPickerSheet';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('categoryIconName', () => {
  it('resolves every starter category icon to itself', () => {
    const starterIcons = [
      'utensils',
      'bus',
      'shopping-bag',
      'receipt',
      'heart-pulse',
      'trending-up',
      'landmark',
      'badge-percent',
      'candlestick-chart',
      'coins',
      'pie-chart',
      'gem',
      'wallet',
      'piggy-bank',
      'gift',
    ];
    for (const icon of starterIcons) {
      expect(categoryIconName(icon)).toBe(icon);
    }
  });
});

describe('WalletForm and FirstWalletSheet non-VND startCostVnd requirement', () => {
  it('WalletForm disables submit when non-VND wallet has non-zero start amount and empty VND value, and shows hint', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    renderAt(<WalletForm open onClose={() => {}} />);

    await user.type(screen.getByTestId('wallet-form-name'), 'USD Savings');
    await user.click(screen.getByTestId('wallet-form-currency-trigger'));
    await user.click(await screen.findByTestId('currency-option-USD'));
    await user.type(screen.getByTestId('wallet-form-amount'), '100');

    const costInput = await screen.findByTestId('wallet-form-cost-vnd');
    expect(costInput).toBeInTheDocument();
    expect(screen.getByTestId('wallet-form-submit')).toBeDisabled();

    await user.type(costInput, '2500000');
    await waitFor(() => {
      expect(screen.getByTestId('wallet-form-submit')).toBeEnabled();
    });
  });

  it('FirstWalletSheet disables submit when non-VND wallet has non-zero start amount and empty VND value', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    renderAt(<FirstWalletSheet open onClose={() => {}} />);

    await user.type(screen.getByTestId('first-wallet-name'), 'USD Wallet');
    await user.click(screen.getByTestId('first-wallet-currency-trigger'));
    await user.click(await screen.findByTestId('currency-option-USD'));
    await user.type(screen.getByTestId('first-wallet-amount'), '50');

    const costInput = await screen.findByTestId('first-wallet-cost-vnd');
    expect(costInput).toBeInTheDocument();
    expect(screen.getByTestId('first-wallet-create')).toBeDisabled();

    await user.type(costInput, '1250000');
    await waitFor(() => {
      expect(screen.getByTestId('first-wallet-create')).toBeEnabled();
    });
  });
});

describe('WalletForm redesigned layout, options, and locking', () => {
  it('renders no start date, shows icon trigger beside name with 40-char counter, toggles excludeFromReports, and hides notification/bank controls', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'POST /api/me/personal/wallets/add': () => Response.json({ wallet: { id: 'w-new' } }, { status: 201 }),
    });

    renderAt(<WalletForm open onClose={() => {}} />);

    expect(screen.queryByTestId('wallet-form-date')).not.toBeInTheDocument();
    expect(screen.getByTestId('wallet-form-icon-trigger')).toBeInTheDocument();

    const nameInput = screen.getByTestId('wallet-form-name');
    expect(nameInput).toHaveAttribute('maxLength', '40');
    await user.type(nameInput, 'My Wallet');
    expect(screen.getByText('9/40')).toBeInTheDocument();

    const excludeSwitch = screen.getByTestId('wallet-form-exclude-reports');
    expect(excludeSwitch).toHaveAttribute('role', 'switch');
    expect(excludeSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(excludeSwitch);
    expect(excludeSwitch).toHaveAttribute('aria-checked', 'true');

    expect(screen.queryByText(/Enable wallet notification|Bật thông báo ví/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Link to a bank|Liên kết ngân hàng/i)).not.toBeInTheDocument();

    await user.click(screen.getByTestId('wallet-form-icon-trigger'));
    await user.click(await screen.findByTestId('wallet-icon-tab-bank'));
    await user.click(await screen.findByTestId('wallet-icon-option-bank:vcb'));

    await user.click(screen.getByTestId('wallet-form-submit'));
    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/wallets/add');
      expect(post).toBeDefined();
      expect(post?.body).toMatchObject({
        name: 'My Wallet',
        icon: 'bank:vcb',
        excludeFromReports: true,
      });
      expect(post?.body).not.toHaveProperty('startDate');
    });
  });

  it('locks currency and kind when wallet.entryCount > 0 while keeping excludeFromReports editable', async () => {
    const user = userEvent.setup();
    const lockedWallet: WalletDetailView = {
      id: 'w-locked',
      name: 'Vietcombank',
      currency: 'VND',
      balance: 1_000_000,
      isDefault: true,
      kind: 'everyday',
      startAmount: 1_000_000,
      startDate: '2026-11-01',
      startCostVnd: null,
      vndValue: 1_000_000,
      icon: 'bank:vcb',
      sortOrder: 0,
      archived: false,
      entryCount: 3,
      excludeFromReports: false,
    };
    const { calls } = mockApi({
      'PATCH /api/me/personal/wallets/w-locked': () =>
        Response.json({ wallet: { ...lockedWallet, excludeFromReports: true } }),
    });

    renderAt(<WalletForm open onClose={() => {}} wallet={lockedWallet} />);

    expect(screen.getByTestId('wallet-form-currency-trigger')).toBeDisabled();
    expect(screen.getByTestId('wallet-form-kind-everyday')).toBeDisabled();
    expect(screen.getByTestId('wallet-form-kind-investment')).toBeDisabled();

    const excludeSwitch = screen.getByTestId('wallet-form-exclude-reports');
    expect(excludeSwitch).toBeEnabled();
    expect(excludeSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(excludeSwitch);
    expect(excludeSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByTestId('wallet-form-submit'));
    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH' && c.path === '/api/me/personal/wallets/w-locked');
      expect(patch).toBeDefined();
      expect(patch?.body).toMatchObject({
        name: 'Vietcombank',
        excludeFromReports: true,
      });
      expect(patch?.body).not.toHaveProperty('kind');
      expect(patch?.body).not.toHaveProperty('currency');
      expect(patch?.body).not.toHaveProperty('startDate');
    });
  });
});

describe('CurrencyPickerSheet', () => {
  it('renders Popular + All sections, filters by accent-folded Vietnamese name and code, and selects currency on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();

    renderAt(<CurrencyPickerSheet open onClose={onClose} value="VND" onSelect={onSelect} />);

    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.getByText('All currencies')).toBeInTheDocument();
    expect(screen.getByTestId('currency-option-VND')).toBeInTheDocument();
    expect(screen.getByTestId('currency-option-AED')).toBeInTheDocument();

    const search = screen.getByTestId('currency-picker-search');
    await user.type(search, 'yen nhat');
    expect(screen.getByTestId('currency-option-JPY')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-option-USD')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'SGD');
    expect(screen.getByTestId('currency-option-SGD')).toBeInTheDocument();
    expect(screen.queryByTestId('currency-option-JPY')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('currency-option-SGD'));
    expect(onSelect).toHaveBeenCalledWith('SGD');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WalletIconPickerSheet', () => {
  it('switches packages via tabs, hides scrollbar on tabs, supports pastel tone dots, hides tabs when searching, and matches category names', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();

    renderAt(<WalletIconPickerSheet open onClose={onClose} value="bg-avatar-5" onSelect={onSelect} />);

    const tabs = screen.getByTestId('wallet-icon-tabs');
    expect(tabs.className).toContain('[scrollbar-width:none]');
    expect(tabs.className).toContain('[-ms-overflow-style:none]');
    expect(tabs.className).toContain('[&::-webkit-scrollbar]:hidden');

    await user.click(screen.getByTestId('wallet-icon-tone-2'));
    expect(screen.getByTestId('wallet-icon-option-basic:cash:2')).toBeInTheDocument();

    await user.click(screen.getByTestId('wallet-icon-tab-bank'));
    expect(screen.getByTestId('wallet-icon-option-bank:vcb')).toBeInTheDocument();

    await user.click(screen.getByTestId('wallet-icon-tab-ewallet'));
    expect(screen.getByTestId('wallet-icon-option-ewallet:momo')).toBeInTheDocument();

    const search = screen.getByTestId('wallet-icon-search');
    await user.type(search, 'đầu tư');
    expect(screen.queryByTestId('wallet-icon-tabs')).not.toBeInTheDocument();
    expect(screen.getByTestId('wallet-icon-option-inv:stocks')).toBeInTheDocument();

    await user.click(screen.getByTestId('wallet-icon-option-inv:stocks'));
    expect(onSelect).toHaveBeenCalledWith('inv:stocks');
    expect(onClose).toHaveBeenCalled();
  });
});
