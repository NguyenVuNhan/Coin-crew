import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, PIDS } from '../../test/fixtures';
import { sportFundView } from '../../test/fundFixtures';
import { PayScreen } from '../../screens/PayScreen';
import { ExpenseForm } from '../../screens/ExpenseForm';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const payRoute = { route: `/t/t-1/pay/${PIDS.M}`, path: '/t/:tripId/pay/:toId' };

const fixturePayInfo: PayInfo = {
  to: { id: PIDS.M, name: 'Minh' },
  amount: 1245000,
  bankState: 'ok',
  bank: {
    bin: '970407',
    bankName: 'Techcombank',
    accountNumber: '19031234565678',
    accountNumberMasked: '1903 •••• 5678',
    holderName: 'NGUYEN VAN MINH',
  },
  refCode: 'DALAT C7K2',
  payload: '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572',
  inFlight: [],
};

describe('colour sweep (PayScreen memo and sport gender icons)', () => {
  it('PayScreen transfer memo uses Jade Mist (bg-secondary) and never Turmeric (bg-warning-soft)', async () => {
    mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: fixturePayInfo,
    });
    const { container, unmount } = renderAt(<PayScreen />, payRoute);
    await screen.findByText('DALAT C7K2');
    const qrMemo = container.querySelector('.fsl-pay__memo');
    expect(qrMemo).not.toBeNull();
    expect(qrMemo).toHaveClass('bg-secondary', 'text-secondary-foreground');
    expect(qrMemo).not.toHaveClass('bg-warning-soft', 'text-warning-foreground');
    unmount();

    mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: {
        ...fixturePayInfo,
        amount: 0,
        payload: null,
        inFlight: [
          {
            id: 'pay-1',
            fromId: PIDS.C,
            toId: PIDS.M,
            amountClaimed: 1245000,
            amountConfirmed: null,
            status: 'says_paid',
            notArrived: false,
            createdAt: '2026-11-05T00:00:00.000Z',
          },
        ],
      },
    });
    const sent = renderAt(<PayScreen />, payRoute);
    await screen.findByText('Payment sent · 1.245.000₫');
    const sentMemo = sent.container.querySelector('.fsl-pay__memo');
    expect(sentMemo).not.toBeNull();
    expect(sentMemo).toHaveClass('bg-secondary', 'text-secondary-foreground');
    expect(sentMemo).not.toHaveClass('bg-warning-soft', 'text-warning-foreground');
  });

  it('sport ExpenseForm gender rule and guest icons use text-muted-foreground and no money or accent colour', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    const { container } = renderAt(<ExpenseForm />, {
      route: '/t/t-1/expenses/new',
      path: '/t/:tripId/expenses/new',
    });

    await userEvent.click(await screen.findByRole('radio', { name: 'VND offset' }));
    const discountFemale = container.querySelector('.fsl-sport-rule-icon--female');
    expect(discountFemale).not.toBeNull();
    expect(discountFemale).toHaveClass('text-muted-foreground');
    expect(discountFemale).not.toHaveClass('text-warning-foreground', 'text-primary');

    await userEvent.click(screen.getByRole('radio', { name: 'Ratio' }));
    await userEvent.click(screen.getByTestId(`sport-share-btn-${PIDS.M}`));

    const femaleIcons = container.querySelectorAll('.fsl-sport-rule-icon--female');
    const maleIcons = container.querySelectorAll('.fsl-sport-rule-icon--male');
    expect(femaleIcons.length).toBe(2);
    expect(maleIcons.length).toBe(2);

    for (const icon of [...femaleIcons, ...maleIcons]) {
      expect(icon).toHaveClass('text-muted-foreground');
      expect(icon).not.toHaveClass('text-warning-foreground', 'text-primary');
    }
  });
});
