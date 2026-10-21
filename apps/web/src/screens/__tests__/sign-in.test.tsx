import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { picker, guestChiView, PIDS } from '../../test/fixtures';
import { mockMedia } from '../../test/media';
import { Landing } from '../Landing';
import { WhoAreYou } from '../WhoAreYou';
import { TripRoute } from '../TripRoute';
import { Privacy } from '../Privacy';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Landing sign-in', () => {
  it('Landing offers Google then Zalo in a normal browser', async () => {
    mockApi({ 'GET /api/me': { user: null, signIn: { zalo: true } } });
    renderAt(<Landing />);
    await screen.findByRole('link', { name: 'Sign in with Zalo' });
    const links = screen.getAllByRole('link').filter((l) => /Sign in with (Google|Zalo)/.test(l.textContent ?? ''));
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Sign in with Google');
    expect(links[1]).toHaveTextContent('Sign in with Zalo');
    expect(links[0]).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Ftrips');
    expect(links[1]).toHaveAttribute('href', '/api/auth/zalo/start?returnTo=%2Ftrips');
  });

  it('inside Zalo only Zalo is offered, with the Google hint', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 13) Zalo/22.1 Chrome/110');
    mockApi({ 'GET /api/me': { user: null, signIn: { zalo: true } } });
    renderAt(<Landing />);
    expect(await screen.findByRole('link', { name: 'Sign in with Zalo' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in with Google' })).toBeNull();
    expect(
      screen.getByText('Used Google before? Tap ⋯ → Open in browser to sign in with Google, then link Zalo in the account menu.')
    ).toBeInTheDocument();
  });

  it('Zalo is hidden when not configured', async () => {
    mockApi({ 'GET /api/me': { user: null, signIn: { zalo: false } } });
    renderAt(<Landing />);
    expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in with Zalo' })).toBeNull();
  });
});

describe('GuestTrip sign-in', () => {
  it('GuestTrip offers both ways to become a member', async () => {
    mockMedia({ wide: false });
    vi.stubGlobal('scrollTo', vi.fn());
    mockApi({
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(<TripRoute />, { route: '/t/t-1', path: '/t/:tripId' });

    const google = await screen.findByRole('link', { name: 'Sign in with Google to become a member' });
    const zalo = await screen.findByRole('link', { name: 'Sign in with Zalo to become a member' });

    expect(google).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Ft%2Ft-1%3FbecomeMember%3D1');
    expect(zalo).toHaveAttribute('href', '/api/auth/zalo/start?returnTo=%2Ft%2Ft-1%3FbecomeMember%3D1');
    expect(google.closest('footer')).not.toBeNull();
    expect(zalo.closest('footer')).not.toBeNull();
  });
});

describe('WhoAreYou sign-in & guest note', () => {
  const whoRoute = { route: '/t/t-1/who', path: '/t/:tripId/who' };

  it('Who are you shows the guest note when signed out', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    expect(screen.getByRole('note', { name: 'Joining as a guest' })).toBeInTheDocument();
  });

  it('Who are you hides the guest note when signed in', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': {
        user: { id: 'u1', email: null, name: 'Lan', consentAt: null, providers: ['zalo'] },
        signIn: { zalo: true },
      },
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    await waitFor(() => {
      expect(screen.queryByRole('note', { name: 'Joining as a guest' })).toBeNull();
    });
  });

  it('a member row opens the sign-in sheet', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(<WhoAreYou />, whoRoute);
    const minh = await screen.findByRole('link', { name: /Minh/ });
    await userEvent.click(minh);

    const dialog = await screen.findByRole('dialog', { name: 'Sign in' });
    const google = within(dialog).getByRole('link', { name: 'Sign in with Google' });
    const zalo = within(dialog).getByRole('link', { name: 'Sign in with Zalo' });

    expect(google).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Ft%2Ft-1');
    expect(zalo).toHaveAttribute('href', '/api/auth/zalo/start?returnTo=%2Ft%2Ft-1');
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/who');
  });
});

describe('Smart Name Match', () => {
  const whoRoute = { route: '/t/t-1/who', path: '/t/:tripId/who' };

  const matchPicker = () =>
    picker({
      myPick: null,
      people: [
        { id: PIDS.M, name: 'Minh', status: 'active', isMember: true, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.A, name: 'An', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.B, name: 'Bình', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.C, name: 'Chi', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
      ],
    });

  const meWithName = (name: string) => ({
    user: { id: 'u1', email: null, name, consentAt: null, providers: ['zalo'] },
    signIn: { zalo: true },
  });

  it('matches "Nguyễn Văn Chi" to Chi and shows the account name hint', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': matchPicker(),
      'GET /api/me': meWithName('Nguyễn Văn Chi'),
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^Chi($|(?!\s*Mai\b))/ })).toHaveAttribute('aria-checked', 'true');
    });
    expect(await screen.findByText('Is this you, Chi? Picked from your account name.')).toBeInTheDocument();
  });

  it('prefers exact match over partial match ("Chi" with rows Chi and Chi Mai)', async () => {
    const chiMaiPicker = picker({
      myPick: null,
      people: [
        { id: PIDS.M, name: 'Minh', status: 'active', isMember: true, lastUsedHere: false, activeElsewhere: null },
        { id: 'p-chi', name: 'Chi', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
        { id: 'p-chimai', name: 'Chi Mai', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
      ],
    });
    mockApi({
      'GET /api/trips/t-1/people/picker': chiMaiPicker,
      'GET /api/me': meWithName('Chi'),
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^Chi($|(?!\s*Mai\b))/ })).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByRole('radio', { name: /Chi Mai/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('"Bình An" with rows An and Bình: no radio checked and no hint', async () => {
    const tiePicker = picker({
      myPick: null,
      people: [
        { id: PIDS.M, name: 'Minh', status: 'active', isMember: true, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.A, name: 'An', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.B, name: 'Bình', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
      ],
    });
    const { fetchMock } = mockApi({
      'GET /api/trips/t-1/people/picker': tiePicker,
      'GET /api/me': meWithName('Bình An'),
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/me'), expect.anything()));
    const radios = screen.getAllByRole('radio');
    expect(radios.every((r) => r.getAttribute('aria-checked') !== 'true')).toBe(true);
    expect(screen.queryByText(/Is this you/)).toBeNull();
  });

  it('"Minh": member rows are ignored so no radio is checked', async () => {
    const { fetchMock } = mockApi({
      'GET /api/trips/t-1/people/picker': matchPicker(),
      'GET /api/me': meWithName('Minh'),
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/me'), expect.anything()));
    const radios = screen.getAllByRole('radio');
    expect(radios.every((r) => r.getAttribute('aria-checked') !== 'true')).toBe(true);
    expect(screen.queryByText(/Is this you/)).toBeNull();
  });

  it('myPick:PIDS.B with name "Nguyễn Văn Chi": Bình is checked and no hint is shown', async () => {
    const withMyPick = picker({
      myPick: PIDS.B,
      people: [
        { id: PIDS.M, name: 'Minh', status: 'active', isMember: true, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.A, name: 'An', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.B, name: 'Bình', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
        { id: PIDS.C, name: 'Chi', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null },
      ],
    });
    const { fetchMock } = mockApi({
      'GET /api/trips/t-1/people/picker': withMyPick,
      'GET /api/me': meWithName('Nguyễn Văn Chi'),
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/me'), expect.anything()));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^Bình/ })).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByRole('radio', { name: /^Chi($|(?!\s*Mai\b))/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/Is this you/)).toBeNull();
  });

  it('signed out ({user:null}): no hint is shown', async () => {
    const { fetchMock } = mockApi({
      'GET /api/trips/t-1/people/picker': matchPicker(),
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(<WhoAreYou />, whoRoute);
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/me'), expect.anything()));
    expect(screen.queryByText(/Is this you/)).toBeNull();
  });
});

describe('Privacy notice', () => {
  it('the privacy notice mentions Zalo', () => {
    renderAt(<Privacy />);
    expect(screen.getByText(/Zalo user ID, display name and profile picture/)).toBeInTheDocument();
  });
});
