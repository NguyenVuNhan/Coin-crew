import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { setLang } from '../../i18n';
import { guestChiView, picker, tripView } from '../../test/fixtures';
import { WhoAreYou, safeTripPath } from '../WhoAreYou';
import { TripRoute } from '../TripRoute';
import { expenseLink, groupLink } from '../../lib/remind';

import { shareSportBill } from '../../lib/qr';

vi.mock('../../lib/qr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/qr')>();
  return {
    ...actual,
    qrPngBlob: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    renderSportBillPng: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    saveQr: vi.fn(async () => undefined),
    shareQr: vi.fn(async () => 'shared' as const),
    shareSportBill: vi.fn(async () => 'shared' as const),
  };
});

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

let uaSpy: MockInstance | undefined;

afterEach(() => {
  uaSpy?.mockRestore();
  uaSpy = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const baseSportView: TripView = {
  trip: { id: 't-sport', name: 'Cầu lông T5', currency: 'VND', preset: 'sport', fewestTransfers: true, archived: false, version: 1, total: 0 },
  me: { kind: 'member', participantId: 'p-minh', participantPending: false, isOrganiser: true },
  people: [
    { id: 'p-minh', name: 'Minh', status: 'active', isMember: true, isOrganiser: true, bank: 'approved', gender: 'M' },
    { id: 'p-quang', name: 'Quang', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'M' },
    { id: 'p-chi', name: 'Chi', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'F' },
  ],
  balances: { 'p-minh': 0, 'p-quang': 0, 'p-chi': 0 },
  suggestions: [],
  expenses: [],
  payments: [],
  myBalance: { now: 0, beforePayments: 0, ifPendingApproved: null, waitingConfirm: 0 },
  approvals: [],
  links: { group: 'gtok-s', view: 'vtok-s' },
};

const viewWithSportExpense: TripView = {
  ...baseSportView,
  expenses: [
    {
      id: 'e-sport-1',
      rootId: 'e-sport-1',
      description: 'Cầu lông tối T5',
      amount: 300000,
      spentOn: '2026-10-17',
      payerId: 'p-minh',
      mode: 'amounts',
      status: 'approved',
      rejectReason: null,
      disabledByName: null,
      createdById: 'p-minh',
      shares: [
        { participantId: 'p-minh', amount: 100000, inputValue: 100000 },
        { participantId: 'p-quang', amount: 100000, inputValue: 100000 },
        { participantId: 'p-chi', amount: 100000, inputValue: 100000 },
      ],
      meta: {
        sport: {
          court: 300000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [
            { participantId: 'p-minh', maleSlots: 1, femaleSlots: 0 },
            { participantId: 'p-quang', maleSlots: 1, femaleSlots: 0 },
            { participantId: 'p-chi', maleSlots: 0, femaleSlots: 1 },
          ],
          maleSlotRate: 100000,
          femaleSlotRate: 100000,
        },
      },
    },
  ],
};

describe('Expense links', () => {
  it('a guest who has not picked is sent to who with next', async () => {
    const guestView: TripView = {
      ...guestChiView(),
      me: { kind: 'guest', participantId: null, participantPending: false, isOrganiser: false },
    };
    mockApi({
      'GET /api/trips/t-1': guestView,
      'GET /api/trips/t-1/version': { version: 3 },
    });

    setLang('en');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function LocProbe() {
      const location = useLocation();
      return <div data-testid="loc">{location.pathname + location.search}</div>;
    }

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/expenses/e-2']}>
          <Routes>
            <Route path="/t/:tripId/expenses/:expenseId" element={<TripRoute />} />
            <Route path="*" element={null} />
          </Routes>
          <LocProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loc')).toHaveTextContent('/t/t-1/who?next=%2Ft%2Ft-1%2Fexpenses%2Fe-2');
    });
  });

  it('after a pick, who returns to next', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'POST /api/trips/t-1/people/pick': null,
    });
    renderAt(<WhoAreYou />, {
      route: '/t/t-1/who?next=%2Ft%2Ft-1%2Fexpenses%2Fe-2',
      path: '/t/:tripId/who',
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Continue as Chi' }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-2');
    });
  });

  it('safeTripPath accepts only this trip', () => {
    expect(safeTripPath('/t/t-1/expenses/e-2', 't-1')).toBe('/t/t-1/expenses/e-2');
    expect(safeTripPath('/t/t-2', 't-1')).toBe('/t/t-1');
    expect(safeTripPath('//evil.com', 't-1')).toBe('/t/t-1');
    expect(safeTripPath('/t/t-1\\x', 't-1')).toBe('/t/t-1');
    expect(safeTripPath(null, 't-1')).toBe('/t/t-1');
  });

  it('expenseLink appends the expense and falls back without a token', () => {
    expect(expenseLink(tripView(), 'e-2')).toMatch(/\/j\/gtok-1\/e\/e-2$/);
    localStorage.clear();
    const noTokenView: TripView = { ...tripView(), links: null };
    expect(expenseLink(noTokenView, 'e-2')).toBe(groupLink(noTokenView));
  });

  it('the bill message links to the expense', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME_UA);
    setLang('en');
    mockMedia({});
    const user = userEvent.setup();
    renderSportExpense();

    const shareBillBtn = await screen.findByRole('button', { name: 'Share bill & QR' });
    await waitFor(() => expect(shareBillBtn).toBeEnabled());
    await user.click(shareBillBtn);

    await waitFor(() => expect(shareSportBill).toHaveBeenCalled());
    expect(vi.mocked(shareSportBill).mock.calls[0]?.[1]).toContain('/j/gtok-s/e/e-sport-1');
  });

  it('on a PC, Share bill & QR copies the message with the link for the group chat', async () => {
    setLang('en');
    mockMedia({ mouse: true });
    const user = userEvent.setup(); // also puts a clipboard stub on navigator
    renderSportExpense();

    const shareBillBtn = await screen.findByRole('button', { name: 'Share bill & QR' });
    await waitFor(() => expect(shareBillBtn).toBeEnabled());
    await user.click(shareBillBtn);

    expect(await screen.findByText('Message and link copied. Paste it in the group chat.')).toBeInTheDocument();
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain('Court 300.000');
    expect(copied).toMatch(/\/j\/gtok-s\/e\/e-sport-1$/);
    expect(shareSportBill).not.toHaveBeenCalled();
  });

  it("the bill's QR is asked for this expense, so an equal split comes with its amount", async () => {
    setLang('en');
    mockMedia({});
    renderSportExpense();

    await screen.findByRole('button', { name: 'Share bill & QR' });
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toContainEqual(
        expect.stringContaining('/pay/p-minh?bill=1&expense=e-sport-1'),
      ),
    );
  });
});

function renderSportExpense(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/pay/p-minh?bill=1')) {
        return Response.json({
          to: { id: 'p-minh', name: 'Minh' },
          amount: 0,
          bankState: 'ok',
          bank: {
            bin: '970407',
            bankName: 'Techcombank',
            accountNumber: '19031234565678',
            accountNumberMasked: '1903 •••• 5678',
            holderName: 'NGUYEN VAN MINH',
          },
          refCode: 'CAU LONG T5',
          payload:
            '00020101021138580010A000000727012800069704070114190312345656780208QRIBFTTA53037045802VN62150811CAU LONG T56304ABCD',
          inFlight: [],
        });
      }
      return Response.json(viewWithSportExpense);
    }),
  );

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/t/t-sport/expenses/e-sport-1']}>
        <Routes>
          <Route path="/t/:tripId/expenses/:expenseId" element={<TripRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
