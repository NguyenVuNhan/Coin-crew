import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '../../test/render';
import { categoryIconName } from '../categoryIcon';
import { WalletForm } from '../WalletForm';
import { FirstWalletSheet } from '../FirstWalletSheet';

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
    await user.click(screen.getByTestId('wallet-form-currency-USD'));
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
    await user.click(screen.getByTestId('first-wallet-currency-USD'));
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
