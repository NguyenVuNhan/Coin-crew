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
    await userEvent.clear(screen.getByLabelText('Qty'));
    await userEvent.type(screen.getByLabelText('Qty'), '3');
    await userEvent.type(screen.getByLabelText('Unit price'), '26.67k');

    // Enter 15k female discount
    await userEvent.type(screen.getByLabelText('Women pay less per slot'), '15k');

    // Open Quang's inline drawer and set 1 F slot + 2 M slots (covering guests)
    const quangRow = screen.getByTestId('split-row-Quang');
    const quangShareBtn = quangRow.querySelector('button[data-testid="sport-share-btn-p-quang"]') as HTMLElement;
    await userEvent.click(quangShareBtn);

    const fSlotsInput = screen.getByLabelText('Female slots for Quang');
    const mSlotsInput = screen.getByLabelText('Male slots for Quang');
    await userEvent.clear(fSlotsInput);
    await userEvent.type(fSlotsInput, '1');
    await userEvent.clear(mSlotsInput);
    await userEvent.type(mSlotsInput, '2');

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
});
