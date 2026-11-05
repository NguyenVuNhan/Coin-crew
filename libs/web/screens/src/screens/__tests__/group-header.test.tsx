import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { tripView, viewerView } from '../../test/fixtures';
import { TripRoute } from '../TripRoute';
import { People } from '../People';
import { PeopleEntry } from '../../components/PeopleEntry';

afterEach(() => {
  vi.unstubAllGlobals();
});

const route = { route: '/t/t-1', path: '/t/:tripId' };
const peopleRoute = { route: '/t/t-1/people', path: '/t/:tripId/people' };
const TRIP_API = { 'GET /api/trips/t-1/version': { version: 3 } };

describe('group header and People entry', () => {
  it('the header keeps only the gear', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<TripRoute />, route);
    await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' });
    const banner = screen.getAllByRole('banner')[0]!;
    expect(within(banner).getByRole('link', { name: 'Trip settings' })).toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: 'Invite' })).toBeNull();
    expect(within(banner).queryByRole('button', { name: 'Account' })).toBeNull();
  });

  it('a long group name wraps to two lines and keeps the gear', async () => {
    const longName = 'Cầu lông CN tối thứ 5 sân Thành Công quận Đống Đa';
    mockApi({
      ...TRIP_API,
      'GET /api/trips/t-1': tripView({ trip: { ...tripView().trip, name: longName } }),
    });
    renderAt(<TripRoute />, route);
    const heading = await screen.findByRole('heading', { level: 1, name: longName });
    expect(heading).toHaveClass('line-clamp-2');
    expect(heading).not.toHaveClass('truncate');
    expect(screen.getByRole('link', { name: 'Trip settings' })).toBeInTheDocument();
  });

  it('the People entry opens People', async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    renderAt(<TripRoute />, route);
    const entry = await screen.findByRole('link', { name: 'People in this group: 4' });
    expect(entry.getAttribute('href')).toMatch(/\/people$/);
  });

  it('viewers get no People entry', async () => {
    const standalone = renderAt(<PeopleEntry view={viewerView()} />, route);
    expect(screen.queryByRole('link', { name: /People in this group:/ })).toBeNull();
    standalone.unmount();

    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': viewerView() });
    renderAt(<TripRoute />, route);
    await screen.findByText('View only');
    expect(screen.queryByRole('link', { name: /People in this group:/ })).toBeNull();
  });

  it("People's Invite opens the share in Zalo and the sheet on the web", async () => {
    mockApi({ ...TRIP_API, 'GET /api/trips/t-1': tripView() });
    const web = renderAt(<People />, peopleRoute);
    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    expect(await screen.findByRole('dialog', { name: 'Invite' })).toBeInTheDocument();
    web.unmount();

    const platform = fakePlatform();
    renderAt(<People />, { ...peopleRoute, platform });
    await userEvent.click(await screen.findByRole('button', { name: 'Invite Zalo friends' }));
    expect(platform.calls.share).toHaveLength(1);
  });
});
