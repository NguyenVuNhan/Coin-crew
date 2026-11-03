import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ExpensePayView, PayInfo, TripView, MeResponse, IncomingMergeRequest, PickerView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, PIDS, picker } from '../../test/fixtures';
import { setLang } from '@cc/web-i18n';
import { ExpensePay } from '../ExpensePay';
import { WhoAreYou } from '../WhoAreYou';

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
    viewer: 'claim',
    claim: { name: 'Chi', expiresAt: '2099-01-01T00:00:00.000Z' },
    paid: [],
    pay: expensePayInfo(),
    ...overrides,
  };
}

function mockMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: null,
    signIn: { zalo: true },
    mergeRequests: {
      incoming: [],
      outgoing: [],
      joining: [],
      claim: null,
    },
    ...overrides,
  };
}

const api = (
  payData: ExpensePayView | { row: null; claim?: { name: string; expiresAt: string } },
  extra: Record<string, unknown> = {},
  trip: TripView = guestChiView(),
) =>
  mockApi({
    'GET /api/trips/t-1': trip,
    'GET /api/trips/t-1/version': { version: 3 },
    'GET /api/trips/t-1/expenses/e-1/pay': payData,
    ...extra,
  });

function renderWithLoc(initialEntry: string, ui: React.ReactElement) {
  setLang('en');
  function LocProbe() {
    const loc = useLocation();
    return (
      <div>
        <div data-testid="loc-path">{loc.pathname}</div>
        <div data-testid="loc-search">{loc.search}</div>
      </div>
    );
  }

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/t/:tripId/expenses/:expenseId/pay" element={ui} />
          <Route path="/t/:tripId/who" element={ui} />
          <Route path="*" element={null} />
        </Routes>
        <LocProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ExpensePay claim and locked screen', () => {
  it('viewer: "claim" renders pay-locked with no back button and waiting text', async () => {
    api(expensePayView());
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByTestId('pay-locked')).toBeInTheDocument();
    expect(document.querySelector('.fsl-screen__back')).toBeNull();
    expect(
      screen.getByText('Waiting for Chi to approve in a browser'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I've paid" })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open in browser' }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chi's share")).toBeInTheDocument();
    expect(screen.getByText(/Badminton court/)).toBeInTheDocument();
  });

  it('a waiting claim with nothing to pay stays locked instead of going back to "Who are you?"', async () => {
    api({ row: null, claim: { name: 'Nhân', expiresAt: '2026-11-11T00:00:00.000Z' } });
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByTestId('pay-locked')).toBeInTheDocument();
    expect(document.querySelector('.fsl-screen__back')).toBeNull();
    expect(screen.getByText('Waiting for Nhân to approve in a browser')).toBeInTheDocument();
    expect(screen.getByText('Nhân has nothing to pay for this expense.')).toBeInTheDocument();
  });

  it('viewer: "claim" clicking Open in browser reveals fallback steps when intent is unsupported', async () => {
    api(expensePayView());
    renderAt(<ExpensePay />, payRoute);

    const openBtn = await screen.findByRole('button', { name: 'Open in browser' });
    expect(openBtn).toBeInTheDocument();
    expect(screen.queryByText('Tap ⋯ → Open in browser')).toBeNull();

    await userEvent.click(openBtn);
    expect(await screen.findByText('Tap ⋯ → Open in browser')).toBeInTheDocument();
  });

  it('viewer: "claim" hides "paid by a friend" choice and pays directly on slots >= 2', async () => {
    const { calls } = api(
      expensePayView({
        row: {
          participantId: PIDS.C,
          name: 'Chi',
          isMember: false,
          slots: 2,
          share: 85000,
          remaining: 85000,
          tiles: [
            { gender: 'F', amount: 45000 },
            { gender: 'M', amount: 40000 },
          ],
        },
      }),
      {
        'POST /api/trips/t-1/expenses/e-1/pay-report': {
          paymentId: 'pay-claim-direct',
          status: 'says_paid',
        },
      },
    );

    renderAt(<ExpensePay />, payRoute);

    const paidBtn = await screen.findByRole('button', { name: "I've paid" });
    await userEvent.click(paidBtn);

    await waitFor(() => {
      const reportCall = calls.find(
        (c) => c.path === '/api/trips/t-1/expenses/e-1/pay-report',
      );
      expect(reportCall).toBeDefined();
      expect(reportCall?.body).toEqual({ amount: 85000, paidBy: 'self' });
    });

    // WhoPaidSheet is not opened
    expect(screen.queryByText(/Who paid/i)).toBeNull();
  });

  it('?claim=incoming opens MergeConfirmSheet and strips claim query param with replace', async () => {
    const incomingReq: IncomingMergeRequest = {
      id: 'req-inc-1',
      provider: 'zalo',
      expiresAt: '2099-01-01T00:00:00.000Z',
      survivor: {
        name: 'Chi',
        avatarUrl: null,
        email: null,
        providers: ['zalo'],
      },
      groups: { survivor: 1, merged: 1 },
      released: [],
    };

    api(expensePayView(), {
      'GET /api/me': mockMe({
        mergeRequests: {
          incoming: [incomingReq],
          outgoing: [],
          joining: [],
          claim: null,
        },
      }),
    });

    renderWithLoc('/t/t-1/expenses/e-1/pay?claim=incoming', <ExpensePay />);

    expect(
      await screen.findByRole('heading', { name: 'Merge accounts?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Merge accounts' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('loc-search')).toHaveTextContent('');
    });
  });

  it('?claim=taken shows taken message inline and strips claim query param', async () => {
    api(expensePayView());

    renderWithLoc('/t/t-1/expenses/e-1/pay?claim=taken', <ExpensePay />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Chi already signs in with a different Zalo account',
    );
    expect(alert).toHaveClass('text-danger');

    await waitFor(() => {
      expect(screen.getByTestId('loc-search')).toHaveTextContent('');
    });
  });

  it('?claim=invalid shows generic inline error and strips claim query param', async () => {
    api(expensePayView());

    renderWithLoc('/t/t-1/expenses/e-1/pay?claim=invalid', <ExpensePay />);

    expect(
      await screen.findByText('Something went wrong. Try again.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('loc-search')).toHaveTextContent('');
    });
  });
});

describe('WhoAreYou with waiting claim banner', () => {
  it('with a waiting claim in this group and a payment page to return to, goes straight back to it', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': mockMe({
        mergeRequests: {
          incoming: [],
          outgoing: [],
          joining: [],
          claim: { id: 'claim-1', tripId: 't-1', participantId: PIDS.C, name: 'Chi', expiresAt: '2099-01-01T00:00:00.000Z' },
        },
      }),
    });

    renderWithLoc(
      `/t/t-1/who?expense=e-1&next=${encodeURIComponent('/t/t-1/expenses/e-1/pay')}`,
      <WhoAreYou />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loc-path')).toHaveTextContent('/t/t-1/expenses/e-1/pay');
    });
  });

  it('shows claim.waitingWho status strip above list when me.mergeRequests.claim is set', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': mockMe({
        mergeRequests: {
          incoming: [],
          outgoing: [],
          joining: [],
          claim: {
            id: 'claim-1',
            tripId: 't-1',
            participantId: PIDS.C,
            name: 'Chi',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        },
      }),
    });

    renderAt(<WhoAreYou />, { route: '/t/t-1/who', path: '/t/:tripId/who' });

    expect(
      await screen.findByText(
        "You asked to join Chi's account. Waiting for approval in a browser.",
      ),
    ).toBeInTheDocument();
    const openBtn = screen.getByRole('button', { name: 'Open in browser' });
    expect(openBtn).toBeInTheDocument();

    await userEvent.click(openBtn);
    expect(await screen.findByText('Tap ⋯ → Open in browser')).toBeInTheDocument();
  });
});
