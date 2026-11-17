import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt } from '../../test/render';
import { WalletPie, type WalletPieSlice } from '../WalletPie';

describe('WalletPie legend', () => {
  it('shows each slice VND amount, rounded percentage share, and ≈ for approximate slices', () => {
    const slices: WalletPieSlice[] = [
      { id: 'w-vnd', name: 'Tiền mặt', vndValue: 5_000_000 },
      { id: 'w-usd', name: 'USD Wallet', vndValue: 2_500_000, approximate: true },
      { id: 'w-bank', name: 'Ngân hàng', vndValue: 2_500_000 },
    ];

    renderAt(<WalletPie slices={slices} />);

    const pie = screen.getByTestId('wallet-pie');
    const rows = pie.querySelectorAll('.fsl-wallet-pie__row');
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent('Tiền mặt');
    expect(rows[0]).toHaveTextContent('5.000.000₫');
    expect(rows[0]).not.toHaveTextContent('≈');
    expect(rows[0]).toHaveTextContent('50%');

    expect(rows[1]).toHaveTextContent('USD Wallet');
    expect(rows[1]).toHaveTextContent('≈ 2.500.000₫');
    expect(rows[1]).toHaveTextContent('25%');

    expect(rows[2]).toHaveTextContent('Ngân hàng');
    expect(rows[2]).toHaveTextContent('2.500.000₫');
    expect(rows[2]).toHaveTextContent('25%');
  });

  it('excludes zero/negative slices from the pie and marks grouped Other as approximate when any grouped slice is approximate', () => {
    const slices: WalletPieSlice[] = [
      { id: 'w-1', name: 'W1', vndValue: 5_000_000 },
      { id: 'w-2', name: 'W2', vndValue: 2_000_000 },
      { id: 'w-3', name: 'W3', vndValue: 1_500_000 },
      { id: 'w-4', name: 'W4', vndValue: 1_000_000 },
      { id: 'w-5', name: 'USDT', vndValue: 500_000, approximate: true },
      { id: 'w-zero', name: 'Zero', vndValue: 0 },
      { id: 'w-neg', name: 'Debt', vndValue: -200_000 },
    ];

    renderAt(<WalletPie slices={slices} />);

    const pie = screen.getByTestId('wallet-pie');
    expect(pie).not.toHaveTextContent('Zero');
    expect(pie).not.toHaveTextContent('Debt');

    const rows = pie.querySelectorAll('.fsl-wallet-pie__row');
    expect(rows).toHaveLength(5);
    expect(rows[4]).toHaveTextContent('Other');
    expect(rows[4]).toHaveTextContent('≈ 500.000₫');
    expect(rows[4]).toHaveTextContent('5%');
  });
});
