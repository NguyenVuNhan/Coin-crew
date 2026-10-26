import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { sportFundView } from '../../test/fundFixtures';
import { ExpenseList } from '../ExpenseList';

beforeEach(() => localStorage.setItem('fsl.expenses.mode', 'all'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an income row's Disable shortcut", () => {
  it('on FUND_SHORT says how much is already spent, as the details page does', async () => {
    mockApi({
      'POST /api/trips/t-1/fund/incomes/i-2/disable': () =>
        Response.json({ error: { code: 'FUND_SHORT', message: '' } }, { status: 409 }),
    });
    const view = sportFundView({ fund: { ...sportFundView().fund!, balance: 50000 } });
    renderAt(<ExpenseList view={view} onOpen={() => {}} onOpenIncome={() => {}} />);
    const row = screen.getByText('Anh Minh donate quỹ').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Disable' }));
    expect(await within(row).findByText("Can't disable: 250.000₫ of this money is already spent.")).toBeInTheDocument();
  });
});
