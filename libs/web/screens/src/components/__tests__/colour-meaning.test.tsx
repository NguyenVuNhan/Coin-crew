import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { BankApp, JoiningMergeRequest, PayInfo, TripView, ExpenseView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { ExpenseDetails } from '../ExpenseDetails';
import { Settings } from '../../screens/Settings';
import { JoinRequestSheet } from '../JoinRequestSheet';
import { BankHandoffSheet } from '../BankHandoffSheet';
import { PayQr } from '../PayQr';
import { SportBillTable } from '../SportBillTable';
import { sportBillCalc } from '../../lib/sportBill';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fixtureApp: BankApp = {
  appId: 'acb',
  appName: 'ACB ONE',
  bankName: 'x',
  bankShortName: 'ACB',
  bankCode: 'ACB',
  monthlyInstall: 1,
};

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

const sportTripView: TripView = {
  trip: {
    id: 't-sport',
    name: 'Cầu lông T5',
    currency: 'VND',
    preset: 'sport',
    fewestTransfers: true,
    archived: false,
    version: 1,
    total: 380000,
  },
  me: { kind: 'member', participantId: 'p-minh', participantPending: false, isOrganiser: true },
  people: [
    { id: 'p-minh', name: 'Minh', status: 'active', isMember: true, isOrganiser: true, bank: 'none', gender: 'M' },
    { id: 'p-an', name: 'An', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'M' },
    { id: 'p-chi', name: 'Chi', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'F' },
  ],
  balances: { 'p-minh': 0, 'p-an': 0, 'p-chi': 0 },
  suggestions: [],
  expenses: [],
  payments: [],
  myBalance: { now: 0, beforePayments: 0, ifPendingApproved: null, waitingConfirm: 0 },
  approvals: [],
  links: { group: 'gtok-sport', view: 'vtok-sport' },
};

const sportExpense: ExpenseView = {
  id: 'e-sport-1',
  description: 'Badminton Session',
  amount: 380000,
  spentOn: '2026-11-05',
  payerId: 'p-minh',
  mode: 'amounts',
  status: 'approved',
  rejectReason: null,
  disabledByName: null,
  createdById: 'p-minh',
  shares: [
    { participantId: 'p-minh', amount: 190000, inputValue: 190000 },
    { participantId: 'p-an', amount: 190000, inputValue: 190000 },
  ],
  meta: {
    sport: {
      court: 240000,
      shuttlecocks: [{ qty: 5, unitPrice: 28000 }],
      extra: 0,
      rule: { kind: 'equal' },
      entries: [
        { participantId: 'p-minh', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'p-an', maleSlots: 1, femaleSlots: 0 },
      ],
      maleSlotRate: 190000,
      femaleSlotRate: 190000,
    },
  },
};

describe('colour meaning', () => {
  it('Disable is a Lychee-text ghost, not red on mint', () => {
    mockApi({});
    renderAt(<ExpenseDetails view={tripView()} expenseId="e-1" onClose={() => {}} />);

    const disableBtn = screen.getByRole('button', { name: 'Disable' });
    expect(disableBtn).toBeInTheDocument();
    expect(disableBtn).toHaveClass('text-danger');
    expect(disableBtn).toHaveClass('fsl-details__action--danger');
    expect(disableBtn).toHaveClass('fsl-button--ghost');
    expect(disableBtn.className).not.toContain('bg-secondary');
  });

  it('the danger zone heading is sentence case', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    const heading = await screen.findByRole('heading', { name: 'Danger zone' });
    expect(heading).toBeInTheDocument();
    expect(heading.className).not.toContain('uppercase');
    expect(heading).toHaveClass('fsl-settings__heading', 'text-sm', 'font-semibold', 'text-muted-foreground');
  });

  it('info notices become Jade Mist (bg-secondary text-secondary-foreground)', () => {
    const request: JoiningMergeRequest = {
      id: 'j-1',
      expiresAt: '2026-11-10T00:00:00Z',
      zalo: { name: 'Thao', avatarUrl: null },
      groups: [{ tripId: 't-1', name: 'Đà Lạt Trip' }],
      collapsing: [],
    };
    const { unmount: unmountJoin } = renderAt(
      <JoinRequestSheet request={request} open={true} onClose={() => {}} />,
    );
    const joinNotice = screen.getByText('These groups move to your account:').closest('div');
    expect(joinNotice).toHaveClass('bg-secondary', 'text-secondary-foreground');
    expect(joinNotice?.className).not.toContain('bg-warning-soft');
    expect(joinNotice?.className).not.toContain('text-warning-foreground');
    unmountJoin();

    const { unmount: unmountBank } = renderAt(
      <BankHandoffSheet
        open={true}
        onClose={() => {}}
        app={fixtureApp}
        makePng={async () => new Blob(['x'], { type: 'image/png' })}
        fileName="test.png"
      />,
    );
    const bankTip = screen.getByText(/Scan QR → upload picture → pick the saved QR/i);
    expect(bankTip).toHaveClass('bg-secondary', 'text-secondary-foreground');
    expect(bankTip.className).not.toContain('bg-warning-soft');
    unmountBank();

    const { container: payContainer, unmount: unmountPay } = renderAt(
      <PayQr variant="pay" info={fixturePayInfo} />,
    );
    const memo = payContainer.querySelector('.fsl-pay-qr__memo');
    expect(memo).not.toBeNull();
    expect(memo).toHaveClass('bg-secondary', 'text-secondary-foreground');
    expect(memo?.className).not.toContain('bg-warning-soft');
    expect(memo?.className).not.toContain('text-warning-foreground');
    unmountPay();
  });

  it('sport bill totals rows use muted styling (bg-muted text-foreground font-semibold)', () => {
    const calc = sportBillCalc(sportTripView, sportExpense)!;
    const { container } = renderAt(<SportBillTable calc={calc} total={sportExpense.amount} meId="p-minh" />);

    const totalSlotsRow = container.querySelector('.fsl-sport-table__row--total-slots');
    expect(totalSlotsRow).not.toBeNull();
    expect(totalSlotsRow).toHaveClass('bg-muted', 'text-foreground', 'font-semibold');
    expect(totalSlotsRow?.className).not.toContain('bg-warning-soft');
    expect(totalSlotsRow?.className).not.toContain('text-warning-foreground');

    const perSlotRow = container.querySelector('.fsl-sport-table__row--per-slot');
    expect(perSlotRow).not.toBeNull();
    expect(perSlotRow).toHaveClass('bg-muted', 'text-foreground', 'font-semibold');
    expect(perSlotRow?.className).not.toContain('bg-warning-soft');
    expect(perSlotRow?.className).not.toContain('text-warning-foreground');
  });
});
