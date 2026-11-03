import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { picker } from '../../test/fixtures';
import { browserPlatform } from '../../platform';
import { ClaimSheet } from '../ClaimSheet';
import { WhoAreYou } from '../../screens/WhoAreYou';

const ZALO_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Zalo/12.0';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

let uaSpy: MockInstance | undefined;

afterEach(() => {
  uaSpy?.mockRestore();
  uaSpy = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ClaimSheet', () => {
  it('renders avatar, title, body, and primary Zalo button with claim intent', async () => {
    mockApi({
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(
      <ClaimSheet
        open
        name="Lan"
        tripId="t-1"
        participantId="p-lan"
        returnTo="/t/t-1"
        onClose={vi.fn()}
      />,
    );

    const sheet = screen.getByTestId('claim-sheet');
    expect(sheet).toBeInTheDocument();
    expect(screen.getByText('Continue as Lan')).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        "Google doesn't work inside Zalo. Sign in with Zalo to continue. If Lan uses Google, their Google account will be asked to approve.",
      ),
    ).toBeInTheDocument();

    const zaloBtn = within(sheet).getByRole('link', { name: /Sign in with Zalo/i });
    expect(zaloBtn).toHaveAttribute(
      'href',
      '/api/auth/zalo/start?returnTo=%2Ft%2Ft-1&intent=claim&trip=t-1&pid=p-lan',
    );
  });

  it('links to intent:// Chrome on Android UA', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_ANDROID_UA);
    mockApi({
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(
      <ClaimSheet
        open
        name="Lan"
        tripId="t-1"
        participantId="p-lan"
        returnTo="/t/t-1"
        onClose={vi.fn()}
      />,
    );

    const sheet = screen.getByTestId('claim-sheet');
    const openBrowserBtn = within(sheet).getByRole('link', { name: 'Open in browser' });
    expect(openBrowserBtn).toHaveAttribute('href', expect.stringContaining('intent://'));
    expect(openBrowserBtn).toHaveAttribute('href', expect.stringContaining('package=com.android.chrome'));
  });

  it('reveals steps inline when tapped on iPhone (null browserUrl)', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    mockApi({
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(
      <ClaimSheet
        open
        name="Lan"
        tripId="t-1"
        participantId="p-lan"
        returnTo="/t/t-1"
        onClose={vi.fn()}
      />,
    );

    const sheet = screen.getByTestId('claim-sheet');
    const openBrowserBtn = within(sheet).getByRole('button', { name: 'Open in browser' });
    expect(openBrowserBtn).not.toHaveAttribute('href');
    expect(within(sheet).queryByText('Tap ⋯ → Open in browser')).toBeNull();

    await userEvent.click(openBrowserBtn);
    expect(within(sheet).getByText('Tap ⋯ → Open in browser')).toBeInTheDocument();
  });

  it('hides Zalo button and shows message when me.signIn.zalo is false', async () => {
    mockApi({
      'GET /api/me': { user: null, signIn: { zalo: false } },
    });
    renderAt(
      <ClaimSheet
        open
        name="Lan"
        tripId="t-1"
        participantId="p-lan"
        returnTo="/t/t-1"
        onClose={vi.fn()}
      />,
    );

    const sheet = await screen.findByTestId('claim-sheet');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "Zalo sign-in isn't available right now. Open in browser to use Google.",
    );
    expect(within(sheet).queryByRole('link', { name: /Sign in with Zalo/i })).toBeNull();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    mockApi({
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });
    renderAt(
      <ClaimSheet
        open
        name="Lan"
        tripId="t-1"
        participantId="p-lan"
        returnTo="/t/t-1"
        onClose={onClose}
      />,
    );

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WhoAreYou with ClaimSheet integration', () => {
  it('opens claim-sheet when tapping member row in Zalo browser (platform.kind web)', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_ANDROID_UA);
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });

    renderAt(<WhoAreYou />, { route: '/t/t-1/who', path: '/t/:tripId/who' });

    const memberRow = await screen.findByText('Minh');
    await userEvent.click(memberRow);

    const sheet = await screen.findByTestId('claim-sheet');
    expect(sheet).toBeInTheDocument();
    const zaloLink = within(sheet).getByRole('link', { name: /Sign in with Zalo/i });
    expect(zaloLink).toHaveAttribute(
      'href',
      expect.stringContaining('/api/auth/zalo/start?returnTo=%2Ft%2Ft-1&intent=claim&trip=t-1&pid=p-minh'),
    );
  });

  it('does not open claim-sheet in zmp', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_ANDROID_UA);
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });

    renderAt(<WhoAreYou />, {
      route: '/t/t-1/who',
      path: '/t/:tripId/who',
      platform: { ...browserPlatform, kind: 'zmp' },
    });

    const memberRow = await screen.findByText('Minh');
    await userEvent.click(memberRow);

    expect(screen.queryByTestId('claim-sheet')).toBeNull();
  });

  it('opens today SignInSheet outside Zalo', async () => {
    mockApi({
      'GET /api/trips/t-1/people/picker': picker(),
      'GET /api/me': { user: null, signIn: { zalo: true } },
    });

    renderAt(<WhoAreYou />, { route: '/t/t-1/who', path: '/t/:tripId/who' });

    const memberRow = await screen.findByText('Minh');
    await userEvent.click(memberRow);

    expect(screen.queryByTestId('claim-sheet')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
