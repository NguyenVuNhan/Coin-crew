import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../AccountMenu';
import { mockApi, renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';

// Final review M3: on desktop the account menu is a popover that hides while the theme picker is open; closing the
// picker must put focus back on the Theme row, not drop it to <body>.

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('account menu theme picker focus', () => {
  it('closing the picker returns focus to the Theme row on desktop', async () => {
    mockMedia({ wide: true });
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': {
        user: { id: 'u-1', name: 'Minh', email: 'minh@example.com', consentAt: '2026-10-01T00:00:00Z', providers: ['google'], theme: null },
        signIn: { zalo: false },
        mergeRequests: { incoming: [], outgoing: [] },
      },
    });
    renderAt(<AccountMenu />);

    await user.click(await screen.findByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('button', { name: /^Theme/ }));
    await screen.findByRole('radiogroup', { name: 'Theme' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Theme' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Theme/ })));
  });
});
