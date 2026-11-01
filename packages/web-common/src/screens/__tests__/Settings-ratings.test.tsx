import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { Settings } from '../Settings';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = { route: '/t/t-1/settings', path: '/t/:tripId/settings' };

describe('RatingsSwitch in Settings', () => {
  it('shows the Player ratings switch for a sport group admin and sends PATCH /api/trips/:id', async () => {
    const view = {
      ...sportFundView(),
      ratings: { enabled: false, totalStars: {}, maxStars: 8, myAllocations: {} },
    };
    const { calls } = mockApi({
      'GET /api/trips/t-1': view,
      'PATCH /api/trips/t-1': null,
    });

    renderAt(<Settings />, at);
    const sw = await screen.findByRole('switch', { name: 'Player ratings' });
    expect(sw).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(sw);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH' && c.path === '/api/trips/t-1')?.body).toEqual({
        ratingsEnabled: true,
      }),
    );
  });

  it('hides the Player ratings switch in non-sport groups and for non-admin members', async () => {
    // Non-sport group
    mockApi({ 'GET /api/trips/t-1': tripView() });
    const { unmount } = renderAt(<Settings />, at);
    await screen.findByRole('switch', { name: 'Fewest transfers' });
    expect(screen.queryByRole('switch', { name: 'Player ratings' })).toBeNull();
    unmount();

    // Sport group, non-admin member
    mockApi({ 'GET /api/trips/t-1': sportMemberView() });
    renderAt(<Settings />, at);
    await screen.findByText('People');
    expect(screen.queryByRole('switch', { name: 'Player ratings' })).toBeNull();
  });
});
