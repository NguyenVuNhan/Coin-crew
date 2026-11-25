import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseInput, ExpenseView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { sportFundView } from '../../test/fundFixtures';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const editRoute = (id: string, query = '') => ({
  route: `/t/t-1/expenses/${id}/edit${query}`,
  path: '/t/:tripId/expenses/:expenseId/edit',
});

function stubMousePointer() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('ExpenseForm shared layout', () => {
  it('order is title, amount, payer+date, split, note', async () => {
    stubMousePointer();
    mockApi({ 'GET /api/trips/t-1': tripView() });
    const { container } = renderAt(<ExpenseForm />, newRoute);

    const title = await screen.findByTestId('shared-title-input');
    const amount = screen.getByTestId('amount-display');
    const details = screen.getByTestId('shared-details-card');
    const split = container.querySelector('.fsl-expense-form__split-section');
    const note = screen.getByTestId('shared-note-input');
    const save = screen.getByRole('button', { name: 'Add expense' });

    expect(title).toHaveAttribute('id', 'expense-what-for');
    const amountInput = screen.getByTestId('amount-input');
    expect(amountInput).toHaveAttribute('id', 'expense-amount');
    expect(split).not.toBeNull();

    expect(precedes(title, amount)).toBe(true);
    expect(precedes(amount, details)).toBe(true);
    expect(precedes(details, split!)).toBe(true);
    expect(precedes(split!, note)).toBe(true);
    expect(precedes(note, save)).toBe(true);
  });

  it('payer and date visible without any toggle', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);

    const payerRow = await screen.findByTestId('shared-payer-row');
    const dateRow = screen.getByTestId('entry-date-row');

    expect(payerRow).toBeVisible();
    expect(payerRow).toHaveTextContent('Minh (me)');
    expect(dateRow).toBeVisible();
    expect(screen.getByTestId('shared-category-btn')).toHaveAttribute('data-icon', 'tag');
  });

  it('save sends categoryKey and note', async () => {
    stubMousePointer();
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/expenses': () => Response.json({ expenseId: 'e-9' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, newRoute);

    await userEvent.type(await screen.findByTestId('shared-title-input'), 'Ăn tối quán nướng');
    await userEvent.click(screen.getByTestId('shared-category-btn'));
    await userEvent.click(await screen.findByTestId('danh-muc-option-food-dining'));
    expect(screen.getByTestId('shared-category-btn')).toHaveAttribute('data-icon', 'utensils-crossed');

    await userEvent.type(screen.getByTestId('amount-input'), '350000');
    await userEvent.type(screen.getByTestId('shared-note-input'), 'Kèm nước ngọt');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const body = calls.find((c) => c.method === 'POST')!.body as ExpenseInput;
    expect(body).toMatchObject({
      description: 'Ăn tối quán nướng',
      categoryKey: 'food-dining',
      note: 'Kèm nước ngọt',
      amount: 350000,
      payerId: PIDS.M,
    });
  });

  it('edit pre-fills title, danh mục and Nội dung', async () => {
    stubMousePointer();
    const base = tripView();
    const withMeta = {
      ...base,
      expenses: base.expenses.map((e) =>
        e.id === 'e-1' ? { ...e, categoryKey: 'transport-hotel', note: 'Đã cọc trước 50%' } : e,
      ),
    };
    mockApi({ 'GET /api/trips/t-1': withMeta });
    renderAt(<ExpenseForm />, editRoute('e-1'));

    expect(await screen.findByTestId('shared-title-input')).toHaveValue('Homestay Bloom · 2 nights');
    expect(screen.getByTestId('shared-category-btn')).toHaveAttribute('data-icon', 'hotel');
    expect(screen.getByTestId('shared-note-input')).toHaveValue('Đã cọc trước 50%');
  });

  it('Save stays disabled until there is a title', async () => {
    stubMousePointer();
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/expenses': () => Response.json({ expenseId: 'e-9' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, newRoute);

    await userEvent.type(await screen.findByTestId('amount-input'), '100000');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    await userEvent.type(screen.getByTestId('shared-title-input'), 'Ăn tối');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeEnabled();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('sport group still shows court slots and rule picker', async () => {
    const base = sportFundView();
    const planningExpense: ExpenseView = {
      id: 'e-plan',
      description: 'Cầu lông tối thứ 5',
      amount: 0,
      spentOn: '2026-10-27',
      payerId: PIDS.M,
      mode: 'amounts',
      status: 'approved',
      rejectReason: null,
      disabledByName: null,
      createdById: PIDS.M,
      shares: [
        { participantId: PIDS.M, amount: 0, inputValue: 0 },
        { participantId: PIDS.A, amount: 0, inputValue: 0 },
      ],
      meta: {
        sport: {
          planning: true,
          court: 200000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [
            { participantId: PIDS.M, maleSlots: 1, femaleSlots: 0 },
            { participantId: PIDS.A, maleSlots: 0, femaleSlots: 1 },
          ],
          maleSlotRate: 0,
          femaleSlotRate: 0,
          courtSlots: [{ courtName: 'Sân 1', timeRange: '18:00 - 20:00' }],
        },
      },
    };
    mockApi({
      'GET /api/trips/t-1': { ...base, expenses: [planningExpense, ...base.expenses] },
    });
    const { container } = renderAt(<ExpenseForm />, editRoute('e-plan', '?mode=complete'));

    await screen.findByTestId('shared-title-input');
    expect(container.querySelector('.fsl-sport-schedule-card')).not.toBeNull();
    expect(screen.getByDisplayValue('Sân 1')).toBeInTheDocument();
    expect(container.querySelector('.fsl-sport-rule-picker')).not.toBeNull();
    expect(container.querySelector('.fsl-sport-costs-card')).not.toBeNull();
  });

  it('fund-paid expense still shows FundPaidPanel', async () => {
    stubMousePointer();
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, newRoute);

    await userEvent.selectOptions(await screen.findByTestId('shared-payer-row'), '__fund__');

    expect(screen.getByText('Paid from the group fund')).toBeInTheDocument();
    expect(screen.getByText('Nobody owes a share.')).toBeInTheDocument();
  });

  it('direct preset (Khoản chi nhanh) renders the same layout', async () => {
    stubMousePointer();
    const base = tripView();
    mockApi({
      'GET /api/trips/t-1': { ...base, trip: { ...base.trip, preset: 'direct' } },
      'GET /api/me/people/candidates': [],
    });
    const { container } = renderAt(<ExpenseForm />, newRoute);

    const title = await screen.findByTestId('shared-title-input');
    const amount = screen.getByTestId('amount-display');
    const details = screen.getByTestId('shared-details-card');
    const split = container.querySelector('.fsl-expense-form__split-section');
    const note = screen.getByTestId('shared-note-input');

    expect(screen.getByTestId('shared-category-btn')).toBeInTheDocument();
    expect(screen.getByTestId('shared-payer-row')).toBeInTheDocument();
    expect(screen.getByTestId('entry-date-row')).toBeInTheDocument();
    expect(split).not.toBeNull();
    expect(precedes(title, amount)).toBe(true);
    expect(precedes(amount, details)).toBe(true);
    expect(precedes(details, split!)).toBe(true);
    expect(precedes(split!, note)).toBe(true);
  });
});
