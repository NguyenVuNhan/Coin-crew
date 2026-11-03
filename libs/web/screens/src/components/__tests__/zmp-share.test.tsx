import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import type { ShareCard } from '../../platform';
import { InviteSheet } from '../InviteSheet';
import { YourTransfers } from '../YourTransfers';
import { PersonScreen } from '../../screens/PersonScreen';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('zmp share cards', () => {
  it('zmp: invite shares a card', async () => {
    const navShare = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: navShare });

    const fake = fakePlatform();
    const view = tripView();

    renderAt(<InviteSheet view={view} open onClose={() => {}} />, { platform: fake });

    const sheet = await screen.findByRole('dialog', { name: 'Invite' });
    const groupFieldset = within(sheet).getByRole('group', { name: 'Group link' });
    await userEvent.click(within(groupFieldset).getByRole('button', { name: 'Share' }));

    expect(fake.calls.share ?? []).toHaveLength(1);
    const card = fake.calls.share![0]![0] as ShareCard;
    expect(card.path).toMatch(/^j\//);
    expect(navShare).not.toHaveBeenCalled();
  });

  it('zmp: remind shares a card with the reminder text', async () => {
    const fake = fakePlatform();
    const view = guestChiView();

    mockApi({
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: {
        to: { id: PIDS.M, name: 'Minh' },
        amount: 1245000,
        bankState: 'none',
        bank: null,
        payload: null,
        inFlight: [],
      },
    });

    renderAt(<YourTransfers view={view} />, { platform: fake });

    const row = screen.getByRole('button', { name: /^You → Minh/ });
    await userEvent.click(row);

    const remindBtn = await screen.findByRole('button', { name: 'Remind Minh' });
    await userEvent.click(remindBtn);

    expect(fake.calls.share ?? []).toHaveLength(1);
    const card = fake.calls.share![0]![0] as ShareCard;
    expect(card.path).toMatch(/^j\//);
    expect(card.text).toContain('Minh');
  });

  it('zmp: cancelled share shows nothing', async () => {
    const fake = fakePlatform({ share: async () => 'cancelled' });
    const view = tripView();

    renderAt(<InviteSheet view={view} open onClose={() => {}} />, { platform: fake });

    const sheet = await screen.findByRole('dialog', { name: 'Invite' });
    const groupFieldset = within(sheet).getByRole('group', { name: 'Group link' });
    await userEvent.click(within(groupFieldset).getByRole('button', { name: 'Share' }));

    expect(fake.calls.share ?? []).toHaveLength(1);
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('zmp: request link shares a card', async () => {
    const fake = fakePlatform();

    mockApi({
      'GET /api/me': {
        user: { id: 'u-minh', email: 'minh@example.com', name: 'Minh', consentAt: '2026-10-12T00:00:00.000Z' },
      },
      'GET /api/me/people/summary': {
        incomplete: false,
        people: [
          {
            key: 'u:u-minh',
            name: 'Minh',
            nickname: null,
            userId: 'u-minh',
            groupLabel: null,
            total: 270000,
            items: [],
            waiting: [],
            linked: [],
          },
        ],
      },
      'POST /api/me/people/u%3Au-minh/request-link': { url: 'https://api.test/r/abc' },
    });

    renderAt(<PersonScreen />, {
      route: '/people/u%3Au-minh',
      path: '/people/:key',
      platform: fake,
    });

    const requestBtn = await screen.findByTestId('person-request');
    await userEvent.click(requestBtn);

    await waitFor(() => {
      expect(fake.calls.share ?? []).toHaveLength(1);
    });

    const card = fake.calls.share![0]![0] as ShareCard;
    expect(card.path.startsWith('r/')).toBe(true);
    expect(card.path).toBe('r/abc');
  });

  it('web: invite still uses navigator.share', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: shareFn });

    const view = tripView();
    renderAt(<InviteSheet view={view} open onClose={() => {}} />);

    const sheet = await screen.findByRole('dialog', { name: 'Invite' });
    const groupFieldset = within(sheet).getByRole('group', { name: 'Group link' });
    await userEvent.click(within(groupFieldset).getByRole('button', { name: 'Share' }));

    expect(shareFn).toHaveBeenCalledTimes(1);
    expect(shareFn).toHaveBeenCalledWith(
      expect.objectContaining({
        title: view.trip.name,
        text: `Join "${view.trip.name}" to split costs:`,
        url: `${location.origin}/j/${view.links!.group}?lang=en`,
      }),
    );
  });
});
