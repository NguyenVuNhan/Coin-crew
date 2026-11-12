import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HistoryLine, PayInfo, RequestView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { RequestPage } from '../RequestPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const pay: PayInfo = {
  to: { id: 'led-o', name: 'Nhan' },
  amount: 120000,
  bankState: 'ok',
  bank: {
    bin: '970436',
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountNumberMasked: '••••6789',
    holderName: 'NGUYEN NHAN',
  },
  refCode: 'FSL1',
  payload: '000201...',
  inFlight: [],
};

function line(id: string, tripId: string, over: Partial<HistoryLine> = {}): HistoryLine {
  return {
    id,
    kind: 'expense',
    tripId,
    title: id,
    date: '2026-11-01',
    createdAt: '2026-11-01T10:00:00Z',
    amount: 100000,
    paidBy: 'owner',
    ownerShare: 50000,
    otherShare: 50000,
    effect: 50000,
    state: 'counted',
    ...over,
  };
}

function view(extra: Partial<RequestView> = {}): RequestView {
  return {
    ownerName: 'Nhan',
    total: 120000,
    settled: false,
    settlementWaiting: false,
    items: [
      {
        tripId: 't-direct',
        tripName: '',
        kind: 'direct',
        amount: 120000,
        oldestOpenAt: '2026-10-30T10:00:00Z',
        lines: [line('Lunch', 't-direct')],
      },
    ],
    pay,
    ...extra,
  };
}

const three: RequestView['items'] = [
  {
    tripId: 't-direct',
    tripName: '',
    kind: 'direct',
    amount: 100000,
    oldestOpenAt: '2026-10-30T10:00:00Z',
    lines: [line('Lunch', 't-direct')],
  },
  {
    tripId: 't-a',
    tripName: 'Badminton',
    kind: 'group',
    amount: 50000,
    oldestOpenAt: '2026-10-30T10:00:00Z',
    lines: [line('Court', 't-a')],
  },
  {
    tripId: 't-b',
    tripName: 'Đà Lạt',
    kind: 'group',
    amount: -30000,
    oldestOpenAt: '2026-10-30T10:00:00Z',
    lines: [line('Room', 't-b')],
  },
];

describe('RequestPage in the pay page layout', () => {
  it('request page shows Pay <owner>, the amount, I’ve paid', async () => {
    mockApi({ 'GET /api/r/tok': view() });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Pay Nhan' })).toBeInTheDocument();
    const hero = document.querySelector('.fsl-pay__hero');
    expect(hero).not.toBeNull();
    expect(hero).toHaveTextContent(/120\.000/);
    expect(screen.getByTestId('request-paid')).toHaveTextContent('I’ve paid');
    expect(screen.getByText('Tap after the money has left your account.')).toBeInTheDocument();
  });

  it('What this covers (3) opens a sheet with 3 rows and the total', async () => {
    mockApi({ 'GET /api/r/tok': view({ total: 120000, items: three }) });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    const covers = await screen.findByTestId('request-covers');
    expect(covers).toHaveTextContent('What this covers (3)');
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(covers);

    const sheet = screen.getByRole('dialog', { name: 'What makes this up' });
    expect(within(sheet).getByTestId('ledger-row-direct')).toHaveTextContent('Expenses with Nhan');
    expect(within(sheet).getByTestId('ledger-row-t-a')).toHaveTextContent('Badminton');
    expect(within(sheet).getByTestId('ledger-row-t-b')).toHaveTextContent('Đà Lạt');
    const total = sheet.querySelector('.fsl-ledger__total');
    expect(total).not.toBeNull();
    expect(total).toHaveTextContent(/120\.000/);
  });

  it('tapping a row in the sheet expands its compact lines', async () => {
    mockApi({ 'GET /api/r/tok': view({ total: 120000, items: three }) });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    await userEvent.click(await screen.findByTestId('request-covers'));
    const sheet = screen.getByRole('dialog', { name: 'What makes this up' });
    const row = within(sheet).getByTestId('ledger-row-t-a');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(within(sheet).queryByTestId('history-line-Court')).toBeNull();
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(within(sheet).getByTestId('history-line-Court')).toBeInTheDocument();
  });

  it('no bank: shows the no-bank copy', async () => {
    mockApi({ 'GET /api/r/tok': view({ pay: null }) });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(await screen.findByText('Nhan hasn’t added bank details — pay them directly.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Pay Nhan' })).toBeInTheDocument();
    expect(document.querySelector('.fsl-pay__hero')).toHaveTextContent(/120\.000/);
    expect(screen.getByTestId('request-paid')).toBeInTheDocument();
  });
});
