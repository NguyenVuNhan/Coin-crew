import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WalletDetailView } from '@cc/core';
import { mockApi, renderAt } from '../../test/render';
import { BalanceCheckPrompt } from '../BalanceCheckPrompt';

afterEach(() => {
  vi.unstubAllGlobals();
});

const WALLETS: WalletDetailView[] = [
  {
    id: 'w-1',
    name: 'Techcombank',
    currency: 'VND',
    balance: 4120000,
    isDefault: true,
    kind: 'everyday',
    startAmount: 4120000,
    startDate: '2026-10-01',
    startCostVnd: null,
    vndValue: null,
    icon: null,
    sortOrder: 0,
    archived: false,
    entryCount: 0,
  },
  {
    id: 'w-2',
    name: 'Cash',
    currency: 'VND',
    balance: 350000,
    isDefault: false,
    kind: 'everyday',
    startAmount: 350000,
    startDate: '2026-10-01',
    startCostVnd: null,
    vndValue: null,
    icon: null,
    sortOrder: 1,
    archived: false,
    entryCount: 0,
  },
];

describe('BalanceCheckPrompt', () => {
  it('hidden when balance-checks list is empty', async () => {
    mockApi({
      'GET /api/me/personal/balance-checks': { walletIds: [] },
      'GET /api/me/personal/wallets': { wallets: WALLETS },
    });

    renderAt(<BalanceCheckPrompt />);

    await waitFor(() => {
      expect(screen.queryByTestId('balance-check-list')).not.toBeInTheDocument();
    });
  });

  it('enter amount shows preview and difference, POSTs { actual }, hides card, and shows Snackbar', async () => {
    const user = userEvent.setup();
    let remainingIds = ['w-1', 'w-2'];

    const { calls } = mockApi({
      'GET /api/me/personal/balance-checks': () => Response.json({ walletIds: remainingIds }),
      'GET /api/me/personal/wallets': { wallets: WALLETS },
      'POST /api/me/personal/wallets/w-1/balance-check': () => {
        remainingIds = ['w-2'];
        return Response.json({ entryId: 'adj-1' });
      },
      'GET /api/me/personal/summary': { totalVnd: 4470000, cashVnd: 4470000, approximate: false, perCurrency: [] },
      'GET /api/me/personal/transactions': { rows: [], groupRows: [] },
      'GET /api/me/personal/holdings': { holdings: [] },
    });

    renderAt(<BalanceCheckPrompt />);

    const card1 = await screen.findByTestId('balance-check-card-w-1');
    expect(card1).toHaveTextContent('Does the balance match your bank?');
    expect(card1).toHaveTextContent('Techcombank');
    expect(card1).toHaveTextContent('4.120.000₫');
    expect(screen.getByTestId('balance-check-card-w-2')).toBeInTheDocument();

    await user.click(screen.getByTestId('balance-check-enter-w-1'));

    const amountInput = await screen.findByTestId('balance-check-amount');
    expect(amountInput).toHaveAttribute('inputmode', 'numeric');
    await user.type(amountInput, '4050000');

    expect(screen.getByTestId('balance-check-preview')).toHaveTextContent('4.050.000₫');
    expect(screen.getByTestId('balance-check-diff')).toHaveTextContent('\u221270.000₫');

    await user.click(screen.getByTestId('balance-check-save'));

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            c.path === '/api/me/personal/wallets/w-1/balance-check' &&
            (c.body as { actual?: number })?.actual === 4050000,
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('balance-check-card-w-1')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('balance-check-card-w-2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Balance adjusted');
  });

  it('skip POSTs { skip: true } and line disappears after', async () => {
    const user = userEvent.setup();
    let remainingIds = ['w-1'];

    const { calls } = mockApi({
      'GET /api/me/personal/balance-checks': () => Response.json({ walletIds: remainingIds }),
      'GET /api/me/personal/wallets': { wallets: WALLETS },
      'POST /api/me/personal/wallets/w-1/balance-check': () => {
        remainingIds = [];
        return Response.json({ entryId: null });
      },
      'GET /api/me/personal/summary': { totalVnd: 4470000, cashVnd: 4470000, approximate: false, perCurrency: [] },
      'GET /api/me/personal/transactions': { rows: [], groupRows: [] },
      'GET /api/me/personal/holdings': { holdings: [] },
    });

    renderAt(<BalanceCheckPrompt />);

    await screen.findByTestId('balance-check-card-w-1');
    await user.click(screen.getByTestId('balance-check-skip-w-1'));

    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            c.path === '/api/me/personal/wallets/w-1/balance-check' &&
            (c.body as { skip?: boolean })?.skip === true,
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('balance-check-card-w-1')).not.toBeInTheDocument();
    });
  });

  it('when walletId is provided, shows only that wallet card', async () => {
    mockApi({
      'GET /api/me/personal/balance-checks': { walletIds: ['w-1', 'w-2'] },
      'GET /api/me/personal/wallets': { wallets: WALLETS },
    });

    renderAt(<BalanceCheckPrompt walletId="w-2" />);

    const card2 = await screen.findByTestId('balance-check-card-w-2');
    expect(card2).toHaveTextContent('Cash');
    expect(screen.queryByTestId('balance-check-card-w-1')).not.toBeInTheDocument();
  });
});
