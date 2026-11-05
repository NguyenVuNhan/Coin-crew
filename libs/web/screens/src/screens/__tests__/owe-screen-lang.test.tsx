import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PaymentView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { PIDS, guestChiView } from '../../test/fixtures';
import { App } from '../../App';
import { SportBillTable } from '../../components/SportBillTable';
import type { SportBillCalc } from '../../lib/sportBill';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('en');
});

describe('OweScreen & SportBillTable language and formatting', () => {
  it("the pay link takes the group's language", async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': {
        ...guestChiView(),
        trip: { ...guestChiView().trip, defaultLang: 'vi' },
        suggestions: [
          { fromId: PIDS.C, toId: PIDS.M, amount: 1000000 },
          { fromId: PIDS.C, toId: PIDS.B, amount: 245000 },
        ],
      },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    expect(await screen.findByRole('heading', { name: 'Chi ơi, bạn cần trả' })).toBeInTheDocument();
  });

  it('the pay link shows the language button', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': {
        ...guestChiView(),
        suggestions: [
          { fromId: PIDS.C, toId: PIDS.M, amount: 1000000 },
          { fromId: PIDS.C, toId: PIDS.B, amount: 245000 },
        ],
      },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    expect(await screen.findByRole('button', { name: /switch to/i })).toBeInTheDocument();
  });

  it("only waiting payments: the title is the group's name", async () => {
    const waitingPayment: PaymentView = {
      id: 'pay-1',
      fromId: PIDS.C,
      toId: PIDS.M,
      amountClaimed: 1245000,
      amountConfirmed: null,
      status: 'says_paid',
      notArrived: false,
      createdAt: new Date().toISOString(),
    };
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': { ...guestChiView(), suggestions: [], payments: [waitingPayment] },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    expect(await screen.findByRole('heading', { name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for Minh to confirm')).toBeInTheDocument();
    expect(screen.queryByText(/, you owe$/)).toBeNull();
  });

  it('per-slot rates sit in separate no-wrap pairs', () => {
    setLang('en');
    const calc: SportBillCalc = {
      court: 0,
      shuttlecocksTotal: 0,
      extra: 0,
      totalFemaleSlots: 1,
      totalMaleSlots: 1,
      femaleSlotRate: 105000,
      maleSlotRate: 120000,
      participants: [
        {
          participantId: 'p-1',
          name: 'Player 1',
          rosterGender: 'F',
          femaleSlots: 1,
          maleSlots: 0,
          fixedAmount: null,
          amount: 105000,
        },
        {
          participantId: 'p-2',
          name: 'Player 2',
          rosterGender: 'M',
          femaleSlots: 0,
          maleSlots: 1,
          fixedAmount: null,
          amount: 120000,
        },
      ],
    };
    const { container } = render(<SportBillTable calc={calc} total={225000} meId={null} />);

    const perSlotRow = container.querySelector('.fsl-sport-table__row--per-slot');
    expect(perSlotRow).not.toBeNull();

    const cell = perSlotRow!.querySelector('td')!;
    expect(cell).not.toHaveClass('whitespace-nowrap');

    const children = Array.from(cell.children).filter((el) => el.classList.contains('whitespace-nowrap'));
    expect(children).toHaveLength(2);
    expect(children[0]).toHaveTextContent('F 105.000₫');
    expect(children[1]).toHaveTextContent('M 120.000₫');
    expect(children[0].textContent).toBe('F 105.000₫');
    expect(children[1].textContent).toBe('M 120.000₫');
  });
});
