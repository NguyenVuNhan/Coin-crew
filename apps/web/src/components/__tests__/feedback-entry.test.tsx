import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView } from '../../test/fixtures';
import { Groups } from '../../screens/Groups';
import { GuestTrip } from '../../screens/GuestTrip';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('feedback entry', () => {
  it('main tab header opens feedback, and the account menu no longer has it', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': {
        user: {
          id: 'u-b',
          email: 'b@x.com',
          name: 'Bee',
          consentAt: '2026-01-01T00:00:00Z',
          providers: ['google'],
        },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/trips': [],
    });

    renderAt(<Groups />, { route: '/groups' });

    const open = await screen.findByTestId('feedback-open');
    expect(open).toHaveAccessibleName('Send feedback');
    await user.click(open);
    expect(await screen.findByTestId('feedback-message')).toBeVisible();
    // Signed in: the contact comes from the account, so no free-text field.
    await user.click(screen.getByTestId('feedback-contact'));
    expect(screen.queryByTestId('feedback-contact-text')).toBeNull();
    expect(screen.queryByTestId('account-menu-feedback')).toBeNull();
  });

  it('guest trip header opens feedback', async () => {
    const user = userEvent.setup();
    renderAt(<GuestTrip view={guestChiView()} />);

    const feedbackButton = await screen.findByTestId('guest-feedback');
    await user.click(feedbackButton);

    expect(await screen.findByTestId('feedback-message')).toBeVisible();
    expect(screen.queryByTestId('feedback-contact-text')).toBeNull();
  });
});
