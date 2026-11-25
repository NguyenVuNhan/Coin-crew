import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { MyTrips } from '../MyTrips';

const me = {
  user: {
    id: 'u-minh',
    email: 'minh@example.com',
    name: 'Minh',
    consentAt: '2026-10-12T00:00:00.000Z',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MyTrips archived groups toggle', () => {
  it('hides archived groups by default and lazily loads them on Show hidden groups click', async () => {
    const user = userEvent.setup();
    const requestedUrls: string[] = [];

    mockApi({
      'GET /api/me': me,
      'GET /api/trips': (_init: RequestInit | undefined, url: string) => {
        requestedUrls.push(url);
        const archivedParam = new URL(url, 'http://localhost').searchParams.get('archived');
        if (archivedParam === 'only') {
          return Response.json([
            { id: 't-arch', name: 'Hội An', preset: 'trip', archived: true, myBalance: 0 },
          ]);
        }
        return Response.json(
          [{ id: 't-act', name: 'Đà Lạt', preset: 'trip', archived: false, myBalance: 150000 }],
          { headers: { 'X-Archived-Count': '1' } },
        );
      },
    });

    renderAt(<MyTrips />, { route: '/trips' });

    expect(await screen.findByText('Đà Lạt')).toBeInTheDocument();
    expect(screen.queryByText('Hội An')).not.toBeInTheDocument();
    expect(requestedUrls).toEqual(['/api/trips?archived=exclude']);

    const showBtn = screen.getByRole('button', { name: 'Show hidden groups' });
    expect(showBtn).toBeInTheDocument();

    await user.click(showBtn);

    expect(await screen.findByText('Hội An')).toBeInTheDocument();
    expect(screen.getByText('· archived')).toBeInTheDocument();
    expect(requestedUrls).toEqual(['/api/trips?archived=exclude', '/api/trips?archived=only']);

    const hideBtn = screen.getByRole('button', { name: 'Hide hidden groups' });
    await user.click(hideBtn);

    await waitFor(() => {
      expect(screen.queryByText('Hội An')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Show hidden groups' })).toBeInTheDocument();
  });

  it('shows the toggle instead of empty state when there are 0 active groups but archivedCount > 0', async () => {
    const user = userEvent.setup();

    mockApi({
      'GET /api/me': me,
      'GET /api/trips': (_init: RequestInit | undefined, url: string) => {
        const archivedParam = new URL(url, 'http://localhost').searchParams.get('archived');
        if (archivedParam === 'only') {
          return Response.json([
            { id: 't-arch', name: 'Hội An', preset: 'trip', archived: true, myBalance: 50000 },
          ]);
        }
        return Response.json([], { headers: { 'X-Archived-Count': '1' } });
      },
    });

    renderAt(<MyTrips />, { route: '/trips' });

    const showBtn = await screen.findByRole('button', { name: 'Show hidden groups' });
    expect(showBtn).toBeInTheDocument();
    expect(screen.queryByText('Create your first group')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New group' })).toBeInTheDocument();

    await user.click(showBtn);
    expect(await screen.findByText('Hội An')).toBeInTheDocument();
  });

  it('does not render Show hidden groups when X-Archived-Count is 0', async () => {
    mockApi({
      'GET /api/me': me,
      'GET /api/trips': () =>
        Response.json(
          [{ id: 't-act', name: 'Đà Lạt', preset: 'trip', archived: false, myBalance: 0 }],
          { headers: { 'X-Archived-Count': '0' } },
        ),
    });

    renderAt(<MyTrips />, { route: '/trips' });

    expect(await screen.findByText('Đà Lạt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show hidden groups' })).not.toBeInTheDocument();
  });
});
