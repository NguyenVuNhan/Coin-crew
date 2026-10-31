import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { setLang } from '../../i18n';
import { AccountMenu } from '../../components/AccountMenu';

const user = { name: 'Minh', email: 'minh@example.com' };
const atRoot = /^\/$/;

afterEach(() => {
  vi.unstubAllGlobals();
  setLang('en');
});

describe('AccountMenu', () => {
  it('account menu shows who is signed in and signs out', async () => {
    const { calls } = mockApi({ 'POST /api/auth/logout': null });
    renderAt(<AccountMenu user={user} />, { route: '/trips', path: '/trips' });

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    const menu = screen.getByRole('dialog', { name: 'Account' });
    expect(within(menu).getByText('Minh')).toBeInTheDocument();
    expect(within(menu).getByText('minh@example.com')).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Your bank details' })).toHaveAttribute('href', '/me/bank');
    expect(within(menu).getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/privacy');
    expect(within(menu).getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(atRoot));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/auth/logout')).toBe(true);
  });

  it('the language row switches the language without closing the menu', async () => {
    mockApi({});
    renderAt(<AccountMenu user={user} />);
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Tiếng Việt' }));
    expect(await screen.findByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('signing out clears everything cached for this person', async () => {
    mockApi({ 'POST /api/auth/logout': null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['trips'], [{ id: 't-1' }]);
    function Probe() {
      return <div data-testid="location">{useLocation().pathname}</div>;
    }
    setLang('en');
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/trips']}>
          <Routes>
            <Route path="/trips" element={<AccountMenu user={user} />} />
            <Route path="*" element={null} />
          </Routes>
          <Probe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(atRoot));
    expect(client.getQueryData(['trips'])).toBeUndefined();
  });

  it('a failed sign-out says so, stays on the page and can be tried again', async () => {
    mockApi({
      'POST /api/auth/logout': () => Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
    });
    renderAt(<AccountMenu user={user} />, { route: '/trips', path: '/trips' });

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(screen.getByTestId('location')).toHaveTextContent('/trips');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  it('on a wide screen the menu hangs under the button and closes on Escape or an outside click', async () => {
    mockMedia({ wide: true });
    mockApi({});
    renderAt(<AccountMenu user={user} />);
    const button = screen.getByRole('button', { name: 'Account' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    const menu = screen.getByRole('dialog', { name: 'Account' });
    expect(menu).not.toHaveAttribute('aria-modal');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByText('minh@example.com')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    await userEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('on a phone the menu is a sheet over the page', async () => {
    mockMedia({ wide: false });
    mockApi({});
    renderAt(<AccountMenu user={user} />);
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    // A bottom drawer (vaul) over the page: modal, the page behind is hidden from assistive tech.
    expect(screen.getByRole('dialog', { name: 'Account' })).toHaveAttribute('data-slot', 'drawer-content');
  });
  it('the side-panel menu opens as a sheet even on a wide screen', async () => {
    mockMedia({ wide: true });
    mockApi({});
    renderAt(<AccountMenu user={user} variant="sheet" />);
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    const menu = screen.getByRole('dialog', { name: 'Account' });
    expect(menu).not.toHaveClass('fsl-account-menu__popover');
    expect(menu).toHaveAttribute('data-slot');
  });
});
