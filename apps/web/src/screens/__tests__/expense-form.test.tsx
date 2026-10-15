import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes, useNavigationType } from 'react-router';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { ExpenseForm } from '../ExpenseForm';
import { toEntryValue, fromEntryValue } from '../../lib/splitInput';

afterEach(() => {
  vi.unstubAllGlobals();
});

const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const editRoute = { route: '/t/t-1/expenses/e-5/edit', path: '/t/:tripId/expenses/:expenseId/edit' };
const rowOf = (name: string) => screen.getByTestId(`split-row-${name}`);

describe('splitInput', () => {
  it('turns what people type into entry values', () => {
    expect(toEntryValue('percent', '33.33')).toBe(3333);
    expect(toEntryValue('percent', '33,33')).toBe(3333);
    expect(toEntryValue('shares', '1.5')).toBe(150);
    expect(toEntryValue('shares', '2')).toBe(200);
    expect(toEntryValue('amounts', '50k')).toBe(50000);
    expect(toEntryValue('adjust', '-20.000')).toBe(-20000);
    expect(toEntryValue('adjust', '0')).toBe(0);
    expect(toEntryValue('percent', 'abc')).toBeNull();
  });
  it('and back for editing', () => {
    expect(fromEntryValue('percent', 3333)).toBe('33.33');
    expect(fromEntryValue('shares', 150)).toBe('1.5');
    expect(fromEntryValue('amounts', 50000)).toBe('50.000');
    expect(fromEntryValue('adjust', -20000)).toBe('-20.000');
  });
});

describe('ExpenseForm', () => {
  it('splits equally between everyone ticked', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '180.000');
    for (const name of ['Minh', 'An', 'Bình', 'Chi']) expect(within(rowOf(name)).getByText('45.000₫')).toBeInTheDocument();
  });

  it('understands 1,5tr', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '1,5tr');
    expect(screen.getAllByText('1.500.000₫').length).toBeGreaterThan(0);
  });

  it('exact amounts that do not add up block saving', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('What for'), 'Lẩu');
    await userEvent.type(screen.getByLabelText('Amount'), '100.000');
    await userEvent.click(screen.getByRole('radio', { name: 'Exact amounts' }));
    await userEvent.type(screen.getByLabelText('Amount for Minh'), '50.000');
    await userEvent.type(screen.getByLabelText('Amount for An'), '20.000');
    expect(screen.getByText("The amounts don't add up to the total.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
  });

  it('a guest sends for approval and the body is what the API expects', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'POST /api/trips/t-1/expenses': () => Response.json({ expenseId: 'e-9' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, newRoute);
    expect(await screen.findByText('A group member checks it before it counts.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What for'), 'Bánh tráng nướng, chợ đêm');
    await userEvent.type(screen.getByLabelText('Amount'), '180k');
    expect(screen.getByLabelText('Paid by')).toHaveValue(PIDS.C);
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    const body = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ description: 'Bánh tráng nướng, chợ đêm', amount: 180000, payerId: PIDS.C, mode: 'equal' });
    expect(body.spentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.entries).toEqual([PIDS.M, PIDS.A, PIDS.B, PIDS.C].map((participantId) => ({ participantId, value: 1 })));
  });

  it('unticking someone leaves them out', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '90.000');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include Bình' }));
    expect(within(rowOf('Minh')).getByText('30.000₫')).toBeInTheDocument();
    expect(within(rowOf('Bình')).queryByText(/₫/)).not.toBeInTheDocument();
  });

  it('edit mode fills the form and saves with PATCH', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'PATCH /api/trips/t-1/expenses/e-5': null,
    });
    renderAt(<ExpenseForm />, editRoute);
    expect(await screen.findByLabelText('What for')).toHaveValue('Bánh tráng nướng, chợ đêm');
    expect(screen.getByLabelText('Amount')).toHaveValue('180.000');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  });
  it('the split modes are named icons', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    const group = await screen.findByRole('radiogroup', { name: 'Split' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Equally', 'Exact amounts', 'Percent', 'Shares', 'Adjust']);
    expect(radios.map((r) => r.getAttribute('title'))).toEqual(['Equally', 'Exact amounts', 'Percent', 'Shares', 'Adjust']);
    expect(within(group).getByRole('radio', { name: 'Equally' })).toBeChecked();
  });

  it("shows each person's share as you type", async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '180.000');
    expect(screen.getByText('Split equally · 4 people · 45.000₫ each')).toBeInTheDocument();
    expect(screen.getAllByText('45.000₫')).toHaveLength(4);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include Bình' }));
    expect(screen.getByText('Split equally · 3 people · 60.000₫ each')).toBeInTheDocument();
  });

  it('says about when an equal split leaves a few dong over', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '100.000');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include Chi' }));
    expect(screen.getByText('Split equally · 3 people · about 33.333₫ each')).toBeInTheDocument();
  });

  it('names the other modes and shows shares once they add up', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '100.000');
    await userEvent.click(screen.getByRole('radio', { name: 'Percent' }));
    expect(screen.getByText('By percent · 0 people')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Percent for Minh'), '60');
    await userEvent.type(screen.getByLabelText('Percent for An'), '40');
    expect(screen.getByText('By percent · 2 people')).toBeInTheDocument();
    expect(within(rowOf('Minh')).getByText('60.000₫')).toBeInTheDocument();
    expect(within(rowOf('An')).getByText('40.000₫')).toBeInTheDocument();
  });

  it("someone else's expense cannot be edited", async () => {
    mockApi({ 'GET /api/trips/t-1': { ...guestChiView(), me: tripView().me } });
    renderAt(<ExpenseForm />, editRoute);
    expect(await screen.findByText('Only the person who added this expense can edit it.')).toBeInTheDocument();
    expect(screen.queryByLabelText('What for')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    const backs = screen.getAllByRole('button', { name: 'Back' });
    await userEvent.click(backs[backs.length - 1]!);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });

  describe('after saving', () => {
    function Harness() {
      const navType = useNavigationType();
      return (
        <>
          <Routes>
            <Route path="/t/:tripId/expenses/:expenseId/edit" element={<ExpenseForm />} />
            <Route path="/t/:tripId/expenses/:expenseId" element={<Link to="/t/t-1/expenses/e-5/edit">Edit it</Link>} />
            <Route path="/t/:tripId" element={<p>The trip</p>} />
          </Routes>
          <div data-testid="nav-type">{navType}</div>
        </>
      );
    }

    it('an edit opened from the details goes back to them instead of adding an entry', async () => {
      const { calls } = mockApi({ 'GET /api/trips/t-1': guestChiView(), 'PATCH /api/trips/t-1/expenses/e-5': null });
      renderAt(<Harness />, { route: '/t/t-1/expenses/e-5' });
      await userEvent.click(await screen.findByRole('link', { name: 'Edit it' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1\/expenses\/e-5$/));
      expect(screen.getByTestId('nav-type')).toHaveTextContent('POP');
      expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
    });

    it('a form opened from a link replaces itself with the trip', async () => {
      mockApi({ 'GET /api/trips/t-1': guestChiView(), 'PATCH /api/trips/t-1/expenses/e-5': null });
      renderAt(<Harness />, { route: editRoute.route });
      await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
      expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
    });
  });
});
