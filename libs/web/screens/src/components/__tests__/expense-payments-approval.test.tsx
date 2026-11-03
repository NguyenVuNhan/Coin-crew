import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Approval, ExpenseView, PaymentView } from '@cc/core';
import { setLang } from '../../i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { ApprovalItem, approvalKey } from '../ApprovalsCard';
import { ExpensePaymentsApproval } from '../ExpensePaymentsApproval';
import { UndoSnackbarHost } from '../UndoSnackbarHost';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  setLang('en');
});

function makeSportExpense(overrides: Partial<ExpenseView> = {}): ExpenseView {
  return {
    id: 'e-badminton',
    description: 'Badminton court',
    amount: 180000,
    spentOn: '2026-10-10',
    payerId: PIDS.M,
    mode: 'shares',
    status: 'approved',
    rejectReason: null,
    disabledByName: null,
    createdById: PIDS.M,
    shares: [
      { participantId: PIDS.M, amount: 45000, inputValue: 1 },
      { participantId: PIDS.A, amount: 45000, inputValue: 1 },
      { participantId: PIDS.B, amount: 45000, inputValue: 1 },
      { participantId: PIDS.C, amount: 45000, inputValue: 1 },
    ],
    meta: {
      sport: {
        court: 130000,
        shuttlecocks: [{ qty: 1, unitPrice: 50000 }],
        extra: 0,
        rule: { kind: 'discount' as const, femaleDiscount: 5000 },
        entries: [
          { participantId: PIDS.M, maleSlots: 1, femaleSlots: 0 },
          { participantId: PIDS.A, maleSlots: 1, femaleSlots: 0 },
          { participantId: PIDS.B, maleSlots: 1, femaleSlots: 0 },
          { participantId: PIDS.C, maleSlots: 1, femaleSlots: 0 },
        ],
        maleSlotRate: 45000,
        femaleSlotRate: 40000,
      },
    },
    ...overrides,
  };
}

describe('Task 9: Grouped approval card with undo and edit', () => {
  it('renders one row per split person with waiting/confirmed/not reported states', () => {
    const expense = makeSportExpense();
    const payA: PaymentView = {
      id: 'pay-a',
      fromId: PIDS.A,
      toId: PIDS.M,
      amountClaimed: 45000,
      amountConfirmed: null,
      status: 'says_paid',
      expenseId: 'e-badminton',
      notArrived: false,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const payB: PaymentView = {
      id: 'pay-b',
      fromId: PIDS.B,
      toId: PIDS.M,
      amountClaimed: 45000,
      amountConfirmed: 45000,
      status: 'confirmed',
      expenseId: 'e-badminton',
      notArrived: false,
      createdAt: '2026-10-10T09:00:00Z',
    };
    const view = tripView({
      expenses: [expense],
      payments: [payA, payB],
      approvals: [
        {
          kind: 'expense_payments',
          expenseId: 'e-badminton',
          paymentIds: ['pay-a'],
        },
      ],
    });

    renderAt(
      <ExpensePaymentsApproval
        view={view}
        expenseId="e-badminton"
        paymentIds={['pay-a']}
      />,
    );

    // Header: description and reported count
    expect(screen.getByText(/Badminton court/)).toBeInTheDocument();
    expect(screen.getByText('1 reported paying')).toBeInTheDocument();

    // Progress bar
    // 180.000₫ minus the payer's own 45.000₫ share.
    expect(screen.getByText(/45\.000₫\s*\/\s*135\.000₫\s*received/)).toBeInTheDocument();
    expect(screen.getByText('1 not paid yet')).toBeInTheDocument();

    // Split people rows (An, Bình, Chi)
    expect(screen.getByText('An')).toBeInTheDocument();
    expect(screen.getByText('Bình')).toBeInTheDocument();
    expect(screen.getByText('Chi')).toBeInTheDocument();

    // Payer (Minh) is excluded from split rows
    expect(screen.queryByTestId(`epa-tick-${PIDS.M}`)).toBeNull();

    // Waiting tick for An (outline, not filled with bg-success)
    const tickA = screen.getByTestId(`epa-tick-${PIDS.A}`);
    expect(tickA).not.toHaveClass('bg-success');

    // Confirmed tick for Bình (filled with bg-success)
    const tickB = screen.getByTestId(`epa-tick-${PIDS.B}`);
    expect(tickB).toHaveClass('bg-success');

    // Not reported for Chi: a bell button that shares a reminder with this expense's pay link
    expect(screen.getByRole('button', { name: /Remind Chi/i })).toBeInTheDocument();
  });

  it('tick confirms; snackbar undo calls revise undo', async () => {
    const expense = makeSportExpense();
    const payA: PaymentView = {
      id: 'pay-a',
      fromId: PIDS.A,
      toId: PIDS.M,
      amountClaimed: 45000,
      amountConfirmed: null,
      status: 'says_paid',
      expenseId: 'e-badminton',
      notArrived: false,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const view = tripView({
      expenses: [expense],
      payments: [payA],
      approvals: [
        {
          kind: 'expense_payments',
          expenseId: 'e-badminton',
          paymentIds: ['pay-a'],
        },
      ],
    });

    const { calls } = mockApi({
      'POST /api/trips/t-1/payments/pay-a/confirm': null,
      'POST /api/trips/t-1/payments/pay-a/revise': null,
    });

    renderAt(
      <>
        <ExpensePaymentsApproval
          view={view}
          expenseId="e-badminton"
          paymentIds={['pay-a']}
        />
        <UndoSnackbarHost />
      </>,
    );

    // Click the tick button for An
    await userEvent.click(screen.getByTestId(`epa-tick-${PIDS.A}`));

    // POST /confirm called
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' && c.path === '/api/trips/t-1/payments/pay-a/confirm',
        ),
      ).toBe(true);
    });

    // Snackbar with undo button appears
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Confirmed An/);
    const undoBtn = screen.getByRole('button', { name: /undo/i });
    expect(undoBtn).toBeInTheDocument();

    // Click undo
    await userEvent.click(undoBtn);

    // POST /revise with action: 'undo' called
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            c.path === '/api/trips/t-1/payments/pay-a/revise' &&
            (c.body as { action?: string })?.action === 'undo',
        ),
      ).toBe(true);
    });
  });

  it('confirm all confirms each waiting payment', async () => {
    const expense = makeSportExpense();
    const payA: PaymentView = {
      id: 'pay-a',
      fromId: PIDS.A,
      toId: PIDS.M,
      amountClaimed: 45000,
      amountConfirmed: null,
      status: 'says_paid',
      expenseId: 'e-badminton',
      notArrived: false,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const payB: PaymentView = {
      id: 'pay-b',
      fromId: PIDS.B,
      toId: PIDS.M,
      amountClaimed: 45000,
      amountConfirmed: null,
      status: 'says_paid',
      expenseId: 'e-badminton',
      notArrived: false,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const view = tripView({
      expenses: [expense],
      payments: [payA, payB],
      approvals: [
        {
          kind: 'expense_payments',
          expenseId: 'e-badminton',
          paymentIds: ['pay-a', 'pay-b'],
        },
      ],
    });

    const { calls } = mockApi({
      'POST /api/trips/t-1/payments/pay-a/confirm': null,
      'POST /api/trips/t-1/payments/pay-b/confirm': null,
    });

    renderAt(
      <ExpensePaymentsApproval
        view={view}
        expenseId="e-badminton"
        paymentIds={['pay-a', 'pay-b']}
      />,
    );

    // Confirm All footer button
    const confirmAllBtn = screen.getByRole('button', { name: /Got all/i });
    expect(confirmAllBtn).toBeInTheDocument();

    // Click confirm all
    await userEvent.click(confirmAllBtn);

    // Both waiting payments confirmed
    await waitFor(() => {
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' && c.path === '/api/trips/t-1/payments/pay-a/confirm',
        ),
      ).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' && c.path === '/api/trips/t-1/payments/pay-b/confirm',
        ),
      ).toBe(true);
    });
  });

  it('confirmed tick opens detail; Số khác on confirmed calls revise amount', async () => {
    const expense = makeSportExpense({
      amount: 220000,
      shares: [
        { participantId: PIDS.M, amount: 45000, inputValue: 1 },
        { participantId: PIDS.A, amount: 85000, inputValue: 1 },
        { participantId: PIDS.B, amount: 45000, inputValue: 1 },
        { participantId: PIDS.C, amount: 45000, inputValue: 1 },
      ],
      meta: {
        sport: {
          court: 130000,
          shuttlecocks: [{ qty: 2, unitPrice: 45000 }],
          extra: 0,
          rule: { kind: 'discount' as const, femaleDiscount: 5000 },
          entries: [
            { participantId: PIDS.M, maleSlots: 1, femaleSlots: 0 },
            { participantId: PIDS.A, maleSlots: 1, femaleSlots: 1 },
            { participantId: PIDS.B, maleSlots: 1, femaleSlots: 0 },
            { participantId: PIDS.C, maleSlots: 1, femaleSlots: 0 },
          ],
          maleSlotRate: 45000,
          femaleSlotRate: 40000,
        },
      },
    });
    const payA: PaymentView = {
      id: 'pay-a',
      fromId: PIDS.A,
      toId: PIDS.M,
      amountClaimed: 85000,
      amountConfirmed: 85000,
      status: 'confirmed',
      expenseId: 'e-badminton',
      notArrived: false,
      confirmedById: PIDS.M,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const view = tripView({
      expenses: [expense],
      payments: [payA],
      approvals: [],
    });

    const { calls } = mockApi({
      'POST /api/trips/t-1/payments/pay-a/revise': null,
    });

    renderAt(
      <ExpensePaymentsApproval
        view={view}
        expenseId="e-badminton"
        paymentIds={[]}
      />,
    );

    // Confirmed tick is filled with success
    const tickA = screen.getByTestId(`epa-tick-${PIDS.A}`);
    expect(tickA).toHaveClass('bg-success');

    // Click confirmed tick -> opens detail sheet
    await userEvent.click(tickA);

    // Detail Sheet is open
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // Click "Other amount"
    const otherBtn = screen.getByRole('button', { name: /Other amount/i });
    await userEvent.click(otherBtn);

    // Revise amount called
    await waitFor(() => {
      const reviseCall = calls.find(
        (c) =>
          c.method === 'POST' && c.path === '/api/trips/t-1/payments/pay-a/revise',
      );
      expect(reviseCall).toBeDefined();
      expect(reviseCall?.body).toMatchObject({ action: 'amount' });
    });
  });

  it('friend payment shows "Lan\'s friend" with badge', () => {
    const expense = makeSportExpense();
    const people = tripView().people.map((p) =>
      p.id === PIDS.A ? { ...p, name: 'Lan' } : p,
    );
    const payA: PaymentView = {
      id: 'pay-a',
      fromId: PIDS.A,
      toId: PIDS.M,
      amountClaimed: 45000,
      amountConfirmed: null,
      status: 'says_paid',
      expenseId: 'e-badminton',
      paidBy: 'friend',
      notArrived: false,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const view = tripView({
      people,
      expenses: [expense],
      payments: [payA],
      approvals: [
        {
          kind: 'expense_payments',
          expenseId: 'e-badminton',
          paymentIds: ['pay-a'],
        },
      ],
    });

    renderAt(
      <ExpensePaymentsApproval
        view={view}
        expenseId="e-badminton"
        paymentIds={['pay-a']}
      />,
    );

    // Label reads "Lan's friend"
    expect(screen.getByText("Lan's friend")).toBeInTheDocument();

    // Friend badge is displayed on avatar
    expect(screen.getByTestId('epa-badge-friend')).toBeInTheDocument();
  });

  it('approvalKey for expense_payments is ep-<id>', () => {
    const approval: Approval = {
      kind: 'expense_payments',
      expenseId: 'badminton-123',
      paymentIds: ['p-1', 'p-2'],
    };
    expect(approvalKey(approval)).toBe('ep-badminton-123');
  });

  it('PaymentApproval shows payerLabel text and expense description when payment has expenseId', () => {
    const expense = makeSportExpense({ id: 'e-100', description: 'Tennis court fee' });
    const people = tripView().people.map((p) =>
      p.id === PIDS.A ? { ...p, name: 'Lan' } : p,
    );
    const payA: PaymentView = {
      id: 'pay-100',
      fromId: PIDS.A,
      toId: PIDS.M,
      amountClaimed: 50000,
      amountConfirmed: null,
      status: 'says_paid',
      expenseId: 'e-100',
      paidBy: 'friend',
      notArrived: false,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const view = tripView({
      people,
      expenses: [expense],
      payments: [payA],
      approvals: [{ kind: 'payment', paymentId: 'pay-100' }],
    });

    renderAt(
      <ApprovalItem
        view={view}
        approval={{ kind: 'payment', paymentId: 'pay-100' }}
      />,
    );

    // PayerLabel text: Lan's friend
    expect(screen.getByText(/Lan's friend says they paid you/)).toBeInTheDocument();

    // Expense description
    expect(screen.getByText('Tennis court fee')).toBeInTheDocument();
  });

  it('ApprovalItem renders ExpensePaymentsApproval for expense_payments approval', () => {
    const expense = makeSportExpense();
    const payA: PaymentView = {
      id: 'pay-a',
      fromId: PIDS.A,
      toId: PIDS.M,
      amountClaimed: 45000,
      amountConfirmed: null,
      status: 'says_paid',
      expenseId: 'e-badminton',
      notArrived: false,
      createdAt: '2026-10-10T10:00:00Z',
    };
    const view = tripView({
      expenses: [expense],
      payments: [payA],
      approvals: [
        {
          kind: 'expense_payments',
          expenseId: 'e-badminton',
          paymentIds: ['pay-a'],
        },
      ],
    });

    renderAt(
      <ApprovalItem
        view={view}
        approval={{
          kind: 'expense_payments',
          expenseId: 'e-badminton',
          paymentIds: ['pay-a'],
        }}
      />,
    );

    expect(screen.getByText(/Badminton court/)).toBeInTheDocument();
  });
});
