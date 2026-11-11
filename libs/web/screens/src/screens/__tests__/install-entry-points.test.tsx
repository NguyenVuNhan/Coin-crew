import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import type { InstallContext } from '@cc/web-platform/install';

const state = vi.hoisted(() => ({
  context: 'ios-safari' as string,
  mobile: true,
}));

vi.mock('@cc/web-platform/install', async (orig) => {
  const actual = await orig<typeof import('@cc/web-platform/install')>();
  return {
    ...actual,
    useInstallPrompt: () => ({
      context: state.context as InstallContext,
      mobile: state.mobile,
      installed: false,
      prompt: vi.fn(),
    }),
  };
});

import { __resetInstallVisitForTests } from '../../components/InstallPill';
import { AccountMenu } from '../../components/AccountMenu';
import { Home } from '../Home';
import { Groups } from '../Groups';

const user = {
  id: 'u-me',
  email: 'me@example.com',
  name: 'Me',
  consentAt: '2026-10-12T00:00:00.000Z',
};

function mockHomeApi() {
  mockApi({
    'GET /api/me': { user },
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips': [],
    'GET /api/trips/t-led': tripView({
      trip: {
        id: 't-led',
        name: 'Quick expenses',
        currency: 'VND',
        fewestTransfers: true,
        archived: false,
        version: 1,
        total: 0,
      },
      me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
      people: [{ id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' }],
      expenses: [],
      payments: [],
    }),
    'GET /api/trips/t-led/version': { version: 1 },
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('cc.install.visits', '1');
  __resetInstallVisitForTests();
  state.context = 'ios-safari';
  state.mobile = true;
});

async function openMenu() {
  renderAt(<AccountMenu user={user} />);
  await userEvent.click(screen.getByRole('button', { name: /account/i }));
}

describe('install entry points', () => {
  it('shows the pill on Home before the total', async () => {
    mockHomeApi();
    renderAt(<Home />, { route: '/trips' });
    const pill = await screen.findByTestId('install-pill');
    const total = await screen.findByTestId('home-total');
    expect(pill.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the pill on Groups', async () => {
    mockHomeApi();
    renderAt(<Groups />, { route: '/groups' });
    expect(await screen.findByTestId('install-pill')).toBeTruthy();
  });

  it('adds an account menu row that opens the install sheet', async () => {
    mockHomeApi();
    await openMenu();
    const row = await screen.findByTestId('account-install');
    expect(row.className).toContain('fsl-account-menu__install');
    expect(row.textContent).toContain('Add to home screen');
    await userEvent.click(row);
    expect(await screen.findByTestId('install-sheet')).toBeTruthy();
  });

  it('hides the row and the pill when already standalone', async () => {
    state.context = 'standalone';
    mockHomeApi();
    renderAt(<Home />, { route: '/trips' });
    await screen.findByTestId('home-total');
    expect(screen.queryByTestId('install-pill')).toBeNull();
  });

  it('hides the menu row when standalone', async () => {
    state.context = 'standalone';
    mockHomeApi();
    await openMenu();
    await screen.findByText('Me', { selector: '.fsl-account-menu__name' });
    expect(screen.queryByTestId('account-install')).toBeNull();
  });

  it('on desktop shows the row but no pill', async () => {
    state.mobile = false;
    mockHomeApi();
    renderAt(<Home />, { route: '/trips' });
    await screen.findByTestId('home-total');
    expect(screen.queryByTestId('install-pill')).toBeNull();
  });

  it('on desktop the menu row shows', async () => {
    state.mobile = false;
    mockHomeApi();
    await openMenu();
    expect(await screen.findByTestId('account-install')).toBeTruthy();
  });
});
