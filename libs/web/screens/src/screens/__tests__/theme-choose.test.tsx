import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ThemeId } from '@cc/core';
import { AccountMenu } from '../../components/AccountMenu';
import { Settings } from '../Settings';
import { mockApi, renderAt } from '../../test/render';
import { PIDS, tripView } from '../../test/fixtures';

describe('choosing a theme', () => {
  it("the account menu's Theme row opens the picker, and Orchid saves straight away", async () => {
    const user = userEvent.setup();
    let savedTheme: ThemeId | null = null;
    const { calls } = mockApi({
      'GET /api/me': () =>
        Response.json({
          user: {
            id: 'u-1',
            name: 'Minh',
            email: 'minh@example.com',
            consentAt: '2026-10-01T00:00:00Z',
            providers: ['google'],
            theme: savedTheme,
          },
          signIn: { zalo: false },
          mergeRequests: { incoming: [], outgoing: [] },
        }),
      'PATCH /api/me': (init: RequestInit | undefined) => {
        const body = JSON.parse(String(init?.body)) as { theme: ThemeId | null };
        savedTheme = body.theme;
        return Response.json({ ok: true });
      },
    });

    renderAt(<AccountMenu />);

    const trigger = await screen.findByRole('button', { name: 'Account' });
    await user.click(trigger);

    const themeRow = await screen.findByRole('button', { name: /Theme/i });
    expect(themeRow).toHaveClass('fsl-account-menu__theme');
    expect(themeRow).toHaveTextContent('Jade');

    await user.click(themeRow);

    await screen.findByRole('radiogroup', { name: 'Theme' });
    expect(screen.getByRole('radio', { name: 'Jade' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: 'Orchid' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH' && c.path === '/api/me');
      expect(patch?.body).toEqual({ theme: 'orchid' });
    });

    expect(screen.getByRole('radio', { name: 'Orchid' })).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('theme')).toBe('orchid');
  });

  it('a failed save reverts and shows the error', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': {
        user: {
          id: 'u-1',
          name: 'Minh',
          email: 'minh@example.com',
          consentAt: '2026-10-01T00:00:00Z',
          providers: ['google'],
          theme: 'jade',
        },
        signIn: { zalo: false },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'PATCH /api/me': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'Server error' } }, { status: 500 }),
    });

    renderAt(<AccountMenu />);

    const trigger = await screen.findByRole('button', { name: 'Account' });
    await user.click(trigger);

    const themeRow = await screen.findByRole('button', { name: /Theme/i });
    await user.click(themeRow);

    await user.click(await screen.findByRole('radio', { name: 'Orchid' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Jade' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Orchid' })).toHaveAttribute('aria-checked', 'false');
    });
    expect(localStorage.getItem('theme')).toBe('jade');
  });

  it('an admin sets Group colours', async () => {
    const user = userEvent.setup();
    let groupTheme: ThemeId | null = null;
    const { calls } = mockApi({
      'GET /api/trips/t-1': () => {
        const base = tripView();
        return Response.json({ ...base, trip: { ...base.trip, theme: groupTheme } });
      },
      'PATCH /api/trips/t-1': (init: RequestInit | undefined) => {
        const body = JSON.parse(String(init?.body)) as { theme: ThemeId | null };
        groupTheme = body.theme;
        return Response.json({ ok: true });
      },
    });

    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    const row = await screen.findByRole('button', { name: /Group colours/i });
    expect(row).toHaveClass('fsl-settings__colours');
    expect(row).toHaveTextContent("Each person's own theme");

    await user.click(row);

    await screen.findByRole('radiogroup', { name: 'Group colours' });
    await user.click(screen.getByRole('radio', { name: 'Sky' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH' && c.path === '/api/trips/t-1');
      expect(patch?.body).toEqual({ theme: 'sky' });
    });

    expect(screen.getByRole('radio', { name: 'Sky' })).toHaveAttribute('aria-checked', 'true');
  });

  it("Each person's own theme sends null", async () => {
    const user = userEvent.setup();
    let groupTheme: ThemeId | null = 'sky';
    const { calls } = mockApi({
      'GET /api/trips/t-1': () => {
        const base = tripView();
        return Response.json({ ...base, trip: { ...base.trip, theme: groupTheme } });
      },
      'PATCH /api/trips/t-1': (init: RequestInit | undefined) => {
        const body = JSON.parse(String(init?.body)) as { theme: ThemeId | null };
        groupTheme = body.theme;
        return Response.json({ ok: true });
      },
    });

    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    const row = await screen.findByRole('button', { name: /Group colours/i });
    expect(row).toHaveTextContent('Sky');
    await user.click(row);

    await screen.findByRole('radiogroup', { name: 'Group colours' });
    expect(screen.getByRole('radio', { name: 'Sky' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: "Each person's own theme" }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH' && c.path === '/api/trips/t-1');
      expect(patch?.body).toEqual({ theme: null });
    });

    expect(screen.getByRole('radio', { name: "Each person's own theme" })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('a plain member sees no Group colours row', async () => {
    const base = tripView({
      me: {
        kind: 'member',
        participantId: PIDS.A,
        participantPending: false,
        isOrganiser: false,
        isAdmin: false,
      },
    });
    mockApi({
      'GET /api/trips/t-1': base,
    });

    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    await screen.findByText('People');
    expect(screen.queryByRole('button', { name: /Group colours/i })).toBeNull();
    expect(document.querySelector('.fsl-settings__colours')).toBeNull();
  });

  it('no Group colours row in an archived group', async () => {
    const base = tripView();
    mockApi({
      'GET /api/trips/t-1': {
        ...base,
        trip: { ...base.trip, archived: true },
      },
    });

    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    await screen.findByText('People');
    expect(screen.queryByRole('button', { name: /Group colours/i })).toBeNull();
    expect(document.querySelector('.fsl-settings__colours')).toBeNull();
  });
});
