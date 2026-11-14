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
    const statusEl = await screen.findByRole('status');
    expect(statusEl.textContent).toMatch(/Đã lưu ảnh|Picture saved/i);
  });

  it('saveImage resolving failed shows the failure alert message and renderMemePng null bails out', async () => {
    const fakeBlob = new Blob(['png-bytes'], { type: 'image/png' });
    const renderSpy = vi.spyOn(memeCards, 'renderMemePng').mockResolvedValue(fakeBlob);
    const saveImage = vi.fn<PlatformBridge['saveImage']>(async () => 'failed');
    const platform: PlatformBridge = { ...browserPlatform, saveImage };

    renderAwards({ platform });
    const saveBtn = await screen.findByTestId('save-awards');
    fireEvent.click(saveBtn);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Chưa lưu được ảnh|Couldn't save the picture/i);
    expect(saveImage).toHaveBeenCalledTimes(1);

    // When renderMemePng returns null, saveImage is never called with an empty Blob.
    saveImage.mockClear();
    renderSpy.mockResolvedValueOnce(null);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(renderSpy).toHaveBeenCalledTimes(2));
    expect(saveImage).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Chưa lưu được ảnh|Couldn't save the picture/i);
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

  it('wanted picker lists flaky people, shows stamp variant, and renders profile photo with fallback', async () => {
    const tripWithAvatar: TripView = {
      ...baseTrip,
      people: baseTrip.people.map((p) =>
        p.id === 'p-4' ? { ...p, avatarUrl: 'https://cdn.example/binh.jpg' } : p,
      ),
    };
    renderAwards({ trip: tripWithAvatar });
    const nextBtn = await screen.findByTestId('story-next');
    fireEvent.click(nextBtn);

    const pickBinh = await screen.findByTestId('wanted-pick-p-4');
    const pickHai = await screen.findByTestId('wanted-pick-p-5');
    expect(pickBinh.textContent).toContain('Bình');
    expect(pickHai.textContent).toContain('Hải');

    // First candidate (Bình) has avatarUrl and wantedStamp = false
    const wantedCard = screen.getByTestId('meme-card-wanted');
    const img = wantedCard.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example/binh.jpg');
    expect(screen.queryByTestId('wanted-stamp')).toBeNull();

    // Broken avatar falls back to initials
    fireEvent.error(img!);
    expect(wantedCard.querySelector('img')).toBeNull();
    expect(wantedCard.textContent).toContain('Bì');

    // Selecting Hải (wantedStamp = true) shows the stamp
    fireEvent.click(pickHai);
    await waitFor(() => expect(screen.getByTestId('wanted-stamp')).toBeTruthy());
    expect(screen.getByTestId('wanted-stamp').textContent).toMatch(/ĐÃ RA SÂN|BACK ON COURT/i);
  });

  it('reduced motion: cards render with no animation classes active and fade transition', async () => {
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
    expect(screen.getByTestId('story-viewport').getAttribute('data-transition')).toBe('fade');
  });

  it('shows Replay button per slide across story navigation and renders shuttlecock as SVG', async () => {
    const { container } = renderAwards();
    await screen.findByTestId('meme-card-awards');
    expect(screen.getByTestId('story-progress').children.length).toBe(4);
    expect(screen.getByTestId('replay-awards')).toBeTruthy();
    expect(container.querySelectorAll('svg[viewBox="0 0 24 32"]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('replay-awards'));
    expect(screen.getByTestId('meme-card-awards')).toBeTruthy();

    fireEvent.click(screen.getByTestId('story-next'));
    expect(await screen.findByTestId('replay-wanted')).toBeTruthy();

    fireEvent.click(screen.getByTestId('story-next'));
    expect(await screen.findByTestId('replay-verse')).toBeTruthy();

    fireEvent.click(screen.getByTestId('story-next'));
    expect(await screen.findByTestId('replay-board')).toBeTruthy();

    // Close returns to trip home
    fireEvent.click(screen.getByTestId('story-close'));
    await waitFor(() => expect(screen.getByTestId('trip-home')).toBeTruthy());
  });

  it('story navigation supports keyboard, left-tap restart vs prev, hold-to-pause, and stops on final slide', async () => {
    let now = 0;
    let rafId = 0;
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = ++rafId;
      rafCallbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks.delete(id);
    });
    const flushFrame = (ms: number) => {
      now += ms;
      const pending = Array.from(rafCallbacks.values());
      rafCallbacks.clear();
      for (const cb of pending) cb(now);
    };

    renderAwards();
    await screen.findByTestId('meme-card-awards');

    // Auto-advance after 7000ms
    flushFrame(7100);
    expect(await screen.findByTestId('meme-card-wanted')).toBeTruthy();

    // Left tap after >= 1500ms restarts wanted slide instead of going back
    flushFrame(2000);
    const viewport = screen.getByTestId('story-viewport');
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 300, top: 0, height: 500, right: 300, bottom: 500 }),
    });
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 40, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 40, clientY: 200 });
    expect(screen.getByTestId('meme-card-wanted')).toBeTruthy();

    // Left tap before 1500ms steps back to awards
    flushFrame(300);
    fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 40, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 40, clientY: 200 });
    expect(await screen.findByTestId('meme-card-awards')).toBeTruthy();

    // Hold >= 180ms pauses progress and release does not tap-skip
    vi.useFakeTimers();
    fireEvent.pointerDown(viewport, { pointerId: 3, clientX: 250, clientY: 200 });
    vi.advanceTimersByTime(220);
    flushFrame(7500);
    expect(screen.getByTestId('meme-card-awards')).toBeTruthy();
    fireEvent.pointerUp(viewport, { pointerId: 3, clientX: 250, clientY: 200 });
    expect(screen.getByTestId('meme-card-awards')).toBeTruthy();
    vi.useRealTimers();

    // Keyboard ArrowRight to final slide, timer stops cleanly on final slide without closing
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByTestId('meme-card-board')).toBeTruthy();
    flushFrame(10000);
    expect(screen.getByTestId('meme-card-board')).toBeTruthy();
    expect(screen.queryByTestId('trip-home')).toBeNull();

    // Escape closes story
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('trip-home')).toBeTruthy());
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

  it('captures pointer during gestures, springs back sub-threshold swipes, and handles rapid double key steps', async () => {
    renderAwards();
    await screen.findByTestId('meme-card-awards');

    // Rapid double ArrowRight before re-render advances 2 slides (awards -> wanted -> verse)
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByTestId('meme-card-verse')).toBeTruthy();

    // Pointer capture & spring-back on sub-threshold drag
    const viewport = screen.getByTestId('story-viewport');
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    viewport.setPointerCapture = setPointerCapture;
    viewport.releasePointerCapture = releasePointerCapture;

    fireEvent.pointerDown(viewport, { pointerId: 7, clientX: 150, clientY: 200 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 120, clientY: 200 });
    fireEvent.pointerUp(viewport, { pointerId: 7, clientX: 120, clientY: 200 });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    // Stays on verse and cube wrapper animates spring-back with transition-transform
    expect(screen.getByTestId('meme-card-verse')).toBeTruthy();
    expect(viewport.firstElementChild?.className).toContain('transition-transform');
  });
});
