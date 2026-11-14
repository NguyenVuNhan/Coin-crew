// @vitest-environment jsdom
import '../test/setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { newScore, type AttendancePerson, type AttendanceView, type TripView } from '@cc/core';
import { PlatformProvider, browserPlatform, type PlatformBridge } from '@cc/web-platform';
import * as memeCards from '@cc/web-util/memeCards';
import { CrewAwards } from '../screens/CrewAwards';
import { MemberTrip } from '../screens/MemberTrip';
import { TurnoutSheet } from '../components/TurnoutSheet';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const person = (
  id: string,
  over: Partial<ReturnType<typeof newScore>>,
  labels: AttendancePerson['labels'] = [],
  wantedStamp = false,
): AttendancePerson => ({
  participantId: id,
  score: { ...newScore(id), sessionsSeen: 10, sessionsPlanned: 10, ...over },
  labels,
  wantedStamp,
});

const baseTrip: TripView = {
  trip: {
    id: 't-1',
    name: 'Cầu lông Thứ Bảy',
    currency: 'VND',
    preset: 'sport',
    fewestTransfers: true,
    archived: false,
    version: 1,
    total: 0,
  },
  me: {
    kind: 'member',
    participantId: 'p-1',
    participantPending: false,
    isOrganiser: true,
    isAdmin: true,
  },
  people: [
    { id: 'p-1', name: 'An', status: 'active', isMember: true, isOrganiser: true, isAdmin: true, bank: 'approved', gender: 'M' },
    { id: 'p-2', name: 'Chi', status: 'active', isMember: true, bank: 'none', gender: 'F' },
    { id: 'p-3', name: 'Dũng', status: 'active', isMember: true, bank: 'none', gender: 'M' },
    { id: 'p-4', name: 'Bình', status: 'active', isMember: true, bank: 'none', gender: 'M' },
    { id: 'p-5', name: 'Hải', status: 'active', isMember: true, bank: 'none', gender: 'M' },
  ],
  expenses: [],
  payments: [],
  balances: { 'p-1': 0, 'p-2': 0, 'p-3': 0, 'p-4': 0, 'p-5': 0 },
  suggestions: [],
  myBalance: null,
  approvals: [],
  links: { group: 'gtok-1', view: 'vtok-1' },
  locations: [],
  aiBookingExtract: false,
};

const fullAttendance: AttendanceView = {
  people: [
    person('p-1', { presence: 90, presenceJoinStreak: 12 }, ['regular']),
    person('p-2', { presence: 30, lastBack: true, lastReturnGap: 6 }, ['back']),
    person('p-3', { guest: 4, guestsTotal: 9 }, ['topGuest']),
    person('p-4', { reliability: 35, reliabilitySkipStreak: 3, lastPlayedOn: '2026-10-18' }, ['flaky'], false),
    person('p-5', { reliability: 42, reliabilitySkipStreak: 0, lastEndedNoShowStreak: 2, lastPlayedOn: '2026-11-15' }, ['flaky'], true),
  ],
  latestSession: { rootId: 'r-1', spentOn: '2026-11-15' },
  pendingSessions: 0,
};

function renderAwards({
  trip = baseTrip,
  attendance = fullAttendance,
  platform = browserPlatform,
}: {
  trip?: TripView;
  attendance?: AttendanceView;
  platform?: PlatformBridge;
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/attendance') ? Response.json(attendance) : Response.json(trip),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <PlatformProvider platform={platform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1/awards']}>
          <Routes>
            <Route path="/t/:tripId" element={<div data-testid="trip-home">Trip Home</div>} />
            <Route path="/t/:tripId/awards" element={<CrewAwards />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

describe('CrewAwards screen', () => {
  it('empty state: no counted or preview sessions → an empty message, no cards', async () => {
    renderAwards({
      attendance: { people: [], latestSession: null, pendingSessions: 0 },
    });
    await waitFor(() => expect(screen.getByTestId('awards-empty')).toBeTruthy());
    expect(screen.queryByTestId('meme-card-awards')).toBeNull();
    expect(screen.queryByTestId('meme-card-wanted')).toBeNull();
    expect(screen.queryByTestId('meme-card-verse')).toBeNull();
    expect(screen.queryByTestId('meme-card-board')).toBeNull();
  });

  it('only admins reach the screen: a member is redirected, as on RatingsScreen', async () => {
    const memberTrip: TripView = {
      ...baseTrip,
      me: {
        kind: 'member',
        participantId: 'p-2',
        participantPending: false,
        isOrganiser: false,
        isAdmin: false,
      },
    };
    renderAwards({ trip: memberTrip });
    await waitFor(() => expect(screen.getByTestId('trip-home')).toBeTruthy());
    expect(screen.queryByTestId('meme-card-awards')).toBeNull();
  });

  it('Save calls platform.saveImage with a PNG named crew-awards-<kind>.png', async () => {
    const fakeBlob = new Blob(['png-bytes'], { type: 'image/png' });
    vi.spyOn(memeCards, 'renderMemePng').mockResolvedValue(fakeBlob);
    const saveImage = vi.fn<PlatformBridge['saveImage']>(async () => 'saved');
    const platform: PlatformBridge = { ...browserPlatform, saveImage };

    renderAwards({ platform });
    const saveBtn = await screen.findByTestId('save-awards');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveImage).toHaveBeenCalledWith(fakeBlob, 'crew-awards-awards.png');
    });
  });

  it('Share on zmp calls platform.share', async () => {
    const fakeBlob = new Blob(['png-bytes'], { type: 'image/png' });
    vi.spyOn(memeCards, 'renderMemePng').mockResolvedValue(fakeBlob);
    const share = vi.fn<PlatformBridge['share']>(async () => 'shared');
    const saveImage = vi.fn<PlatformBridge['saveImage']>(async () => 'saved');
    const zmpPlatform: PlatformBridge = { ...browserPlatform, kind: 'zmp', share, saveImage };

    renderAwards({ platform: zmpPlatform });
    const shareBtn = await screen.findByTestId('share-awards');
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(share).toHaveBeenCalledTimes(1);
    });
  });

  it('wanted picker lists flaky people and shows the stamp variant when wantedStamp', async () => {
    renderAwards();
    const pickBinh = await screen.findByTestId('wanted-pick-p-4');
    const pickHai = await screen.findByTestId('wanted-pick-p-5');
    expect(pickBinh.textContent).toContain('Bình');
    expect(pickHai.textContent).toContain('Hải');

    // First candidate (Bình) has wantedStamp = false
    expect(screen.queryByTestId('wanted-stamp')).toBeNull();

    // Selecting Hải (wantedStamp = true) shows the stamp
    fireEvent.click(pickHai);
    await waitFor(() => expect(screen.getByTestId('wanted-stamp')).toBeTruthy());
    expect(screen.getByTestId('wanted-stamp').textContent).toMatch(/ĐÃ RA SÂN|BACK ON COURT/i);
  });

  it('reduced motion: cards render with no animation classes active', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const { container } = renderAwards();
    await screen.findByTestId('meme-card-awards');

    const animated = container.querySelectorAll('[class*="animate-["]');
    expect(animated.length).toBe(0);
  });

  it('shows Replay button per card and renders shuttlecock as SVG', async () => {
    const { container } = renderAwards();
    await screen.findByTestId('meme-card-awards');
    expect(screen.getByTestId('replay-awards')).toBeTruthy();
    expect(screen.getByTestId('replay-wanted')).toBeTruthy();
    expect(screen.getByTestId('replay-verse')).toBeTruthy();
    expect(screen.getByTestId('replay-board')).toBeTruthy();
    expect(container.querySelectorAll('svg[viewBox="0 0 24 32"]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('replay-awards'));
    expect(screen.getByTestId('meme-card-awards')).toBeTruthy();
  });

  it('MemberTrip shows Crew awards entry for sport admins only, and TurnoutSheet links to awards with neutral flaky pill', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1']}>
          <MemberTrip view={baseTrip} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const entry = screen.getByTestId('crew-awards-entry');
    expect(entry.getAttribute('href')).toBe('/t/t-1/awards');
    unmount();

    const nonAdminTrip: TripView = {
      ...baseTrip,
      me: { ...baseTrip.me, isOrganiser: false, isAdmin: false },
    };
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/t/t-1']}>
          <MemberTrip view={nonAdminTrip} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('crew-awards-entry')).toBeNull();

    render(
      <MemoryRouter initialEntries={['/t/t-1']}>
        <Routes>
          <Route
            path="/t/:tripId"
            element={
              <TurnoutSheet
                open={true}
                onClose={() => undefined}
                rows={[
                  {
                    participantId: 'p-4',
                    name: 'Bình',
                    person: person('p-4', { reliability: 35 }, ['flaky']),
                  },
                ]}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByTestId('turnout-awards-link');
    expect(link.getAttribute('href')).toBe('/t/t-1/awards');
    const row = screen.getByTestId('turnout-row-p-4');
    expect(row.innerHTML).not.toContain('warning');
  });
});
