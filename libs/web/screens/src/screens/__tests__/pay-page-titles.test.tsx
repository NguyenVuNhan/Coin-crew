import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView } from '../../test/fixtures';
import { ExpensePay } from '../ExpensePay';
import { PayScreen } from '../PayScreen';

afterEach(() => {
  vi.unstubAllGlobals();
});

// A screen reader lands on the page heading: the pay pages never leave it blank.
describe('pay pages always have a page heading', () => {
  it('"Nothing for you in this bill" is headed by the bill\'s name', async () => {
    const view = guestChiView();
    const bill = view.expenses.find((e) => e.id === 'e-1');
    expect(bill?.description).toBeTruthy();
    mockApi({
      'GET /api/trips/t-1': view,
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/expenses/e-1/pay': { row: null },
    });
    renderAt(<ExpensePay />, { route: '/t/t-1/expenses/e-1/pay', path: '/t/:tripId/expenses/:expenseId/pay' });

    expect(await screen.findByText('Nothing for Chi in this bill')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(bill!.description);
  });

  it('a pay page that fails to load is headed "Pay", not left blank', async () => {
    mockApi({
      'GET /api/trips/t-1': () => Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/pay/p-minh': () => Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
    });
    renderAt(<PayScreen />, { route: '/t/t-1/pay/p-minh', path: '/t/:tripId/pay/:toId' });

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pay');
  });
});
