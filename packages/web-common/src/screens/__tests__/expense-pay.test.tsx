import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ExpensePayView, PayInfo, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, PIDS } from '../../test/fixtures';
import { setLang } from '../../i18n';
import { ExpensePay } from '../ExpensePay';
import { App } from '../../App';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const payRoute = {
  route: '/t/t-1/expenses/e-1/pay',
  path: '/t/:tripId/expenses/:expenseId/pay',
};

function expensePayInfo(overrides: Partial<PayInfo> = {}): PayInfo {
  return {
    to: { id: PIDS.M, name: 'Minh' },
    amount: 85000,
    bankState: 'ok',
    bank: {
      bin: '970407',
      bankName: 'Techcombank',
      accountNumber: '19031234565678',
      accountNumberMasked: '1903 •••• 5678',
      holderName: 'NGUYEN VAN MINH',
    },
    refCode: 'DALAT C7K2',
    payload:
      '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA53037045405850005802VN62140810DALAT C7K263046572',
    inFlight: [],
    ...overrides,
  };
}

function expensePayView(overrides: Partial<ExpensePayView> = {}): ExpensePayView {
  return {
    expense: {
      id: 'e-1',
      description: 'Badminton court',
      spentOn: '2026-10-10',
      amount: 425000,
    },
    payer: { id: PIDS.M, name: 'Minh' },
    row: {
      participantId: PIDS.C,
      name: 'Chi',
      isMember: false,
      slots: 1,
      share: 85000,
      remaining: 85000,
      tiles: [],
    },
    viewer: 'self',
    paid: [],
    pay: expensePayInfo(),
    ...overrides,
  };
}

const api = (
  payData: ExpensePayView | { row: null },
  extra: Record<string, unknown> = {},
  trip: TripView = guestChiView(),
) =>
  mockApi({
    'GET /api/trips/t-1': trip,
    'GET /api/trips/t-1/version': { version: 3 },
    'GET /api/trips/t-1/expenses/e-1/pay': payData,
    ...extra,
  });

describe('ExpensePay', () => {
  it('shows only remaining, PayQr and I\'ve paid', async () => {
    api(expensePayView());
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByRole('button', { name: "I've paid" })).toBeInTheDocument();
    const qr = await screen.findByRole('img', { name: /VietQR code to pay Minh/ });
    await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/));
    expect(screen.getByText("Chi's share")).toBeInTheDocument();
    expect(screen.getByText(/Badminton court/)).toBeInTheDocument();
    expect(screen.getAllByText('85.000₫')).toHaveLength(1);
  });

  it('coarse pointer shows Open bank app from PayQr', async () => {
    mockMedia({ coarse: true });
    api(expensePayView());
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByRole('button', { name: 'Open bank app' })).toBeInTheDocument();
  });

  it('remaining 0 shows all paid, no QR', async () => {
    api(
      expensePayView({
        row: {
          participantId: PIDS.C,
          name: 'Chi',
          isMember: false,
          slots: 1,
          share: 85000,
          remaining: 0,
          tiles: [],
        },
        pay: null,
      }),
    );
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByText('All paid ✓')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  });

  it('friend line reads "Lan\'s friend paid 45,000 ₫"', async () => {
    api(
      expensePayView({
        row: {
          participantId: 'p-lan',
          name: 'Lan',
          isMember: true,
          slots: 2,
          share: 85000,
          remaining: 40000,
          tiles: [],
        },
        paid: [
          {
            paymentId: 'p-1',
            amount: 45000,
            status: 'confirmed',
            paidBy: 'friend',
            notArrived: false,
          },
        ],
      }),
    );
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByText("Lan's friend paid 45.000₫")).toBeInTheDocument();
  });

  it('says_paid line shows waiting for payer', async () => {
    api(
      expensePayView({
        payer: { id: PIDS.M, name: 'Minh' },
        row: {
          participantId: 'p-lan',
          name: 'Lan',
          isMember: true,
          slots: 2,
          share: 85000,
          remaining: 40000,
          tiles: [],
        },
        paid: [
          {
            paymentId: 'p-1',
            amount: 45000,
            status: 'says_paid',
            paidBy: 'friend',
            notArrived: false,
          },
        ],
      }),
    );
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByText("Lan's friend paid 45.000₫")).toBeInTheDocument();
    expect(screen.getByText('Waiting for Minh to confirm')).toBeInTheDocument();
  });

  it('bank none shows the bankNone line and I\'ve paid still works', async () => {
    const { calls } = api(
      expensePayView({
        pay: {
          ...expensePayInfo(),
          bankState: 'none',
          bank: null,
          payload: null,
        },
      }),
      {
        'POST /api/trips/t-1/expenses/e-1/pay-report': {
          paymentId: 'pay-new',
          status: 'says_paid',
        },
      },
    );
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByText("Minh hasn't added bank details yet")).toBeInTheDocument();
    expect(screen.getByText('85.000₫')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();

    const btn = screen.getByRole('button', { name: "I've paid" });
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);

    await waitFor(() => {
      const postCall = calls.find((c) => c.path === '/api/trips/t-1/expenses/e-1/pay-report');
      expect(postCall).toBeDefined();
      expect(postCall?.body).toEqual({ amount: 85000, paidBy: 'self' });
    });
  });

  it('row null redirects to the expense page', async () => {
    api({ row: null });
    renderAt(<ExpensePay />, payRoute);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1');
    });
  });

  it('unpicked guest redirects to who with expense param', async () => {
    setLang('en');
    const unpickedGuest: TripView = {
      ...guestChiView(),
      me: { kind: 'guest', participantId: null, participantPending: false, isOrganiser: false },
    };
    api({ row: null }, {}, unpickedGuest);

    function LocProbe() {
      const location = useLocation();
      return <div data-testid="loc">{location.pathname + location.search}</div>;
    }

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/e-1/pay']}>
          <Routes>
            <Route path="/t/:tripId/expenses/:expenseId/pay" element={<ExpensePay />} />
            <Route path="*" element={null} />
          </Routes>
          <LocProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loc')).toHaveTextContent(
        '/t/t-1/who?expense=e-1&next=%2Ft%2Ft-1%2Fexpenses%2Fe-1%2Fpay',
      );
    });
  });

  it('old /e/ link lands on /pay', async () => {
    mockApi({
      'GET /api/links/tok-1': {
        tripId: 't-1',
        tripName: 'Đà Lạt · Oct 2026',
        access: 'group',
      },
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/expenses/e-1/pay': expensePayView(),
    });

    renderAt(<App />, { route: '/j/tok-1/e/e-1' });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/j/tok-1/expenses/e-1/pay');
    });
    expect(await screen.findByRole('button', { name: "I've paid" })).toBeInTheDocument();
  });
});
