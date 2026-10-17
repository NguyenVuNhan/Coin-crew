import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateTrip } from '../screens/CreateTrip';
import { People } from '../screens/People';

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
  it('submits preset="sport", myGender, and per-person gender from CreateTrip', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/me')) {
          return Response.json({ user: { id: 'u1', email: 'm@e.com', name: 'Minh', consentAt: '2026-10-12T00:00:00Z' } });
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
    await waitFor(() => expect(screen.getByDisplayValue('Minh')).toBeInTheDocument());

    // Switch to Sport group preset
    await userEvent.click(screen.getByRole('radio', { name: 'Sport group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Cầu lông tối thứ 5');

    // Toggle organiser gender: unset -> M
    await userEvent.click(screen.getByRole('button', { name: /Gender for Minh/i }));

    // Fill first person and toggle their gender twice: unset -> M -> F
    const firstInput = screen.getByPlaceholderText('Name');
    await userEvent.type(firstInput, 'Chi');
    const chiGenderBtn = screen.getByRole('button', { name: /Gender for Chi/i });
    await userEvent.click(chiGenderBtn);
    await userEvent.click(chiGenderBtn);

    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({
      name: 'Cầu lông tối thứ 5',
      preset: 'sport',
      myName: 'Minh',
      myGender: 'M',
      people: [{ name: 'Chi', gender: 'F' }],
    });
  });

  it('toggles a player gender in People screen when preset is sport', async () => {
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
    const chiBtn = await screen.findByRole('button', { name: /Gender for Chi/i });
    await userEvent.click(chiBtn);
    await waitFor(() => expect(patches).toEqual([{ gender: null }]));
  });
});
