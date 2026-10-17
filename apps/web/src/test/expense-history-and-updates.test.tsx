import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseHistoryItem, ExpenseView, TripView } from '@fsl/core';
import { renderAt, mockApi } from './render';
import { tripView, guestChiView, PIDS } from './fixtures';
import { ExpenseHistoryList } from '../components/ExpenseHistoryList';
import { UpdatedTransactionsBanner } from '../components/UpdatedTransactionsBanner';
import { ExpenseDetails } from '../components/ExpenseDetails';
import { MemberTrip } from '../screens/MemberTrip';
import { GuestTrip } from '../screens/GuestTrip';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const sampleHistory: ExpenseHistoryItem[] = [
  {
    id: 'h-1',
    description: 'Bánh tráng nướng ban đầu',
    amount: 150000,
    spentOn: '2026-10-10',
    payerId: PIDS.M,
    mode: 'equal',
    createdById: PIDS.M,
    createdAt: '2026-10-10T12:00:00.000Z',
    shares: [
      { participantId: PIDS.M, amount: 75000, inputValue: 1 },
      { participantId: PIDS.A, amount: 75000, inputValue: 1 },
    ],
  },
];

const expenseWithHistory: ExpenseView = {
  id: 'e-100',
  rootId: 'e-100',
  description: 'Bánh tráng nướng cập nhật',
  amount: 200000,
  spentOn: '2026-10-11',
  payerId: PIDS.M,
  mode: 'equal',
  status: 'approved',
  rejectReason: null,
  disabledByName: null,
  createdById: PIDS.A,
  shares: [
    { participantId: PIDS.M, amount: 100000, inputValue: 1 },
    { participantId: PIDS.A, amount: 100000, inputValue: 1 },
  ],
  history: sampleHistory,
};

describe('ExpenseHistoryList', () => {
  it('returns null when expense has no history or empty history', () => {
    const view = tripView();
    const expenseWithoutHistory: ExpenseView = {
      ...expenseWithHistory,
      history: [],
    };
    const { container } = renderAt(<ExpenseHistoryList view={view} expense={expenseWithoutHistory} />);
    expect(container.querySelector('.fsl-history')).toBeNull();
  });

  it('renders edit history without any version labels (no v1, v2, v3)', () => {
    const view = tripView();
    renderAt(<ExpenseHistoryList view={view} expense={expenseWithHistory} />);

    // Renders history title
    expect(screen.getByRole('heading', { name: 'Edit history' })).toBeInTheDocument();

    // Renders summary content
    expect(screen.getByText('Bánh tráng nướng ban đầu')).toBeInTheDocument();
    expect(screen.getByText('150.000₫')).toBeInTheDocument();
    expect(screen.getByText(/2026-10-10/)).toBeInTheDocument();
    expect(screen.getByText(/Minh: 75.000₫ · An: 75.000₫/)).toBeInTheDocument();
    expect(screen.getByText(/Edited by Minh/)).toBeInTheDocument();

    // CRITICAL: NEVER mention or render any version labels like v1, v2, v3
    expect(screen.queryByText(/\bv[0-9]+\b/i)).toBeNull();
    expect(screen.queryByText(/version/i)).toBeNull();
  });

  it('renders an icon-only rollback button with rotateCcw icon and calls rollback API', async () => {
    const view = tripView();
    const api = mockApi({
      'POST /api/trips/t-1/expenses/e-100/rollback': { expenseId: 'e-101', rootId: 'e-100' },
    });

    renderAt(<ExpenseHistoryList view={view} expense={expenseWithHistory} />);

    const rollbackBtn = screen.getByRole('button', { name: 'Roll back to this update' });
    expect(rollbackBtn).toHaveAttribute('title', 'Roll back to this update');
    // Icon-only button has no text
    expect(rollbackBtn.textContent?.trim()).toBe('');
    expect(rollbackBtn.querySelector('svg')).toBeInTheDocument();

    await userEvent.click(rollbackBtn);

    await waitFor(() => {
      const call = api.calls.find(c => c.path === '/api/trips/t-1/expenses/e-100/rollback');
      expect(call).toBeDefined();
      expect(call?.method).toBe('POST');
      expect(call?.body).toEqual({ targetHistoryId: 'h-1' });
    });
  });

  it('hides rollback button when trip is archived or actor lacks edit permissions', () => {
    // 1. Archived trip
    const archivedView: TripView = {
      ...tripView(),
      trip: { ...tripView().trip, archived: true },
    };
    const { rerender } = renderAt(<ExpenseHistoryList view={archivedView} expense={expenseWithHistory} />);
    expect(screen.queryByRole('button', { name: 'Roll back to this update' })).toBeNull();

    // 2. Guest actor who is not creator of pending expense
    const guestView: TripView = guestChiView();
    renderAt(<ExpenseHistoryList view={guestView} expense={expenseWithHistory} />);
    expect(screen.queryByRole('button', { name: 'Roll back to this update' })).toBeNull();
  });

  it('hides rollback button on a history entry that already matches the current active expense values', () => {
    const view = tripView();
    const identicalHistoryExpense: ExpenseView = {
      ...expenseWithHistory,
      amount: 150000,
      description: 'Bánh tráng nướng ban đầu',
      spentOn: '2026-10-10',
      shares: [
        { participantId: PIDS.M, amount: 75000, inputValue: 1 },
        { participantId: PIDS.A, amount: 75000, inputValue: 1 },
      ],
      history: sampleHistory, // sampleHistory has 150000, spentOn 2026-10-10, same description and shares
    };

    renderAt(<ExpenseHistoryList view={view} expense={identicalHistoryExpense} />);
    expect(screen.getByText('Bánh tráng nướng ban đầu')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Roll back to this update' })).toBeNull();
  });
});

describe('UpdatedTransactionsBanner', () => {
  it('does not render banner if no updated transactions involve the user', () => {
    const view = tripView(); // Minh is user, but e-100 createdById is Minh? In tripView expenses don't have history
    const { container } = renderAt(<UpdatedTransactionsBanner view={view} />);
    expect(container.querySelector('.fsl-updated-banner')).toBeNull();
  });

  it('does not render banner if the update was made by the current user', () => {
    const view = tripView({
      me: { kind: 'member', participantId: PIDS.M, participantPending: false, isOrganiser: true },
      expenses: [
        {
          ...expenseWithHistory,
          createdById: PIDS.M, // current user made the latest edit
        },
      ],
    });
    const { container } = renderAt(<UpdatedTransactionsBanner view={view} />);
    expect(container.querySelector('.fsl-updated-banner')).toBeNull();
  });

  it('shows banner when an updated transaction involves the participant and records dismissal in localStorage', async () => {
    // Current user is Minh (PIDS.M), and An (PIDS.A) updated e-100 which involves Minh
    const view = tripView({
      me: { kind: 'member', participantId: PIDS.M, participantPending: false, isOrganiser: true },
      expenses: [expenseWithHistory],
    });

    renderAt(<UpdatedTransactionsBanner view={view} />);

    // Banner is visible
    expect(screen.getByText('Transactions involving you were updated')).toBeInTheDocument();
    const viewBtn = screen.getByRole('button', { name: 'View updated transactions' });
    expect(viewBtn).toBeInTheDocument();

    // Click "View updated transactions" to open modal
    await userEvent.click(viewBtn);

    // Modal opens showing description, total diff, and share diff
    expect(screen.getByText('Bánh tráng nướng cập nhật')).toBeInTheDocument();
    // Total amount change: 150.000₫ → 200.000₫
    expect(screen.getByText(/150\.000₫.*200\.000₫/)).toBeInTheDocument();
    // Participant's share diff: 75.000₫ → 100.000₫
    expect(screen.getByText(/75\.000₫.*100\.000₫/)).toBeInTheDocument();

    // Opening records e-100 in localStorage
    const stored = JSON.parse(localStorage.getItem('fsl_seen_tx_updates_t-1') || '[]');
    expect(stored).toContain('e-100');

    // Dismiss modal
    const dismissBtn = screen.getByRole('button', { name: 'Got it' });
    await userEvent.click(dismissBtn);

    // After dismissal, re-rendering with same view does not show banner
    const { container: nextContainer } = renderAt(<UpdatedTransactionsBanner view={view} />);
    expect(nextContainer.querySelector('.fsl-updated-banner')).toBeNull();
  });
});

describe('Integration in ExpenseDetails, MemberTrip, and GuestTrip', () => {
  it('resolves expense by rootId and renders ExpenseHistoryList in ExpenseDetails', () => {
    const view = tripView({
      expenses: [
        {
          ...expenseWithHistory,
          id: 'e-new-head',
          rootId: 'e-100',
        },
      ],
    });

    // Lookup with rootId 'e-100'
    renderAt(<ExpenseDetails view={view} expenseId="e-100" onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Edit history' })).toBeInTheDocument();
    expect(screen.getByText('Bánh tráng nướng ban đầu')).toBeInTheDocument();
  });

  it('resolves expense in ExpenseDetails by historical revision id in history', () => {
    const view = tripView({
      expenses: [
        {
          ...expenseWithHistory,
          id: 'e-head-v3',
          rootId: 'e-100',
          history: [
            {
              ...sampleHistory[0]!,
              id: 'e-historical-v2',
            },
          ],
        },
      ],
    });

    renderAt(<ExpenseDetails view={view} expenseId="e-historical-v2" onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Edit history' })).toBeInTheDocument();
    expect(screen.getByText('Bánh tráng nướng ban đầu')).toBeInTheDocument();
  });

  it('renders UpdatedTransactionsBanner in MemberTrip and GuestTrip', async () => {
    const memberView = tripView({
      expenses: [expenseWithHistory],
    });
    const guestView = guestChiView();
    guestView.expenses = [
      {
        ...expenseWithHistory,
        shares: [
          { participantId: PIDS.C, amount: 100000, inputValue: 1 },
          { participantId: PIDS.A, amount: 100000, inputValue: 1 },
        ],
        history: [
          {
            ...sampleHistory[0]!,
            shares: [
              { participantId: PIDS.C, amount: 75000, inputValue: 1 },
              { participantId: PIDS.A, amount: 75000, inputValue: 1 },
            ],
          },
        ],
      },
    ];

    // Render MemberTrip directly
    const { unmount } = renderAt(<MemberTrip view={memberView} />);
    expect(screen.getByText('Transactions involving you were updated')).toBeInTheDocument();
    unmount();

    // Clear localStorage for next render
    localStorage.clear();

    // Render GuestTrip directly
    renderAt(<GuestTrip view={guestView} />);
    expect(screen.getByText('Transactions involving you were updated')).toBeInTheDocument();
  });
});
