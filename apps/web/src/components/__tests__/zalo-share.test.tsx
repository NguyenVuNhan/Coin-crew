import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PayInfo, TripView } from '@fsl/core';
import { renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { setLang } from '../../i18n';
import { en } from '../../i18n/en';
import { PayQr } from '../PayQr';
import { BankAppSheet } from '../BankAppSheet';
import { TripRoute } from '../../screens/TripRoute';
import { saveQr, shareQr, shareSportBill } from '../../lib/qr';
import { copyText } from '../../lib/clipboard';

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

vi.mock('../../lib/clipboard', () => ({
  copyText: vi.fn(async () => true),
}));

const ZALO_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Zalo/12.0';
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

let uaSpy: MockInstance | undefined;

afterEach(() => {
  uaSpy?.mockRestore();
  uaSpy = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const PAYLOAD =
  '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572';
const BANK = {
  bin: '970407',
  bankName: 'Techcombank',
  accountNumber: '19031234565678',
  accountNumberMasked: '1903 •••• 5678',
  holderName: 'NGUYEN VAN MINH',
};

function payInfo(overrides: Partial<PayInfo> = {}): PayInfo {
  return {
    to: { id: 'p-minh', name: 'Minh' },
    amount: 1245000,
    bankState: 'ok',
    bank: BANK,
    refCode: 'DALAT C7K2',
    payload: PAYLOAD,
    inFlight: [],
    ...overrides,
  };
}

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
  links: { group: 'gtok-sport', view: 'vtok-sport' },
};

const viewWithSportExpense: TripView = {
  ...baseSportView,
  expenses: [
    {
      id: 'e-sport-1',
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

describe('Zalo webview picture sharing', () => {
  it('Save QR opens the picture sheet inside Zalo', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    mockMedia({});
    const user = userEvent.setup();

    renderAt(<PayQr variant="pay" info={payInfo()} />);

    const saveBtn = await screen.findByRole('button', { name: 'Save QR' });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    const dialog = await screen.findByRole('dialog', { name: 'Save the picture' });
    expect(dialog).toBeInTheDocument();
    const img = await within(dialog).findByRole('img');
    expect(img).toBeInTheDocument();
    expect(saveQr).not.toHaveBeenCalled();
    expect(copyText).not.toHaveBeenCalled();
  });

  it('Share copies the reminder and opens the sheet inside Zalo', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    mockMedia({});
    const user = userEvent.setup();

    renderAt(<PayQr variant="receive" shareText="Nhắc Chi" info={payInfo()} />);

    const shareBtn = await screen.findByRole('button', { name: 'Share' });
    await waitFor(() => expect(shareBtn).toBeEnabled());
    await user.click(shareBtn);

    const dialog = await screen.findByRole('dialog', { name: 'Save the picture' });
    expect(dialog).toBeInTheDocument();
    expect(copyText).toHaveBeenCalledWith('Nhắc Chi');
    expect(shareQr).not.toHaveBeenCalled();
  });

  it('Share bill & QR copies the message and opens the sheet inside Zalo', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    setLang('en');
    mockMedia({});
    const user = userEvent.setup();

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

    const shareBillBtn = await screen.findByRole('button', { name: 'Share bill & QR' });
    await waitFor(() => expect(shareBillBtn).toBeEnabled());
    await user.click(shareBillBtn);

    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('Court 300.000₫'));
    expect(shareSportBill).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Save the picture' });
    expect(dialog).toBeInTheDocument();
  });

  it('outside Zalo the old paths run', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME_UA);
    mockMedia({});
    const user = userEvent.setup();

    const payRender = renderAt(<PayQr variant="pay" info={payInfo()} />);
    const saveBtn = await screen.findByRole('button', { name: 'Save QR' });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    expect(saveQr).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Save the picture' })).toBeNull();
    payRender.unmount();

    renderAt(<PayQr variant="receive" shareText="Nhắc Chi" info={payInfo()} />);
    const shareBtn = await screen.findByRole('button', { name: 'Share' });
    await waitFor(() => expect(shareBtn).toBeEnabled());
    await user.click(shareBtn);

    expect(shareQr).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Save the picture' })).toBeNull();
  });

  it('the bank app sheet shows the Zalo hint only in Zalo', () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    const zaloRender = renderAt(<BankAppSheet open onClose={() => {}} />);
    expect(screen.getByText(en['pay.zaloBankHint'])).toBeInTheDocument();
    zaloRender.unmount();

    uaSpy.mockReturnValue(CHROME_UA);
    renderAt(<BankAppSheet open onClose={() => {}} />);
    expect(screen.queryByText(en['pay.zaloBankHint'])).toBeNull();
  });
});
