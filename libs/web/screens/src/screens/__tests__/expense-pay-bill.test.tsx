import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpensePayView, ExpenseView, PayInfo, TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { ExpensePay } from '../ExpensePay';

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
    amount: 800000,
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
      description: 'Homestay Bloom · 2 nights',
      spentOn: '2026-10-10',
      amount: 3200000,
    },
    payer: { id: PIDS.M, name: 'Minh' },
    row: {
      participantId: PIDS.C,
      name: 'Chi',
      isMember: false,
      slots: 1,
      share: 800000,
      remaining: 800000,
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
  expenseId = 'e-1',
) =>
  mockApi({
    'GET /api/trips/t-1': trip,
    'GET /api/trips/t-1/version': { version: 3 },
    [`GET /api/trips/t-1/expenses/${expenseId}/pay`]: payData,
    ...extra,
  });

describe('ExpensePay - bill sheet and nothing-here state', () => {
  it('a person with a share sees the QR first and opens the bill in a sheet', async () => {
    api(expensePayView());
    renderAt(<ExpensePay />, payRoute);

    const qr = await screen.findByRole('img', { name: /VietQR/i });
    expect(qr).toBeInTheDocument();

    const viewBillBtn = await screen.findByRole('button', { name: 'View the bill' });
    await userEvent.click(viewBillBtn);

    const dialog = await screen.findByRole('dialog', { name: 'The bill' });
    expect(dialog).toBeInTheDocument();

    expect(within(dialog).getByText('Homestay Bloom · 2 nights')).toBeInTheDocument();
    expect(within(dialog).getByText('Minh')).toBeInTheDocument();
    expect(within(dialog).getByText('An')).toBeInTheDocument();
    expect(within(dialog).getByText('Bình')).toBeInTheDocument();
    expect(within(dialog).getByText('Chi')).toBeInTheDocument();
    expect(within(dialog).getAllByText('800.000₫')).toHaveLength(4);

    expect(qr).toBeInTheDocument();
  });

  it('a sport bill opens the session table in the sheet', async () => {
    const sportExpense: ExpenseView = {
      id: 'e-sport',
      description: 'Cầu lông tối T5',
      amount: 300000,
      spentOn: '2026-10-17',
      payerId: PIDS.M,
      mode: 'amounts',
      status: 'approved',
      rejectReason: null,
      disabledByName: null,
      createdById: PIDS.M,
      shares: [
        { participantId: PIDS.M, amount: 100000, inputValue: 100000 },
        { participantId: 'p-quang', amount: 100000, inputValue: 100000 },
        { participantId: PIDS.C, amount: 100000, inputValue: 100000 },
      ],
      meta: {
        sport: {
          court: 300000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [
            { participantId: PIDS.M, maleSlots: 1, femaleSlots: 0 },
            { participantId: 'p-quang', maleSlots: 1, femaleSlots: 0 },
            { participantId: PIDS.C, maleSlots: 0, femaleSlots: 1 },
          ],
          maleSlotRate: 100000,
          femaleSlotRate: 100000,
        },
      },
    };

    const tripWithSport: TripView = {
      ...guestChiView(),
      people: [
        ...guestChiView().people,
        { id: 'p-quang', name: 'Quang', status: 'active', isMember: false, bank: 'none', gender: 'M' },
      ],
      expenses: [sportExpense, ...guestChiView().expenses],
    };

    const payData = expensePayView({
      expense: {
        id: 'e-sport',
        description: 'Cầu lông tối T5',
        spentOn: '2026-10-17',
        amount: 300000,
      },
      row: {
        participantId: PIDS.C,
        name: 'Chi',
        isMember: false,
        slots: 1,
        share: 100000,
        remaining: 100000,
        tiles: [],
      },
    });

    api(payData, {}, tripWithSport, 'e-sport');

    renderAt(<ExpensePay />, {
      route: '/t/t-1/expenses/e-sport/pay',
      path: '/t/:tripId/expenses/:expenseId/pay',
    });

    const viewBillBtn = await screen.findByRole('button', { name: 'View the bill' });
    await userEvent.click(viewBillBtn);

    const dialog = await screen.findByRole('dialog', { name: 'The bill' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('COSTS')).toBeInTheDocument();
    expect(within(dialog).getByText('300.000₫')).toBeInTheDocument();
  });

  it('the payer opening their own bill link sees the bill', async () => {
    api({ row: null }, {}, tripView(), 'e-1');
    renderAt(<ExpensePay />, payRoute);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1\/expenses\/e-1$/);
    });
  });

  it('a remembered guest with no share sees Nothing for Chi in this bill', async () => {
    api({ row: null }, {}, guestChiView(), 'e-1');
    renderAt(<ExpensePay />, payRoute);

    expect(await screen.findByText('Nothing for Chi in this bill')).toBeInTheDocument();
    const switchLink = screen.getByRole('link', { name: 'Not Chi? Switch' });
    expect(switchLink.getAttribute('href')).toMatch(/^\/t\/t-1\/who\?expense=e-1&next=/);
    const seeGroupLink = screen.getByRole('link', { name: 'See the group' });
    expect(seeGroupLink.getAttribute('href')).toBe('/t/t-1');
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1/pay');
  });

  it('a signed-in member with no share sees Nothing for Minh in this bill, without a switch', async () => {
    const e3Route = {
      route: '/t/t-1/expenses/e-3/pay',
      path: '/t/:tripId/expenses/:expenseId/pay',
    };
    api({ row: null }, {}, tripView(), 'e-3');
    renderAt(<ExpensePay />, e3Route);

    expect(await screen.findByText('Nothing for Minh in this bill')).toBeInTheDocument();
    expect(screen.queryByText(/Switch/)).not.toBeInTheDocument();
    const seeGroupLink = screen.getByRole('link', { name: 'See the group' });
    expect(seeGroupLink).toBeInTheDocument();
    expect(seeGroupLink.getAttribute('href')).toBe('/t/t-1');
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-3/pay');
  });
});
