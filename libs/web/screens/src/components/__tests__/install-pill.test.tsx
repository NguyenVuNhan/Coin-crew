import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import type { InstallContext } from '@cc/web-platform/install';

const state = vi.hoisted(() => ({
  context: 'ios-safari' as string,
  mobile: true,
  installed: false,
}));

vi.mock('@cc/web-platform/install', async (orig) => {
  const actual = await orig<typeof import('@cc/web-platform/install')>();
  return {
    ...actual,
    useInstallPrompt: () => ({
      context: state.context as InstallContext,
      mobile: state.mobile,
      installed: state.installed,
      prompt: vi.fn(),
    }),
  };
});

import { InstallPill, __resetInstallVisitForTests } from '../InstallPill';

const USER = { user: { id: 'u1', name: 'An', email: null, avatarUrl: null } };

beforeEach(() => {
  localStorage.clear();
  __resetInstallVisitForTests();
  state.context = 'ios-safari';
  state.mobile = true;
  state.installed = false;
  mockApi({ 'GET /api/me': USER });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstallPill', () => {
  it('shows from the second visit and opens the install sheet', async () => {
    localStorage.setItem('cc.install.visits', '1');
    renderAt(<InstallPill />);
    const pill = await screen.findByTestId('install-pill');
    await userEvent.click(pill.querySelector('button:not(.fsl-install-pill__close)')!);
    expect(await screen.findByTestId('install-sheet')).toBeTruthy();
  });

  it('hides on the first visit and counts a visit once per page load', async () => {
    renderAt(
      <>
        <InstallPill />
        <InstallPill />
      </>,
    );
    await waitFor(() => expect(localStorage.getItem('cc.install.visits')).toBe('1'));
    expect(screen.queryByTestId('install-pill')).toBeNull();
  });

  it('does nothing when signed out', async () => {
    mockApi({ 'GET /api/me': { user: null } });
    renderAt(<InstallPill />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('install-pill')).toBeNull();
    expect(localStorage.getItem('cc.install.visits')).toBeNull();
  });

  it.each([
    ['standalone', () => (state.context = 'standalone')],
    ['installed', () => (state.installed = true)],
    ['desktop', () => (state.mobile = false)],
  ])('hides when %s', async (_n, apply) => {
    apply();
    localStorage.setItem('cc.install.visits', '3');
    renderAt(<InstallPill />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('install-pill')).toBeNull();
  });

  it('hides inside the Zalo Mini App', async () => {
    state.context = 'in-app';
    localStorage.setItem('cc.install.visits', '3');
    renderAt(<InstallPill />, { platform: fakePlatform({ kind: 'zmp' }) });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('install-pill')).toBeNull();
  });

  it('dismisses for good', async () => {
    localStorage.setItem('cc.install.visits', '1');
    const { unmount } = renderAt(<InstallPill />);
    await screen.findByTestId('install-pill');
    const close = document.querySelector('.fsl-install-pill__close') as HTMLElement;
    expect(close.getAttribute('aria-label')).toBe('Dismiss');
    await userEvent.click(close);
    await waitFor(() => expect(screen.queryByTestId('install-pill')).toBeNull());
    expect(localStorage.getItem('cc.install.dismissed')).toBe('1');
    unmount();
    renderAt(<InstallPill />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('install-pill')).toBeNull();
  });

  it('survives storage that throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderAt(<InstallPill />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('install-pill')).toBeNull();
  });
});
