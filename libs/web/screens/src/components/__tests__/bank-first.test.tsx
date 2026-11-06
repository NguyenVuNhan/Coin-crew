import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseView } from '@cc/core';
import { mockApi, renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { PIDS, guestChiView, tripView, viewerView } from '../../test/fixtures';
import { bankDetailsHref, bankFirstSkipped, needsBankFirst, skipBankFirst } from '../../lib/bankFirst';
import { InviteSheet } from '../InviteSheet';
import { ExpenseDetails } from '../ExpenseDetails';

function makeSportExpense(overrides: Partial<ExpenseView> = {}): ExpenseView {
  return {
    id: 'e-sport-1',
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
      { participantId: PIDS.A, amount: 100000, inputValue: 100000 },
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
          { participantId: PIDS.A, maleSlots: 1, femaleSlots: 0 },
          { participantId: PIDS.C, maleSlots: 0, femaleSlots: 1 },
        ],
        maleSlotRate: 100000,
        femaleSlotRate: 100000,
      },
    },
    ...overrides,
  };
}

describe('bank-first prompt and guard', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApi({
      'GET /api/trips/t-1/pay/p-minh': {
        to: { id: PIDS.M, name: 'Minh' },
        amount: 0,
        bankState: 'none',
        bank: null,
        refCode: 'CAU LONG T5',
        payload: null,
        inFlight: [],
      },
      'GET /api/trips/t-1/pay/p-chi': {
        to: { id: PIDS.C, name: 'Chi' },
        amount: 0,
        bankState: 'none',
        bank: null,
        refCode: 'CAU LONG T5',
        payload: null,
        inFlight: [],
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('needsBankFirst: only when my own bank details are missing', () => {
    // none -> true
    const noneView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
    });
    expect(needsBankFirst(noneView)).toBe(true);

    // pending -> false
    const pendingView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'pending' } : p)),
    });
    expect(needsBankFirst(pendingView)).toBe(false);

    // approved -> false
    const approvedView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'approved' } : p)),
    });
    expect(needsBankFirst(approvedView)).toBe(false);

    // no participant -> false
    const viewer = viewerView();
    expect(needsBankFirst(viewer)).toBe(false);

    const ghostParticipant = tripView({
      me: { ...tripView().me, participantId: 'p-ghost' },
    });
    expect(needsBankFirst(ghostParticipant)).toBe(false);
  });

  it('remembers Share anyway per group and survives blocked storage', () => {
    skipBankFirst('t-1');
    expect(bankFirstSkipped('t-1')).toBe(true);
    expect(bankFirstSkipped('t-2')).toBe(false);

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });

    expect(() => skipBankFirst('t-3')).not.toThrow();
    expect(bankFirstSkipped('t-3')).toBe(false);

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('ExpenseDetails with a sport bill paid by me (Minh) and Minh\'s bank: \'none\', desktop pointer: clicking "Share bill & QR" opens a dialog named "Add your bank details first?" and nothing is copied yet; "Share anyway" copies the message; clicking "Share bill & QR" again copies at once with no dialog', async () => {
    mockMedia({ mouse: true });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const sportExpense = makeSportExpense({ payerId: PIDS.M });
    const view = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
      expenses: [sportExpense],
    });

    renderAt(<ExpenseDetails view={view} expenseId={sportExpense.id} onClose={() => {}} />);

    const shareBtn = screen.getByRole('button', { name: 'Share bill & QR' });
    await userEvent.click(shareBtn);

    const dialog = await screen.findByRole('dialog', { name: 'Add your bank details first?' });
    expect(dialog).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();

    const anywayBtn = within(dialog).getByRole('button', { name: 'Share anyway' });
    await userEvent.click(anywayBtn);

    expect(writeText).toHaveBeenCalledTimes(1);

    // Clicking "Share bill & QR" again copies at once with no dialog
    await userEvent.click(shareBtn);
    expect(screen.queryByRole('dialog', { name: 'Add your bank details first?' })).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('Add bank details goes to the bank page', async () => {
    mockMedia({ mouse: true });
    const sportExpense = makeSportExpense({ payerId: PIDS.M });
    const view = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
      expenses: [sportExpense],
    });

    renderAt(<ExpenseDetails view={view} expenseId={sportExpense.id} onClose={() => {}} />);

    const shareBtn = screen.getByRole('button', { name: 'Share bill & QR' });
    await userEvent.click(shareBtn);

    const dialog = await screen.findByRole('dialog', { name: 'Add your bank details first?' });
    const addLink = within(dialog).getByRole('link', { name: 'Add bank details' });
    expect(addLink).toHaveAttribute('href', '/me/bank');

    // Also assert bankDetailsHref for guests
    const guestView = guestChiView();
    expect(bankDetailsHref(guestView, (path?: string) => `/t/t-1${path ?? ''}`)).toBe('/t/t-1/bank');
  });

  it('pending bank details don\'t ask', async () => {
    mockMedia({ mouse: true });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const sportExpense = makeSportExpense({ payerId: PIDS.M });
    const view = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'pending' } : p)),
      expenses: [sportExpense],
    });

    renderAt(<ExpenseDetails view={view} expenseId={sportExpense.id} onClose={() => {}} />);

    const shareBtn = screen.getByRole('button', { name: 'Share bill & QR' });
    await userEvent.click(shareBtn);

    expect(screen.queryByRole('dialog', { name: 'Add your bank details first?' })).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('a bill someone else paid doesn\'t ask', async () => {
    mockMedia({ mouse: true });
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    const sportExpense = makeSportExpense({ payerId: PIDS.C });
    const view = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
      expenses: [sportExpense],
    });

    renderAt(<ExpenseDetails view={view} expenseId={sportExpense.id} onClose={() => {}} />);

    const shareBtn = screen.getByRole('button', { name: 'Share bill & QR' });
    await userEvent.click(shareBtn);

    expect(screen.queryByRole('dialog', { name: 'Add your bank details first?' })).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('InviteSheet: with Minh\'s bank: \'none\', the "Group link" block shows "Add your bank details first?" and an "Add bank details" link to /me/bank, and its Share button still works; with bank: \'approved\' the prompt is absent; the "View-only link" block never shows it', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });

    const noneView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
    });

    const { unmount } = renderAt(<InviteSheet view={noneView} open onClose={() => {}} />);

    const sheet = await screen.findByRole('dialog', { name: 'Invite' });
    const groupBlock = within(sheet).getByRole('group', { name: 'Group link' });

    expect(within(groupBlock).getByText('Add your bank details first?')).toBeInTheDocument();
    const addLink = within(groupBlock).getByRole('link', { name: 'Add bank details' });
    expect(addLink).toHaveAttribute('href', '/me/bank');

    const shareBtn = within(groupBlock).getByRole('button', { name: 'Share' });
    expect(shareBtn).toHaveClass('fsl-button--secondary');
    await userEvent.click(shareBtn);
    expect(share).toHaveBeenCalledWith({
      title: 'Đà Lạt · Oct 2026',
      text: 'Join "Đà Lạt · Oct 2026" to split costs:',
      url: `${location.origin}/j/gtok-1?lang=en`,
    });

    const viewBlock = within(sheet).getByRole('group', { name: 'View-only link' });
    expect(within(viewBlock).queryByText('Add your bank details first?')).not.toBeInTheDocument();
    expect(within(viewBlock).queryByRole('link', { name: 'Add bank details' })).not.toBeInTheDocument();

    unmount();

    const approvedView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'approved' } : p)),
    });
    renderAt(<InviteSheet view={approvedView} open onClose={() => {}} />);
    const sheetApproved = await screen.findByRole('dialog', { name: 'Invite' });
    const groupBlockApproved = within(sheetApproved).getByRole('group', { name: 'Group link' });
    expect(within(groupBlockApproved).queryByText('Add your bank details first?')).not.toBeInTheDocument();
    expect(within(groupBlockApproved).queryByRole('link', { name: 'Add bank details' })).not.toBeInTheDocument();
    expect(within(groupBlockApproved).getByRole('button', { name: 'Share' })).toHaveClass('fsl-button--primary');
  });
});
