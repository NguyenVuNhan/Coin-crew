import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../AccountMenu';
import { mockApi, renderAt } from '../../test/render';

const { resetTxCopyMock } = vi.hoisted(() => ({
  resetTxCopyMock: vi.fn(),
}));

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  resetTxCopy: () => resetTxCopyMock(),
}));

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
  resetTxCopyMock.mockReset();
  resetTxCopyMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AccountMenu - reload data', () => {
  it('the reload row shows only with Sổ chi tiêu on', async () => {
    mockApi({
      'GET /api/me': meFixture,
    });
    const { unmount } = renderAt(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await screen.findByTestId('account-book');
    expect(screen.queryByTestId('account-reload-data')).not.toBeInTheDocument();

    unmount();
    localStorage.clear();

    mockApi({
      'GET /api/me': { ...meFixture, personalArea: true },
    });
    renderAt(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    const reloadRow = await screen.findByTestId('account-reload-data');
    expect(reloadRow).toBeInTheDocument();
    expect(reloadRow).toHaveTextContent('Reload data');
    expect(reloadRow).toHaveTextContent("Download this device's saved transactions again");
  });

  it('tapping it resets the copy and shows the snackbar', async () => {
    mockApi({
      'GET /api/me': { ...meFixture, personalArea: true },
    });
    renderAt(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));

    await userEvent.click(await screen.findByTestId('account-reload-data'));

    expect(resetTxCopyMock).toHaveBeenCalledTimes(1);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Reloading data…');
  });
});
