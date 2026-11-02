import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseView, TripView } from '@fsl/core';
import { renderAt } from '../../test/render';
import { tripView, viewerView, PIDS } from '../../test/fixtures';
import { ExpenseList } from '../ExpenseList';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** An expense An paid for An and Bình only: nothing to do with Minh. */
const banhMi: ExpenseView = {
  id: 'e-9', description: 'Bánh mì', amount: 100000, spentOn: '2026-10-11', payerId: PIDS.A, mode: 'equal', status: 'approved',
  rejectReason: null, disabledByName: null, createdById: PIDS.A,
  shares: [{ participantId: PIDS.A, amount: 50000, inputValue: 1 }, { participantId: PIDS.B, amount: 50000, inputValue: 1 }],
};

const render = (view: TripView) => renderAt(<ExpenseList view={view} onOpen={() => {}} />);
/** The list item that holds `text`. */
const rowWith = (text: string) => screen.getByText(text).closest('li')!;

describe('ExpenseList', () => {
  it('rows show your share, with who paid the total and how it was split', () => {
    render(tripView());
    const homestay = rowWith('Homestay Bloom · 2 nights');
    expect(within(homestay).getByText('800.000₫')).toBeInTheDocument();
    expect(within(homestay).getByText('You paid 3.200.000₫ · split equally, 4')).toBeInTheDocument();
    const bike = rowWith('Motorbike rental + fuel');
    expect(within(bike).getByText('150.000₫')).toBeInTheDocument();
    expect(within(bike).getByText('Bình paid 600.000₫ · split equally, 4')).toBeInTheDocument();
  });

  it('shows only expenses with you; Show all reveals the rest at 0₫', async () => {
    render(tripView({ expenses: [...tripView().expenses, banhMi] }));
    const mine = screen.getByRole('region', { name: 'Your expenses' });
    expect(within(mine).getByText('Homestay Bloom · 2 nights')).toBeInTheDocument();
    expect(within(mine).queryByText('Bánh mì')).toBeNull();

    await userEvent.click(within(mine).getByRole('button', { name: 'Show all' }));
    const all = screen.getByRole('region', { name: 'All expenses' });
    const row = within(all).getByText('Bánh mì').closest('li')!;
    expect(within(row).getByText('0₫')).toBeInTheDocument();
    expect(within(row).getByText('An paid 100.000₫ · split equally, 2')).toBeInTheDocument();
    expect(within(all).getByRole('button', { name: 'Show mine' })).toBeInTheDocument();
    expect(localStorage.getItem('fsl.expenses.mode')).toBe('all');
  });

  it('an expense you added is yours even without a share', () => {
    render(tripView({ expenses: [{ ...banhMi, createdById: PIDS.M }] }));
    expect(within(screen.getByRole('region', { name: 'Your expenses' })).getByText('Bánh mì')).toBeInTheDocument();
  });

  it('remembers Show all', () => {
    localStorage.setItem('fsl.expenses.mode', 'all');
    render(tripView({ expenses: [banhMi] }));
    expect(within(screen.getByRole('region', { name: 'All expenses' })).getByText('Bánh mì')).toBeInTheDocument();
  });

  it('with nothing of yours it says so and still offers Show all', async () => {
    render(tripView({ expenses: [banhMi] }));
    const mine = screen.getByRole('region', { name: 'Your expenses' });
    expect(within(mine).getByText('No expenses with you yet.')).toBeInTheDocument();
    await userEvent.click(within(mine).getByRole('button', { name: 'Show all' }));
    expect(screen.getByText('Bánh mì')).toBeInTheDocument();
  });

  it('a view-only link sees every expense at its total, with no chip', () => {
    render({ ...viewerView(), expenses: [...tripView().expenses, banhMi] });
    const list = screen.getByRole('region', { name: 'Expenses' });
    const homestay = within(list).getByText('Homestay Bloom · 2 nights').closest('li')!;
    expect(within(homestay).getByText('3.200.000₫')).toBeInTheDocument();
    expect(within(homestay).getByText('Minh paid · split equally, 4')).toBeInTheDocument();
    expect(within(list).getByText('Bánh mì')).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /^Show (all|mine)$/ })).toBeNull();
  });

  it('an empty trip keeps its invitation and no chip', () => {
    render(tripView({ expenses: [] }));
    expect(screen.getByText('No expenses yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });
});
