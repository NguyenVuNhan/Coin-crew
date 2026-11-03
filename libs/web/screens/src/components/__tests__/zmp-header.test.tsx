import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { tripView } from '../../test/fixtures';
import { MemberTrip } from '../../screens/MemberTrip';
import { Settings } from '../../screens/Settings';
import { en } from '@cc/web-i18n/en';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const user = { id: 'u-1', name: 'Minh', email: 'minh@example.com' };

describe('Zalo Mini App header and capsule spacing', () => {
  it('web: member header unchanged', async () => {
    mockApi({
      'GET /api/me': { user },
      'GET /api/trips/t-1': tripView(),
    });

    const { container } = renderAt(<MemberTrip view={tripView()} />, {
      route: '/t/t-1',
      path: '/t/:tripId',
    });

    const root = container.querySelector('.fsl-screen')!;
    expect(root).not.toHaveClass('fsl-screen--zmp');

    const inviteBtn = container.querySelector('.fsl-member__invite') as HTMLButtonElement;
    expect(inviteBtn).toBeInTheDocument();
    expect(inviteBtn).toHaveTextContent(en['invite.button']);
    expect(within(inviteBtn).getByText(en['invite.button'])).toBeVisible();

    const header = container.querySelector('.fsl-screen__header')!;
    expect(header).toBeInTheDocument();
    await waitFor(() => {
      expect(header.querySelector('.fsl-account-menu')).not.toBeNull();
    });
  });

  it('zmp: header leaves room for the capsule', async () => {
    mockApi({
      'GET /api/me': { user },
      'GET /api/trips/t-1': tripView(),
    });

    const { container } = renderAt(<MemberTrip view={tripView()} />, {
      route: '/t/t-1',
      path: '/t/:tripId',
      platform: fakePlatform(),
    });

    const root = container.querySelector('.fsl-screen')!;
    expect(root).toHaveClass('fsl-screen--zmp');

    const inviteBtn = container.querySelector('.fsl-member__invite') as HTMLButtonElement;
    expect(inviteBtn).toBeInTheDocument();
    expect(inviteBtn).toHaveAccessibleName(en['invite.button']);
    expect(inviteBtn.textContent?.trim()).toBe('');
    expect(within(inviteBtn).queryByText(en['invite.button'])).toBeNull();

    const settingsLink = container.querySelector('.fsl-member__settings');
    expect(settingsLink).toBeInTheDocument();

    const header = container.querySelector('.fsl-screen__header')!;
    expect(header.querySelector('.fsl-account-menu')).toBeNull();
  });

  // Linking a Zalo group chat moved to the next epic, so no hint points to it.
  it('zmp: Settings has no chat-link hint', async () => {
    mockApi({
      'GET /api/trips/t-1': tripView(),
    });

    const { container } = renderAt(<Settings />, {
      route: '/t/t-1/settings',
      path: '/t/:tripId/settings',
      platform: fakePlatform(),
    });

    await screen.findByText(en['settings.people']);
    expect(screen.queryByText(/group chat's menu/)).toBeNull();
    expect(container.querySelector('.fsl-settings__zalo-hint')).toBeNull();
  });
});
