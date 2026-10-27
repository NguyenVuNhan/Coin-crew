import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthProvider, MeResponse } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { useMe } from '../../api/hooks';
import { LinkedAccounts } from '../LinkedAccounts';

afterEach(() => {
  vi.restoreAllMocks();
});

function me(
  providers: AuthProvider[],
  email = 'minh@example.com',
): MeResponse {
  return {
    user: {
      id: 'u1',
      email: providers.includes('google') ? email : null,
      name: 'Minh',
      consentAt: null,
      providers,
    },
    signIn: { zalo: false },
    mergeRequests: {
      incoming: [],
      outgoing: [],
    },
  };
}

function Harness() {
  const q = useMe();
  return q.data ? <LinkedAccounts me={q.data} /> : null;
}

describe('LinkedAccounts without Zalo sign-in', () => {
  it('hides the Zalo row and the one-method note for a Google-only account', async () => {
    mockApi({ 'GET /api/me': me(['google']) });
    renderAt(<Harness />, { route: '/trips' });

    const googleRow = await screen.findByTestId('method-google');
    expect(screen.queryByTestId('method-zalo')).toBeNull();
    expect(screen.queryByText('Link another way to sign in first')).toBeNull();
    expect(
      screen.queryByText('Link Zalo too so you can sign in from the Zalo app'),
    ).toBeNull();
    expect(within(googleRow).queryByRole('button', { name: 'Unlink' })).toBeNull();
    expect(within(googleRow).getByRole('link', { name: 'Change' })).toBeInTheDocument();
  });

  it('keeps a linked Zalo row and still offers linking Google', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/me': me(['zalo']) });
    renderAt(<Harness />, { route: '/trips' });

    const zaloRow = await screen.findByTestId('method-zalo');
    expect(zaloRow).toHaveTextContent('Linked');
    expect(within(zaloRow).queryByRole('button', { name: 'Unlink' })).toBeNull();
    expect(screen.queryByText('Link another way to sign in first')).toBeNull();
    const googleRow = screen.getByTestId('method-google');
    expect(within(googleRow).getByRole('link', { name: 'Link' })).toBeInTheDocument();
    await user.click(within(googleRow).getByRole('button', { name: 'Why link it?' }));
    expect(
      screen.getByText("Link Google too so you don't lose this account if your Zalo changes"),
    ).toBeInTheDocument();
  });

  it('lets either method be unlinked when both are linked', async () => {
    mockApi({ 'GET /api/me': me(['google', 'zalo']) });
    renderAt(<Harness />, { route: '/trips' });

    const googleRow = await screen.findByTestId('method-google');
    const zaloRow = screen.getByTestId('method-zalo');
    expect(googleRow).toBeInTheDocument();
    expect(zaloRow).toBeInTheDocument();
    expect(within(googleRow).getByRole('button', { name: 'Unlink' })).toBeEnabled();
    expect(within(zaloRow).getByRole('button', { name: 'Unlink' })).toBeEnabled();
    expect(screen.queryByText('Link another way to sign in first')).not.toBeInTheDocument();
  });
});
