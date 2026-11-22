import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../AccountMenu';
import { mockApi, renderAt } from '../../test/render';

const meFixture = {
  user: {
    id: 'u-1',
    name: 'Minh',
    email: 'minh@example.com',
    consentAt: '2026-10-01T00:00:00Z',
    providers: ['google'],
    theme: null,
  },
  signIn: { zalo: false },
  mergeRequests: { incoming: [], outgoing: [] },
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AccountMenu - spending book setting', () => {
  it('is off for a user who never turned it on, and says what it is', async () => {
    // GET /api/me without personalArea
    mockApi({
      'GET /api/me': meFixture,
    });
    renderAt(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    const sw = await screen.findByTestId('account-book');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAccessibleName(/Spending book/);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('turning it on saves, closes the menu and goes to the main screen', async () => {
    let on = false;
    const { calls } = mockApi({
      'GET /api/me': () =>
        Response.json({
          ...meFixture,
          ...(on ? { personalArea: true } : {}),
        }),
      'PATCH /api/me/personal': async (init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        on = Boolean(body.enabled);
        return Response.json({ enabled: on });
      },
    });
    renderAt(<AccountMenu />, { route: '/groups' });
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    await userEvent.click(await screen.findByTestId('account-book'));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/api/me/personal',
        body: { enabled: true },
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('account-book')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
    expect(localStorage.getItem('personalArea')).toBe('1');
  });

  it('turning it off saves and the menu stays open', async () => {
    let on = true;
    mockApi({
      'GET /api/me': () => Response.json({ ...meFixture, ...(on ? { personalArea: true } : {}) }),
      'PATCH /api/me/personal': async () => {
        on = false;
        return Response.json({ enabled: false });
      },
    });
    renderAt(<AccountMenu />, { route: '/groups' });
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    const sw = await screen.findByTestId('account-book');
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    await userEvent.click(sw);

    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    await waitFor(() => expect(sw).not.toBeDisabled());
    expect(screen.getByTestId('account-book')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/groups$/);
  });

  it('shows what was asked for while the save is on its way, and names the trial', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let on = false;
    mockApi({
      'GET /api/me': () => Response.json({ ...meFixture, ...(on ? { personalArea: true } : {}) }),
      'PATCH /api/me/personal': async () => {
        await held;
        on = true;
        return Response.json({ enabled: true });
      },
    });
    renderAt(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    const sw = await screen.findByTestId('account-book');
    expect(sw).toHaveAccessibleDescription(/Beta/);
    await userEvent.click(sw);

    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    expect(sw).toBeDisabled();

    release();
    await waitFor(() => expect(screen.queryByTestId('account-book')).not.toBeInTheDocument());
  });

  it('a failed save flips it back and says so', async () => {
    // PATCH /api/me/personal → 500
    mockApi({
      'GET /api/me': meFixture,
      'PATCH /api/me/personal': () =>
        Response.json(
          { error: { code: 'SERVER_ERROR', message: 'Internal error' } },
          { status: 500 },
        ),
    });
    renderAt(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    await userEvent.click(await screen.findByTestId('account-book'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('account-book')).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('personalArea')).toBeNull();
  });
});
