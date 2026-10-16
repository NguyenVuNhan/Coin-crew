import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PaymentView, TripView } from '@fsl/core';
import { renderAt } from '../../test/render';
import { tripView, viewerView, PIDS } from '../../test/fixtures';
import { PaymentsList } from '../PaymentsList';

afterEach(() => {
  vi.unstubAllGlobals();
});

const payment = (p: Partial<PaymentView> & Pick<PaymentView, 'id' | 'fromId' | 'toId'>): PaymentView => ({
  status: 'confirmed', amountClaimed: 100000, amountConfirmed: 100000, notArrived: false, createdAt: '2026-10-12T08:00:00.000Z', ...p,
});

/** Minh's view: Chi paid him, and An paid Bình (nothing to do with Minh). */
const withPayments = (payments: PaymentView[]): TripView => tripView({ payments });
const chiToMinh = payment({ id: 'pay-cm', fromId: PIDS.C, toId: PIDS.M });
const anToBinh = payment({ id: 'pay-ab', fromId: PIDS.A, toId: PIDS.B });

const render = (view: TripView) => renderAt(<PaymentsList view={view} onOpen={() => {}} />);

describe('PaymentsList', () => {
  it('shows only payments with you, and Show all reveals the rest', async () => {
    render(withPayments([chiToMinh, anToBinh]));
    const mine = screen.getByRole('region', { name: 'Your payments' });
    expect(within(mine).getByTestId('payment-row-pay-cm')).toBeInTheDocument();
    expect(within(mine).queryByTestId('payment-row-pay-ab')).toBeNull();

    await userEvent.click(within(mine).getByRole('button', { name: 'Show all' }));
    const all = screen.getByRole('region', { name: 'All payments' });
    expect(within(all).getByTestId('payment-row-pay-cm')).toBeInTheDocument();
    expect(within(all).getByTestId('payment-row-pay-ab')).toBeInTheDocument();
    expect(within(all).getByRole('button', { name: 'Show mine' })).toBeInTheDocument();
    expect(localStorage.getItem('fsl.payments.mode')).toBe('all');
  });

  it('remembers Show all', () => {
    localStorage.setItem('fsl.payments.mode', 'all');
    render(withPayments([chiToMinh, anToBinh]));
    expect(within(screen.getByRole('region', { name: 'All payments' })).getByTestId('payment-row-pay-ab')).toBeInTheDocument();
  });

  it('with nothing of yours it says so and still offers Show all', async () => {
    render(withPayments([anToBinh]));
    const mine = screen.getByRole('region', { name: 'Your payments' });
    expect(within(mine).getByText('No payments with you yet.')).toBeInTheDocument();
    await userEvent.click(within(mine).getByRole('button', { name: 'Show all' }));
    expect(screen.getByTestId('payment-row-pay-ab')).toBeInTheDocument();
  });

  it('a view-only link sees every payment, with no chip', () => {
    render({ ...viewerView(), payments: [chiToMinh, anToBinh] });
    const list = screen.getByRole('region', { name: 'Payments' });
    expect(within(list).getAllByTestId(/^payment-row-/)).toHaveLength(2);
    expect(within(list).queryByRole('button', { name: /^Show (all|mine)$/ })).toBeNull();
  });

  it('no payments at all: no section', () => {
    render(withPayments([]));
    expect(screen.queryByRole('region', { name: /payments/i })).toBeNull();
  });
});
