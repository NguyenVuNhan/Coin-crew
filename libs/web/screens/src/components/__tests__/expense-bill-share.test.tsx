import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseView, TripView } from '@cc/core';
import type { LedgerCardInput } from '@cc/web-util/ledgerCard';
import { mockApi, renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView, PIDS } from '../../test/fixtures';
import { ExpenseDetails } from '../ExpenseDetails';

const rendered: LedgerCardInput[] = [];
vi.mock('@cc/web-util/ledgerCard', () => ({
  renderLedgerPng: vi.fn(async (input: LedgerCardInput) => {
    rendered.push(input);
    return new Blob(['png'], { type: 'image/png' });
  }),
}));

const PAYLOAD = '00020101021138580010A000000727012800069704070114190312345656780208QRIBFTTA53037045802VN6304ABCD';

function billInfo(amount: number) {
  return {
    to: { id: PIDS.M, name: 'Minh' },
    amount,
    bankState: 'ok',
    bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '1903', accountNumberMasked: '••03', holderName: 'NGUYEN MINH' },
    refCode: 'HOMESTAY',
    payload: PAYLOAD,
    inFlight: [],
  };
}

function withExpense(view: TripView, id: string, patch: Partial<ExpenseView>): TripView {
  return { ...view, expenses: view.expenses.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

function open(view: TripView, expenseId: string) {
  return renderAt(<ExpenseDetails view={view} expenseId={expenseId} onClose={() => {}} />, {
    route: '/t/t-1/expenses/' + expenseId,
    path: '/t/:tripId/expenses/:expenseId',
  });
}

function phoneShare() {
  const share = vi.fn(async (_data: ShareData) => undefined);
  vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mobile Safari', share, canShare: () => true });
  return share;
}

async function readyButton() {
  const button = await screen.findByRole('button', { name: /Share bill & QR/ });
  await waitFor(() => expect(button.getAttribute('data-qr-ready')).toBe('true'));
  return button;
}

afterEach(() => {
  rendered.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Share bill & QR on a normal expense', () => {
  it('the payer sees it', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: billInfo(800000) });
    open(tripView(), 'e-1');
    expect(await screen.findByRole('button', { name: /Share bill & QR/ })).toBeInTheDocument();
    expect(document.querySelector('.fsl-expense-share')).not.toBeNull();
  });

  it("is hidden for someone who didn't pay", async () => {
    mockMedia({});
    mockApi({});
    open(tripView(), 'e-2');
    await screen.findByText('Lẩu gà lá é');
    expect(document.querySelector('.fsl-expense-share')).toBeNull();
  });

  it('is hidden for a pending expense, a fund-paid expense and an archived group', async () => {
    mockMedia({});
    mockApi({});
    const v = tripView();
    const cases = [
      withExpense(v, 'e-1', { status: 'pending' }),
      withExpense(v, 'e-1', { meta: { paidFromFund: true } }),
      { ...v, trip: { ...v.trip, archived: true } },
    ];
    for (const view of cases) {
      const { unmount } = open(view, 'e-1');
      await screen.findAllByText('Homestay Bloom · 2 nights');
      expect(document.querySelector('.fsl-expense-share')).toBeNull();
      unmount();
    }
  });

  it('equal split: picture hint asks for the amount, payer row is muted', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: billInfo(800000) });
    const share = phoneShare();
    open(tripView(), 'e-1');
    await userEvent.click(await readyButton());
    await waitFor(() => expect(share).toHaveBeenCalled());
    const input = rendered[0]!;
    expect(input.hint).toBe('Scan to send 800.000₫');
    expect(input.total).toBe(3200000);
    const payer = input.rows.find((r) => r.name === 'Minh')!;
    expect(payer.muted).toBe(true);
    expect(payer.tag).toBe('(paid)');
    expect(input.rows.filter((r) => !r.muted)).toHaveLength(3);
  });

  it('uneven split: hint says open the link', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: billInfo(0) });
    phoneShare();
    open(tripView(), 'e-1');
    await userEvent.click(await readyButton());
    await waitFor(() => expect(rendered).toHaveLength(1));
    expect(rendered[0]!.hint).toBe('Open the link for a QR with your exact share');
  });

  it('phone share text links to the expense by root id', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: billInfo(800000) });
    const share = phoneShare();
    open(withExpense(tripView(), 'e-1', { rootId: 'e-1-root' }), 'e-1');
    await userEvent.click(await readyButton());
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0]![0].text).toContain('/j/gtok-1/e/e-1-root');
  });

  it('PC copies then opens the picture sheet', async () => {
    mockMedia({ mouse: true });
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: billInfo(800000) });
    const user = userEvent.setup();
    open(tripView(), 'e-1');
    await user.click(await readyButton());
    expect(await screen.findByText('Message copied. Paste it into a message or group chat.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toContain('/j/gtok-1/e/e-1');
    await waitFor(() => expect(document.querySelector('.fsl-save-image')).not.toBeNull());
  });

  it('a sport expense still shows only the sport button', async () => {
    mockMedia({});
    mockApi({});
    const v = withExpense(tripView(), 'e-1', {
      meta: {
        sport: {
          court: 3200000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [PIDS.M, PIDS.A, PIDS.B, PIDS.C].map((participantId) => ({ participantId, maleSlots: 1, femaleSlots: 0 })),
          maleSlotRate: 800000,
          femaleSlotRate: 800000,
        },
      },
    });
    open(v, 'e-1');
    await screen.findByRole('button', { name: 'Share bill & QR' });
    expect(screen.getAllByRole('button', { name: 'Share bill & QR' })).toHaveLength(1);
    expect(document.querySelector('.fsl-expense-share')).toBeNull();
  });
});
