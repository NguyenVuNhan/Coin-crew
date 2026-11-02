import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { IncomeDetails } from '../IncomeDetails';
import { TripRoute } from '../../screens/TripRoute';

afterEach(() => {
  vi.unstubAllGlobals();
});

const atBalance = (balance: number): TripView => sportFundView({ fund: { ...sportFundView().fund!, balance } });
const fundShort = () => Response.json({ error: { code: 'FUND_SHORT', message: '' } }, { status: 409 });

/** The trip as loaded, then as it is after the first write was turned down. */
function tripThen(first: TripView, after: TripView) {
  let served = 0;
  return () => Response.json(served++ === 0 ? first : after);
}

describe('FUND_SHORT on an income Disable', () => {
  it('refreshes the trip, so the amount already spent is the current one', async () => {
    mockApi({
      // Opened at 400.000₫; meanwhile another admin spent 350.000₫ of it.
      'GET /api/trips/t-1': tripThen(atBalance(400000), atBalance(50000)),
      'POST /api/trips/t-1/fund/incomes/i-2/disable': fundShort,
    });
    renderAt(<TripRoute />, { route: '/t/t-1/fund/i-2', path: '/t/:tripId/fund/:incomeId' });
    await userEvent.click(await screen.findByRole('button', { name: /Disable/ }));
    expect(await screen.findByText("Can't disable: 250.000₫ of this money is already spent.")).toBeInTheDocument();
  });

  it('says the general fund message when the fresh trip shows nothing of it spent', async () => {
    mockApi({
      'GET /api/trips/t-1': () => Response.json(atBalance(400000)),
      'POST /api/trips/t-1/fund/incomes/i-2/disable': fundShort,
    });
    renderAt(<TripRoute />, { route: '/t/t-1/fund/i-2', path: '/t/:tripId/fund/:incomeId' });
    await userEvent.click(await screen.findByRole('button', { name: /Disable/ }));
    expect(await screen.findByText("There isn't enough in the group fund for this. Check the fund and try again.")).toBeInTheDocument();
    expect(screen.queryByText(/^Can't disable/)).toBeNull();
  });

  it('below 0₫ after a race, all of the income counts as spent', async () => {
    mockApi({ 'POST /api/trips/t-1/fund/incomes/i-2/disable': fundShort });
    renderAt(<IncomeDetails view={atBalance(-50000)} incomeId="i-2" onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Disable/ }));
    expect(await screen.findByText("Can't disable: 300.000₫ of this money is already spent.")).toBeInTheDocument();
  });
});

describe('IncomeDetails in an archived group', () => {
  const archived = (v: TripView): TripView => ({ ...v, trip: { ...v.trip, archived: true } });

  it('an admin gets no actions and no admins-only line, as on expense details', () => {
    renderAt(<IncomeDetails view={archived(sportFundView())} incomeId="i-1" onClose={() => {}} />);
    expect(screen.getByText('+200.000₫')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(screen.queryByText('Only admins can change fund income.')).toBeNull();
  });

  it('nor does a member', () => {
    renderAt(<IncomeDetails view={archived(sportMemberView())} incomeId="i-1" onClose={() => {}} />);
    expect(screen.queryByText('Only admins can change fund income.')).toBeNull();
  });
});
