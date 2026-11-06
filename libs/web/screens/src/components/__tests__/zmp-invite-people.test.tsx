import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { tripView } from '../../test/fixtures';
import type { ShareCard } from '@cc/web-platform';
import { People } from '../../screens/People';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const peopleRoute = { route: '/t/t-1/people', path: '/t/:tripId/people' };

describe('People: invite Zalo friends', () => {
  it('zmp: forwards the group invite card through Zalo share', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    const platform = fakePlatform({ kind: 'zmp' });
    renderAt(<People />, { ...peopleRoute, platform });

    const button = await screen.findByRole('button', { name: 'Invite Zalo friends' });
    expect(button).toHaveClass('fsl-people__invite-zalo');
    await userEvent.click(button);

    expect(platform.calls.share).toHaveLength(1);
    const card = platform.calls.share[0]![0] as ShareCard;
    expect(card.path).toBe('j/gtok-1');
  });

  it('hidden on the web', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<People />, peopleRoute);
    await screen.findByRole('button', { name: /^Minh,/ });
    expect(document.querySelector('.fsl-people__invite-zalo')).toBeNull();
  });

  it('hidden when the group is archived', async () => {
    const base = tripView();
    mockApi({ 'GET /api/trips/t-1': { ...base, trip: { ...base.trip, archived: true } } });
    renderAt(<People />, { ...peopleRoute, platform: fakePlatform({ kind: 'zmp' }) });
    await screen.findByRole('button', { name: /^Minh,/ });
    expect(document.querySelector('.fsl-people__invite-zalo')).toBeNull();
  });
});
