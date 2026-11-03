import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo, TripView } from '@cc/core';
import { renderAt } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { mockMedia } from '../../test/media';
import { setLang } from '../../i18n';
import { en } from '../../i18n/en';
import { PayQr } from '../PayQr';
import { ExpenseDetails } from '../ExpenseDetails';
import { shareQr } from '../../lib/qr';

vi.mock('../../lib/qr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/qr')>();
  return {
    ...actual,
    qrPngBlob: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
    renderSportBillPng: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
    shareQr: vi.fn(async () => 'shared' as const),
    shareSportBill: vi.fn(async () => 'shared' as const),
  };
});

afterEach(() => {
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

function samplePayInfo(overrides: Partial<PayInfo> = {}): PayInfo {
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

const sampleSportView: TripView = {
  trip: {
    id: 't-sport',
    name: 'Cầu lông T5',
    currency: 'VND',
    preset: 'sport',
    fewestTransfers: true,
    archived: false,
    version: 1,
    total: 300000,
  },
  me: { kind: 'member', participantId: 'p-minh', participantPending: false, isOrganiser: true },
  people: [
    { id: 'p-minh', name: 'Minh', status: 'active', isMember: true, isOrganiser: true, bank: 'approved', gender: 'M' },
    { id: 'p-quang', name: 'Quang', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'M' },
    { id: 'p-chi', name: 'Chi', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'F' },
  ],
  balances: { 'p-minh': 0, 'p-quang': 0, 'p-chi': 0 },
  suggestions: [],
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
  payments: [],
  myBalance: { now: 0, beforePayments: 0, ifPendingApproved: null, waitingConfirm: 0 },
  approvals: [],
  links: { group: 'gtok-sport', view: 'vtok-sport' },
};

describe('ZMP save, card sharing, and bank app fallback', () => {
  it('zmp: Save QR saves to the gallery', async () => {
    setLang('en');
    const fake = fakePlatform();
    const user = userEvent.setup();

    renderAt(<PayQr variant="pay" info={samplePayInfo()} />, { platform: fake });

    const saveBtn = await screen.findByRole('button', { name: 'Download QR' });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(fake.calls.saveImage.length).toBeGreaterThan(0));
    expect(fake.calls.saveImage[0]![1]).toMatch(/^vietqr-/);
    expect(await screen.findByText('QR saved to your photos')).toBeInTheDocument();
  });

  it('zmp: failed gallery save shows the failure text', async () => {
    setLang('en');
    const fake = fakePlatform({
      saveImage: vi.fn(async () => 'failed' as const),
    });
    const user = userEvent.setup();

    renderAt(<PayQr variant="pay" info={samplePayInfo()} />, { platform: fake });

    const saveBtn = await screen.findByRole('button', { name: 'Download QR' });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    expect(await screen.findByText(en['pay.shareFailed'])).toBeInTheDocument();
  });

  it('zmp: bank app blocked shows how to open it by hand', async () => {
    setLang('en');
    mockMedia({ coarse: true });
    const fake = fakePlatform({
      openExternal: vi.fn(async () => 'blocked' as const),
    });
    const user = userEvent.setup();

    renderAt(<PayQr variant="pay" info={samplePayInfo()} />, { platform: fake });

    const openBtn = await screen.findByRole('button', { name: 'Open bank app' });
    await waitFor(() => expect(openBtn).toBeEnabled());
    await user.click(openBtn);

    const picker = await screen.findByRole('dialog', { name: 'Choose your bank' });
    const bankBtn = within(picker).getAllByRole('button').find((b) => b.classList.contains('fsl-bank-row'));
    expect(bankBtn).toBeDefined();
    await user.click(bankBtn!);

    await waitFor(() => expect(fake.calls.openExternal.length).toBe(1), { timeout: 2000 });
    expect(fake.calls.openExternal[0]![0]).toMatch(/^https:\/\/dl\.vietqr\.io\/pay\?app=/);
    await waitFor(() => expect(document.querySelector('[data-step="2"]')).toHaveAttribute('data-state', 'open-failed'));
    expect(screen.getByText(/yourself, then Scan QR/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });

  it('zmp: sport bill saves the picture and shares a card', async () => {
    setLang('en');
    const fake = fakePlatform();
    const user = userEvent.setup();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/pay/')) {
          return Response.json({
            to: { id: 'p-minh', name: 'Minh' },
            amount: 0,
            bankState: 'ok',
            bank: BANK,
            refCode: 'CAU LONG T5',
            payload: PAYLOAD,
            inFlight: [],
          });
        }
        return Response.json(sampleSportView);
      }),
    );

    renderAt(
      <ExpenseDetails
        view={sampleSportView}
        expenseId="e-sport-1"
        onClose={() => {}}
      />,
      { platform: fake },
    );

    const shareBtn = await screen.findByRole('button', { name: 'Share bill & QR' });
    await waitFor(() => expect(shareBtn).toBeEnabled());
    await user.click(shareBtn);

    await waitFor(() => expect(fake.calls.saveImage.length).toBe(1));
    expect(fake.calls.saveImage[0]![1]).toMatch(/^bill-/);

    await waitFor(() => expect(fake.calls.share.length).toBe(1));
    const card = fake.calls.share[0]![0] as { path: string };
    expect(card.path).toContain('/expenses/');

    expect(await screen.findByText(en['pay.shareSaved'])).toBeInTheDocument();
  });

  it('web: Download QR saves through the browser platform', async () => {
    setLang('en');
    const user = userEvent.setup();
    const web = fakePlatform({ kind: 'web' });

    renderAt(<PayQr variant="pay" info={samplePayInfo()} />, { platform: web });

    const saveBtn = await screen.findByRole('button', { name: 'Download QR' });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    await user.click(saveBtn);

    await waitFor(() => expect(web.calls.saveImage).toHaveLength(1));
    expect(web.calls.saveImage[0]![1]).toBe('vietqr-DALAT-C7K2.png');
  });

  it('zmp: receive variant share button saves to gallery without shareQr', async () => {
    setLang('en');
    const fake = fakePlatform();
    const user = userEvent.setup();

    renderAt(<PayQr variant="receive" shareText="Nhắc bạn" info={samplePayInfo()} />, { platform: fake });

    const shareBtn = await screen.findByRole('button', { name: 'Share' });
    await waitFor(() => expect(shareBtn).toBeEnabled());
    await user.click(shareBtn);

    await waitFor(() => expect(fake.calls.saveImage.length).toBe(1));
    expect(fake.calls.saveImage[0]![1]).toMatch(/^vietqr-/);
    expect(shareQr).not.toHaveBeenCalled();
    expect(await screen.findByText('QR saved to your photos')).toBeInTheDocument();
  });

});
