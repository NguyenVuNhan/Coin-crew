// @vitest-environment jsdom
import '../../test/setup';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { NotificationSettingsModal } from '../NotificationSettingsModal';
import { AccountMenu } from '../AccountMenu';

beforeEach(() => {
  vi.stubGlobal('__APP_VERSION__', 'test-1.0.0');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('NotificationSettingsModal', () => {
  it('renders title and 3 notification toggles when user has linked email', async () => {
    mockApi({
      'GET /api/me/notifications': {
        settings: {
          transactionCrud: true,
          loanReminders: false,
          monthlyNotice: true,
        },
      },
    });

    renderAt(
      <NotificationSettingsModal
        open={true}
        onClose={vi.fn()}
        user={{ name: 'Alice', email: 'alice@example.com' }}
      />,
    );

    expect(screen.getByRole('heading', { name: /Email notifications/i })).toBeInTheDocument();

    const txSwitch = await screen.findByRole('switch', { name: /Transaction activity/i });
    const loanSwitch = screen.getByRole('switch', { name: /Loan & balance reminders/i });
    const monthlySwitch = screen.getByRole('switch', { name: /Monthly group notice/i });

    expect(txSwitch).toBeEnabled();
    expect(loanSwitch).toBeEnabled();
    expect(monthlySwitch).toBeEnabled();

    await waitFor(() => {
      expect(loanSwitch).not.toBeChecked();
    });

    expect(txSwitch).toBeChecked();
    expect(monthlySwitch).toBeChecked();

    expect(screen.getByText(/Get notified when transactions are created, edited, or deleted/i)).toBeInTheDocument();
    expect(screen.getByText(/Periodic reminders for outstanding balances and debts/i)).toBeInTheDocument();
    expect(screen.getByText(/Summary of group expenses and balances at month end/i)).toBeInTheDocument();
  });

  it('toggling a switch fires the update callback / mutation', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/notifications': {
        settings: {
          transactionCrud: true,
          loanReminders: true,
          monthlyNotice: true,
        },
      },
      'PATCH /api/me/notifications': (init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return Response.json({
          settings: {
            transactionCrud: body.transactionCrud ?? true,
            loanReminders: body.loanReminders ?? true,
            monthlyNotice: body.monthlyNotice ?? true,
          },
        });
      },
    });

    renderAt(
      <NotificationSettingsModal
        open={true}
        onClose={vi.fn()}
        user={{ name: 'Alice', email: 'alice@example.com' }}
      />,
    );

    const txSwitch = await screen.findByRole('switch', { name: /Transaction activity/i });
    expect(txSwitch).toBeChecked();

    await user.click(txSwitch);

    await waitFor(() => {
      const patchCall = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/notifications',
      );
      expect(patchCall).toBeDefined();
      expect(patchCall?.body).toEqual({ transactionCrud: false });
    });
  });

  it('renders warning message when user has no linked email', async () => {
    renderAt(
      <NotificationSettingsModal
        open={true}
        onClose={vi.fn()}
        user={{ name: 'Zalo User', email: null }}
      />,
    );

    expect(
      screen.getByText(/No email linked\. Please link a Google account to receive email notifications\./i),
    ).toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(3);
    for (const sw of switches) {
      expect(sw).toBeDisabled();
    }

    const linkBtn = screen.getByRole('link', { name: /Link/i });
    expect(linkBtn).toHaveAttribute('href', expect.stringContaining('/api/auth/google/start'));
  });

  it('integrates into AccountMenu and opens modal on click', async () => {
    mockMedia({ wide: true });
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': {
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
      },
      'GET /api/me/notifications': {
        settings: {
          transactionCrud: true,
          loanReminders: true,
          monthlyNotice: true,
        },
      },
    });

    renderAt(<AccountMenu />);

    await user.click(await screen.findByRole('button', { name: 'Account' }));
    const notifBtn = await screen.findByRole('button', { name: /Email notifications/i });
    await user.click(notifBtn);

    expect(await screen.findByRole('heading', { name: /Email notifications/i })).toBeInTheDocument();
  });
});
