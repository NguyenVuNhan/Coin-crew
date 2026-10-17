import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TripView } from '@fsl/core';
import { ExpenseForm } from '../screens/ExpenseForm';
import { TripRoute } from '../screens/TripRoute';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  links: { group: 'gtok-sport', view: 'vtok-sport' },
};

describe('Sport ExpenseForm and ExpenseDetails bill sharing', () => {
  it('calculates court + shuttlecocks + extra with VND discount and slot drawer, posts meta.sport, and navigates to ExpenseDetails', async () => {
    const posted: unknown[] = [];
    let currentView = baseSportView;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/api/trips/t-sport/expenses')) {
          const body = JSON.parse(String(init.body));
          posted.push(body);
          currentView = {
            ...baseSportView,
            trip: { ...baseSportView.trip, version: 2, total: body.amount },
            expenses: [
              {
                id: 'e-sport-1',
                description: body.description,
                amount: body.amount,
                spentOn: body.spentOn,
                payerId: body.payerId,
                mode: body.mode,
                status: 'approved',
                rejectReason: null,
                disabledByName: null,
                createdById: 'p-minh',
                shares: body.entries.map((e: { participantId: string; value: number }) => ({
                  participantId: e.participantId,
                  amount: e.value,
                  inputValue: e.value,
                })),
                meta: body.meta,
              },
            ],
          };
          return Response.json({ expenseId: 'e-sport-1' }, { status: 201 });
        }
        if (url.includes('/pay/p-minh?bill=1')) {
          return Response.json({
            to: { id: 'p-minh', name: 'Minh' },
            amount: 0,
            bankState: 'ok',
            bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' },
            refCode: 'CAU LONG T5',
            payload: '00020101021138580010A000000727012800069704070114190312345656780208QRIBFTTA53037045802VN62150811CAU LONG T56304ABCD',
            inFlight: [],
          });
        }
        return Response.json(currentView);
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-sport/expenses/new']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
            <Route path="/t/:tripId/expenses/:expenseId" element={<TripRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('What for')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('What for'), 'Cầu lông tối T5');
    await userEvent.type(screen.getByLabelText('Court'), '240k');

    // Add shuttlecock price row dynamically
    await userEvent.click(screen.getByRole('button', { name: '+ Add shuttlecock price' }));
    await userEvent.clear(screen.getByLabelText('Qty'));
    await userEvent.type(screen.getByLabelText('Qty'), '3');
    await userEvent.type(screen.getByLabelText('Unit price'), '26.67k');

    // Enter 15k female discount
    await userEvent.type(screen.getByLabelText('Women pay less per slot'), '15k');

    // Open Quang's inline drawer and set guest slots (+1 female guest, +1 male guest)
    const quangRow = screen.getByTestId('split-row-Quang');
    const quangShareBtn = quangRow.querySelector('button[data-testid="sport-share-btn-p-quang"]') as HTMLElement;
    await userEvent.click(quangShareBtn);

    await userEvent.click(screen.getByRole('button', { name: 'Increase female guest for Quang' }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase male guest for Quang' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    // Verifies POST payload and navigation to ExpenseDetails with Share bill & QR button
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      description: 'Cầu lông tối T5',
      amount: 320010, // 240.000 + 3 * 26.670
      mode: 'amounts',
      meta: {
        sport: {
          court: 240000,
          shuttlecocks: [{ qty: 3, unitPrice: 26670 }],
          extra: 0,
          rule: { kind: 'discount', femaleDiscount: 15000 },
        },
      },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Share bill & QR' })).toBeInTheDocument());
    expect(screen.getByText('TOTAL SLOTS')).toBeInTheDocument();
  });

  it('initially hides shuttlecock and extra fee inputs on a new sport expense until clicked, and removes them via × buttons', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(baseSportView)),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-sport/expenses/new']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('What for')).toBeInTheDocument());

    // Initially Qty and Extra fee inputs are not present
    expect(screen.queryByLabelText('Qty')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Extra fee (water, parking…)')).not.toBeInTheDocument();

    // Buttons to add them are present
    const addShuttleBtn = screen.getByRole('button', { name: '+ Add shuttlecock price' });
    const addExtraBtn = screen.getByRole('button', { name: '+ Add extra fee' });
    expect(addShuttleBtn).toBeInTheDocument();
    expect(addExtraBtn).toBeInTheDocument();

    // Click + Add shuttlecock price
    await userEvent.click(addShuttleBtn);
    expect(screen.getByLabelText('Qty')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit price')).toBeInTheDocument();

    // Click + Add extra fee
    await userEvent.click(addExtraBtn);
    expect(screen.getByLabelText('Extra fee (water, parking…)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add extra fee' })).not.toBeInTheDocument();

    // Remove shuttlecock row via × button
    const removeShuttleBtn = screen.getByRole('button', { name: 'Remove shuttlecock row 1' });
    await userEvent.click(removeShuttleBtn);
    expect(screen.queryByLabelText('Qty')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add shuttlecock price' })).toBeInTheDocument();

    // Remove extra fee via × button
    const removeExtraBtn = screen.getByRole('button', { name: 'Remove extra fee' });
    await userEvent.click(removeExtraBtn);
    expect(screen.queryByLabelText('Extra fee (water, parking…)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add extra fee' })).toBeInTheDocument();
  });

  it('renders two-part drawer with guest steppers and fixed override, computing 1F · 2M (3 slots) and overriding with fixed amount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(baseSportView)),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-sport/expenses/new']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('What for')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('Court'), '300k');

    // Open Quang's drawer
    const quangRow = screen.getByTestId('split-row-Quang');
    const quangShareBtn = quangRow.querySelector('button[data-testid="sport-share-btn-p-quang"]') as HTMLElement;
    await userEvent.click(quangShareBtn);

    // Section 1: "This player brings guest?"
    expect(screen.getByText('This player brings guest?')).toBeInTheDocument();
    expect(screen.getByTestId('guest-f-p-quang')).toHaveTextContent('0');
    expect(screen.getByTestId('guest-m-p-quang')).toHaveTextContent('0');

    // Section 2: "Or want to set a fixed amount for Quang"
    expect(screen.getByText('Or want to set a fixed amount for Quang')).toBeInTheDocument();

    // Increment 1 Female guest + 1 Male guest
    await userEvent.click(screen.getByRole('button', { name: 'Increase female guest for Quang' }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase male guest for Quang' }));
    expect(screen.getByTestId('guest-f-p-quang')).toHaveTextContent('1');
    expect(screen.getByTestId('guest-m-p-quang')).toHaveTextContent('1');

    // Quang's badge shows "1 F · 2 M"
    expect(quangRow).toHaveTextContent('1 F · 2 M');

    // Total slots: Minh (1M) + Chi (1F) + Quang (1F + 2M = 3) = 5 slots. 300k / 5 = 60k/slot.
    // Quang's 3 slots = 180.000₫
    expect(quangShareBtn).toHaveTextContent('180.000');

    // Now set fixed override for Quang
    const fixedInput = screen.getByLabelText('Or want to set a fixed amount for Quang');
    await userEvent.type(fixedInput, '50k');

    // Quang's badge updates to "Fixed" and share amount to 50.000₫
    expect(quangRow).toHaveTextContent('Fixed');
    expect(quangShareBtn).toHaveTextContent('50.000');
  });

  it('allows organiser/admin to quick-edit player gender from slot badge popover, sending PATCH to /api/trips/t-sport/people/:id', async () => {
    const patches: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'PATCH' && url.includes('/api/trips/t-sport/people/')) {
          patches.push({ url, body: JSON.parse(String(init.body)) });
          return Response.json({ ok: true });
        }
        return Response.json(baseSportView);
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-sport/expenses/new']}>
          <Routes>
            <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('What for')).toBeInTheDocument());

    // Quang's initial gender badge button
    const quangGenderBtn = screen.getByTestId('gender-badge-p-quang');
    expect(quangGenderBtn).toBeInTheDocument();
    expect(quangGenderBtn).toHaveTextContent('1 M');

    // Click gender badge to open quick-edit popover
    await userEvent.click(quangGenderBtn);

    // Click Female button
    const femaleBtn = screen.getByRole('button', { name: 'Female' });
    await userEvent.click(femaleBtn);

    // Verify PATCH was called
    expect(patches).toHaveLength(1);
    const patch = patches[0];
    expect(patch?.url).toContain('/api/trips/t-sport/people/p-quang');
    expect(patch?.body).toEqual({ gender: 'F' });

    // Badge reflects female gender immediately in local state
    expect(screen.getByTestId('gender-badge-p-quang')).toHaveTextContent('1 F');
  });

  it('renders Share bill & QR button in ExpenseDetails without .fsl-sport-preview-msg or .fsl-sport-preview-qr', async () => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/pay/p-minh?bill=1')) {
          return Response.json({
            to: { id: 'p-minh', name: 'Minh' },
            amount: 0,
            bankState: 'ok',
            bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' },
            refCode: 'CAU LONG T5',
            payload: '00020101021138580010A000000727012800069704070114190312345656780208QRIBFTTA53037045802VN62150811CAU LONG T56304ABCD',
            inFlight: [],
          });
        }
        return Response.json(viewWithSportExpense);
      }),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-sport/expenses/e-sport-1']}>
          <Routes>
            <Route path="/t/:tripId/expenses/:expenseId" element={<TripRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Share bill & QR' })).toBeInTheDocument());

    // Preview msg and preview QR must NOT be rendered
    expect(container.querySelector('.fsl-sport-preview-msg')).toBeNull();
    expect(container.querySelector('.fsl-sport-preview-qr')).toBeNull();
    expect(container.querySelector('.fsl-sport-preview-title')).toBeNull();
  });
});
