import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateTrip } from '../screens/CreateTrip';
import { People } from '../screens/People';
import { UndoSnackbarHost } from '../components/UndoSnackbarHost';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderWithRouter(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/trips/new" element={<CreateTrip />} />
          <Route path="/t/:tripId" element={<div>Trip Home</div>} />
          <Route path="/t/:tripId/people" element={<People />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sport group creation & People gender toggle', () => {
  it('submits preset="sport", myGender, and per-person gender from CreateTrip with the add bar', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/me')) {
          return Response.json({ user: { id: 'u1', email: 'm@e.com', name: 'Minh', gender: 'M', consentAt: '2026-10-12T00:00:00Z' } });
        }
        if (url.endsWith('/api/me/people')) {
          return Response.json([]);
        }
        if (url.endsWith('/api/trips') && init?.method === 'POST') {
          calls.push({ url, method: 'POST', body: JSON.parse(String(init.body)) });
          return Response.json({ tripId: 't-sport' }, { status: 201 });
        }
        return Response.json({});
      }),
    );

    renderWithRouter('/trips/new');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create group' })).toBeInTheDocument());

    // Switch to Sport group preset
    await userEvent.click(screen.getByRole('radio', { name: 'Sport group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Cầu lông tối thứ 5');

    // + Female and + Male add with that gender; the row pill flips one; your own pill sets myGender.
    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'Lan');
    await userEvent.click(screen.getByRole('button', { name: '+ Female' }));
    await userEvent.type(field, 'Chi');
    await userEvent.click(screen.getByRole('button', { name: '+ Male' }));
    await userEvent.click(screen.getByRole('button', { name: 'Gender for Chi: Male' }));
    expect(screen.getByRole('button', { name: 'Gender for Chi: Female' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gender for Minh: Male' }));

    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({
      name: 'Cầu lông tối thứ 5',
      preset: 'sport',
      myName: 'Minh',
      myGender: 'F',
      people: [
        { name: 'Lan', gender: 'F' },
        { name: 'Chi', gender: 'F' },
      ],
      defaultLang: 'en',
    });
  });

  it('the gender pill flips a player in the People screen, with Undo', async () => {
    const patches: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'PATCH' && url.includes('/people/p-chi')) {
          patches.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return Response.json({
          trip: { id: 't-sport', name: 'Badminton', currency: 'VND', preset: 'sport', fewestTransfers: true, archived: false, version: 1, total: 0 },
          me: { kind: 'member', participantId: 'p-minh', participantPending: false, isOrganiser: true },
          people: [
            { id: 'p-minh', name: 'Minh', status: 'active', isMember: true, isOrganiser: true, bank: 'none', gender: 'M' },
            { id: 'p-chi', name: 'Chi', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'F' },
          ],
          balances: {},
          suggestions: [],
          expenses: [],
          payments: [],
          myBalance: null,
          approvals: [],
          links: null,
        });
      }),
    );

    renderWithRouter('/t/t-sport/people');
    render(<UndoSnackbarHost />);
    await userEvent.click(await screen.findByRole('button', { name: 'Gender for Chi: Female' }));
    await waitFor(() => expect(patches).toEqual([{ gender: 'M' }]));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(patches).toEqual([{ gender: 'M' }, { gender: 'F' }]));
  });
});
