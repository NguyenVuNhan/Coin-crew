import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpensePayView, PayInfo, TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, PIDS } from '../../test/fixtures';
import { WhoPaidSheet } from '../WhoPaidSheet';
import { ExpensePay } from '../../screens/ExpensePay';

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

describe('WhoPaidSheet', () => {
  it('whole row reports remaining with viewer', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const row: ExpensePayView['row'] = {
      participantId: 'p-lan',
      name: 'Lan',
      isMember: true,
      slots: 2,
      share: 85000,
      remaining: 85000,
      tiles: [{ gender: 'M', amount: 45000 }],
    };

    render(
      <WhoPaidSheet
        open={true}
        onClose={onClose}
        row={row}
        viewer="self"
        onReport={onReport}
      />,
    );

    const wholeBtn = screen.getByRole('button', { name: "All of Lan's share · 85.000₫" });
    expect(wholeBtn).toBeInTheDocument();
    await userEvent.click(wholeBtn);

    expect(onReport).toHaveBeenCalledWith({ amount: 85000, paidBy: 'self' });
    expect(onClose).toHaveBeenCalled();
  });

  it('slot tile reports tile amount as friend', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const row: ExpensePayView['row'] = {
      participantId: 'p-lan',
      name: 'Lan',
      isMember: true,
      slots: 2,
      share: 85000,
      remaining: 85000,
      tiles: [{ gender: 'M', amount: 45000 }],
    };

    render(
      <WhoPaidSheet
        open={true}
        onClose={onClose}
        row={row}
        viewer="self"
        onReport={onReport}
      />,
    );

    const slotBtn = screen.getByRole('button', { name: 'Only my part · 45.000₫' });
    expect(slotBtn).toBeInTheDocument();
    await userEvent.click(slotBtn);

    expect(onReport).toHaveBeenCalledWith({ amount: 45000, paidBy: 'friend' });
    expect(onClose).toHaveBeenCalled();
  });

  it('other amount over remaining shows tooMuch and does not report', async () => {
    const onReport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const row: ExpensePayView['row'] = {
      participantId: 'p-lan',
      name: 'Lan',
      isMember: true,
      slots: 2,
      share: 85000,
      remaining: 85000,
      tiles: [{ gender: 'M', amount: 45000 }],
    };

    render(
      <WhoPaidSheet
        open={true}
        onClose={onClose}
        row={row}
        viewer="self"
        onReport={onReport}
      />,
    );

    const otherBtn = screen.getByRole('button', { name: 'Other amount' });
    await userEvent.click(otherBtn);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '100000');

    const confirmBtn = screen.getByRole('button', { name: 'Paid 100.000₫' });
    await userEvent.click(confirmBtn);

    expect(screen.getByText('At most 85.000₫')).toBeInTheDocument();
    expect(onReport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    // Now correct to valid amount
    await userEvent.clear(input);
    await userEvent.type(input, '50000');
    expect(screen.queryByText('At most 85.000₫')).toBeNull();

    const validConfirmBtn = screen.getByRole('button', { name: 'Paid 50.000₫' });
    await userEvent.click(validConfirmBtn);

    expect(onReport).toHaveBeenCalledWith({ amount: 50000, paidBy: 'self' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ExpensePay with slots 1 reports directly without the sheet', async () => {
    const { calls } = api(
      expensePayView({
        row: {
          participantId: PIDS.C,
          name: 'Chi',
          isMember: false,
          slots: 1,
          share: 85000,
          remaining: 85000,
          tiles: [],
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

    const btn = await screen.findByRole('button', { name: "I've paid" });
    await userEvent.click(btn);

    await waitFor(() => {
      const postCall = calls.find((c) => c.path === '/api/trips/t-1/expenses/e-1/pay-report');
      expect(postCall).toBeDefined();
      expect(postCall?.body).toEqual({ amount: 85000, paidBy: 'self' });
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ExpensePay with slots >= 2 opens the sheet on I\'ve paid', async () => {
    api(
      expensePayView({
        row: {
          participantId: 'p-lan',
          name: 'Lan',
          isMember: true,
          slots: 2,
          share: 85000,
          remaining: 85000,
          tiles: [{ gender: 'M', amount: 45000 }],
        },
      }),
    );
    renderAt(<ExpensePay />, payRoute);

    const btn = await screen.findByRole('button', { name: "I've paid" });
    await userEvent.click(btn);

    expect(await screen.findByRole('dialog', { name: 'Who are you paying for?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "All of Lan's share · 85.000₫" })).toBeInTheDocument();
  });
});
