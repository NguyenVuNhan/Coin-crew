// @vitest-environment jsdom
import '../test/setup';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { newScore, type AttendancePerson, type AttendanceView, type SportParticipantEntry } from '@cc/core';
import { TurnoutCard } from '../components/TurnoutCard';
import { ExpenseForm } from '../screens/ExpenseForm';
import type { TripView } from '@cc/core';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const person = (id: string, over: Partial<ReturnType<typeof newScore>>, labels: AttendancePerson['labels'] = []): AttendancePerson => ({
  participantId: id,
  score: { ...newScore(id), sessionsSeen: 10, sessionsPlanned: 10, ...over },
  labels,
  wantedStamp: false,
});

const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const people = names.map((n) => ({ id: n, name: `Người ${n}` }));
const entry = (id: string, slots = 1): SportParticipantEntry => ({ participantId: id, maleSlots: slots, femaleSlots: 0 });
const entries = names.map((n) => entry(n));

// 9 people: 5 at 100, 2 at 60, 2 at 20 (flaky) → likely = 5 + 1.2 + 0.4 = 6.6 → 7
const view: AttendanceView = {
  people: [
    ...['A', 'B', 'C', 'D', 'E'].map((id) => person(id, { reliability: 100 }, ['regular'])),
    ...['F', 'G'].map((id) => person(id, { reliability: 60 })),
    ...['H', 'I'].map((id) => person(id, { reliability: 20 }, ['flaky'])),
  ],
  latestSession: null,
  pendingSessions: 0,
};

function renderCard(body: unknown, status: number, list: SportParticipantEntry[]) {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status })));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (es: SportParticipantEntry[]) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TurnoutCard tripId="t-1" entries={es} people={people} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const utils = render(ui(list));
  return { ...utils, rerenderWith: (es: SportParticipantEntry[]) => utils.rerender(ui(es)) };
}

describe('TurnoutCard', () => {
  it('shows about 7 of 9 from scores and updates when an entry is removed', async () => {
    const { rerenderWith } = renderCard(view, 200, entries);
    await waitFor(() => expect(screen.getByTestId('turnout-card')).toBeTruthy());
    expect(screen.getByTestId('turnout-estimate').textContent).toMatch(/7/);
    expect(screen.getByTestId('turnout-estimate').textContent).toMatch(/9/);
    expect(screen.getByTestId('turnout-counts').textContent).toMatch(/5.*2.*2/);
    rerenderWith(entries.filter((e) => e.participantId !== 'A'));
    expect(screen.getByTestId('turnout-estimate').textContent).toMatch(/6.*8|6.*\/.*8/);
  });

  it('with no scores everyone counts at 0.8', async () => {
    renderCard({ people: [], latestSession: null, pendingSessions: 0 }, 200, entries);
    await waitFor(() => expect(screen.getByTestId('turnout-card')).toBeTruthy());
    // 9 * 0.8 = 7.2 → 7
    expect(screen.getByTestId('turnout-estimate').textContent).toMatch(/7/);
  });

  it('See who opens a Sheet listing labels and the three scores', async () => {
    renderCard(view, 200, entries);
    await waitFor(() => expect(screen.getByTestId('turnout-card')).toBeTruthy());
    fireEvent.click(screen.getByText(/See who|Xem ai/));
    await waitFor(() => expect(screen.getByTestId('turnout-row-H')).toBeTruthy());
    const row = screen.getByTestId('turnout-row-H');
    expect(row.textContent).toMatch(/Often no-show|Hay bùng/);
    expect(row.textContent).toMatch(/20/);
    expect(row.textContent).toMatch(/0\.0/);
  });

  it('shows nothing when the scores cannot be loaded', async () => {
    renderCard({ error: 'forbidden' }, 403, entries);
    await waitFor(() => expect(screen.queryByTestId('turnout-card')).toBeNull());
    expect(document.querySelector('.fsl-turnout-card')).toBeNull();
  });

  it('keeps the fsl- class and testid', async () => {
    renderCard(view, 200, entries);
    await waitFor(() => expect(screen.getByTestId('turnout-card').classList.contains('fsl-turnout-card')).toBe(true));
  });
});

const tripView = {
  trip: { id: 't-1', name: '5AM', currency: 'VND', preset: 'sport', fewestTransfers: true, archived: false, version: 1, total: 0 },
  me: { kind: 'member', participantId: 'p-1', participantPending: false, isOrganiser: true, isAdmin: true },
  people: [
    { id: 'p-1', name: 'Thủy', status: 'active', isMember: true, isOrganiser: true, bank: 'approved', gender: 'F' },
    { id: 'p-2', name: 'Quang', status: 'active', isMember: true, isOrganiser: false, bank: 'none', gender: 'M' },
  ],
  expenses: [],
  payments: [],
  balances: { 'p-1': 0, 'p-2': 0 },
  suggestions: [],
  myBalance: null,
  approvals: [],
  links: { group: 'gtok-1', view: 'vtok-1' },
  locations: [],
  aiBookingExtract: false,
} as unknown as TripView;

function renderForm(path: string) {
  const attendance: AttendanceView = {
    people: [person('p-2', { presence: 10 }, ['rare'])],
    latestSession: null,
    pendingSessions: 0,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/attendance') ? Response.json(attendance) : Response.json(tripView),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/t/:tripId/expenses/new" element={<ExpenseForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('turnout in the plan form', () => {
  it('a rare joiner on the plan shows the back pill linking to /t/:id/awards', async () => {
    renderForm('/t/t-1/expenses/new?mode=planning');
    const pill = await screen.findByTestId('back-pill-p-2');
    expect(pill.getAttribute('href')).toBe('/t/t-1/awards');
    expect(screen.getByTestId('turnout-card')).toBeTruthy();
  });

  it('is not rendered outside planning mode', async () => {
    renderForm('/t/t-1/expenses/new');
    await screen.findByLabelText(/What for|Khoản chi gì/i);
    expect(screen.queryByTestId('turnout-card')).toBeNull();
    expect(screen.queryByTestId('back-pill-p-2')).toBeNull();
  });
});
