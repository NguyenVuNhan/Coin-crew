import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthProvider, MeResponse, OutgoingMergeRequest } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { useMe } from '../../api/hooks';
import { LinkedAccounts } from '../LinkedAccounts';

const ZALO_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Zalo/12.0';

let uaSpy: MockInstance | undefined;

afterEach(() => {
  uaSpy?.mockRestore();
  uaSpy = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function me(
  providers: AuthProvider[],
  outgoing: OutgoingMergeRequest[] = [],
  zaloName?: string | null,
  email = 'minh@example.com',
  signInZalo = true,
): MeResponse {
  return {
    user: {
      id: 'u1',
      email: providers.includes('google') ? email : null,
      name: 'Minh',
      consentAt: null,
      providers,
      zaloName: zaloName ?? null,
    },
    signIn: { zalo: signInZalo },
    mergeRequests: {
      incoming: [],
      outgoing,
    },
  };
}

function Harness() {
  const q = useMe();
  return q.data ? <LinkedAccounts me={q.data} /> : null;
}

describe('LinkedAccounts cards', () => {
  it('Google-only shows section subtitle, both cards with appropriate logo mute and status, and why-link disclosure', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/me': me(['google']) });
    renderAt(<Harness />, { route: '/trips' });

    expect(
      await screen.findByText('Manage the accounts you sign in with'),
    ).toBeInTheDocument();

    const googleCard = screen.getByTestId('method-google');
    const zaloCard = screen.getByTestId('method-zalo');

    expect(googleCard).toBeInTheDocument();
    expect(zaloCard).toBeInTheDocument();

    const googleLogo = googleCard.querySelector('img[data-provider="google"]');
    expect(googleLogo).toBeInTheDocument();
    expect(googleLogo).not.toHaveClass('fsl-provider-logo--muted');
    expect(googleCard).toHaveTextContent('minh@example.com');

    const zaloLogo = zaloCard.querySelector('img[data-provider="zalo"]');
    expect(zaloLogo).toBeInTheDocument();
    expect(zaloLogo).toHaveClass('fsl-provider-logo--muted');
    expect(zaloCard).toHaveTextContent('Not linked');
    expect(within(zaloCard).getByRole('link', { name: 'Link' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Unlink' })).toBeNull();
    expect(screen.queryByText(/Link another way/i)).toBeNull();

    const whyBtn = within(zaloCard).getByRole('button', { name: 'Why link it?' });
    expect(whyBtn).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('Link Zalo too so you can sign in from the Zalo app'),
    ).toBeNull();

    await user.click(whyBtn);
    expect(whyBtn).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('Link Zalo too so you can sign in from the Zalo app'),
    ).toBeInTheDocument();
  });

  it('both linked with user.zaloName shows Linked, zaloName, Change links, enabled Unlink buttons, and no why-link button', async () => {
    mockApi({ 'GET /api/me': me(['google', 'zalo'], [], 'Noah Zalo') });
    renderAt(<Harness />, { route: '/trips' });

    const googleCard = await screen.findByTestId('method-google');
    const zaloCard = screen.getByTestId('method-zalo');

    expect(zaloCard).toHaveTextContent('Linked');
    expect(zaloCard).toHaveTextContent('Noah Zalo');

    const googleChange = within(googleCard).getByRole('link', { name: 'Change' });
    const googleUnlink = within(googleCard).getByRole('button', { name: 'Unlink' });
    expect(googleChange).toBeInTheDocument();
    expect(googleUnlink).toBeEnabled();

    const zaloChange = within(zaloCard).getByRole('link', { name: 'Change' });
    const zaloUnlink = within(zaloCard).getByRole('button', { name: 'Unlink' });
    expect(zaloChange).toBeInTheDocument();
    expect(zaloUnlink).toBeEnabled();

    expect(screen.queryByRole('button', { name: 'Why link it?' })).toBeNull();
  });

  it('Zalo linked with zaloName null omits identity element and displays Linked', async () => {
    mockApi({ 'GET /api/me': me(['zalo'], [], null) });
    renderAt(<Harness />, { route: '/trips' });

    const zaloCard = await screen.findByTestId('method-zalo');
    expect(zaloCard.querySelector('.fsl-linked__identity')).toBeNull();
    expect(zaloCard).toHaveTextContent('Linked');
  });

  it('chips: pending request opens merge dialog, declined shows Declined, accepted shows Merged', async () => {
    const user = userEvent.setup();
    const pendingReq: OutgoingMergeRequest = {
      id: 'm-1',
      provider: 'zalo',
      status: 'pending',
      expiresAt: '2026-11-02T18:00:00.000Z',
      otherName: 'Noah Nguyen',
      identityLabel: 'Noah Zalo',
    };
    mockApi({ 'GET /api/me': me(['google'], [pendingReq]) });
    const { unmount } = renderAt(<Harness />, { route: '/trips' });

    const zaloCard = await screen.findByTestId('method-zalo');
    const buttons = within(zaloCard).getAllByRole('button');
    expect(buttons).toHaveLength(1);

    const chipBtn = within(zaloCard).getByRole('button', {
      name: 'Zalo: Waiting to confirm, Noah Nguyen. See details',
    });
    expect(chipBtn).toBe(buttons[0]);
    expect(chipBtn).toHaveTextContent('Waiting to confirm');
    expect(chipBtn).toHaveTextContent('Noah Nguyen');

    await user.click(chipBtn);
    const dialog = await screen.findByRole('dialog', {
      name: "Merge with Noah Nguyen's account",
    });
    expect(dialog).toBeInTheDocument();
    unmount();

    const declinedReq: OutgoingMergeRequest = {
      id: 'm-2',
      provider: 'zalo',
      status: 'declined',
      expiresAt: '2026-11-02T18:00:00.000Z',
      otherName: 'Noah Nguyen',
      identityLabel: 'Noah Zalo',
    };
    mockApi({ 'GET /api/me': me(['google'], [declinedReq]) });
    const { unmount: unmountDeclined } = renderAt(<Harness />, { route: '/trips' });

    const zaloCardDeclined = await screen.findByTestId('method-zalo');
    const declinedButtons = within(zaloCardDeclined).getAllByRole('button');
    expect(declinedButtons).toHaveLength(1);
    const declinedBtn = within(zaloCardDeclined).getByRole('button', {
      name: 'Zalo: Declined, Noah Nguyen. See details',
    });
    expect(declinedBtn).toHaveTextContent('Declined');
    expect(declinedBtn).toHaveTextContent('Noah Nguyen');
    unmountDeclined();

    const acceptedReq: OutgoingMergeRequest = {
      id: 'm-3',
      provider: 'zalo',
      status: 'accepted',
      expiresAt: '2026-11-02T18:00:00.000Z',
      otherName: 'Noah Nguyen',
      identityLabel: 'Noah Zalo',
    };
    mockApi({ 'GET /api/me': me(['google'], [acceptedReq]) });
    renderAt(<Harness />, { route: '/trips' });

    const zaloCardAccepted = await screen.findByTestId('method-zalo');
    const acceptedButtons = within(zaloCardAccepted).getAllByRole('button');
    expect(acceptedButtons).toHaveLength(1);
    const acceptedBtn = within(zaloCardAccepted).getByRole('button', {
      name: 'Zalo: Merged, Noah Nguyen. See details',
    });
    expect(acceptedBtn).toHaveTextContent('Merged');
    expect(acceptedBtn).toHaveTextContent('Noah Nguyen');
  });

  it('Google pending and Zalo declined at once shows both chips and clicking Google chip opens merge dialog', async () => {
    const user = userEvent.setup();
    const googleReq: OutgoingMergeRequest = {
      id: 'm-g1',
      provider: 'google',
      status: 'pending',
      expiresAt: '2026-11-02T18:00:00.000Z',
      otherName: 'B1',
      identityLabel: 'b1@example.com',
    };
    const zaloReq: OutgoingMergeRequest = {
      id: 'm-z2',
      provider: 'zalo',
      status: 'declined',
      expiresAt: '2026-11-02T18:00:00.000Z',
      otherName: 'B2',
      identityLabel: 'Noah Zalo',
    };
    mockApi({ 'GET /api/me': me(['google'], [googleReq, zaloReq]) });
    renderAt(<Harness />, { route: '/trips' });

    const googleCard = await screen.findByTestId('method-google');
    const zaloCard = screen.getByTestId('method-zalo');

    const googleChip = within(googleCard).getByRole('button', {
      name: 'Google: Waiting to confirm, B1. See details',
    });
    expect(googleChip).toHaveTextContent('Waiting to confirm');
    expect(googleChip).toHaveTextContent('B1');

    const zaloChip = within(zaloCard).getByRole('button', {
      name: 'Zalo: Declined, B2. See details',
    });
    expect(zaloChip).toHaveTextContent('Declined');
    expect(zaloChip).toHaveTextContent('B2');

    await user.click(googleChip);
    const dialog = await screen.findByRole('dialog', {
      name: "Merge with B1's account",
    });
    expect(dialog).toBeInTheDocument();
  });

  it('truncates long zaloName with title equal to full name', async () => {
    const longName = 'N'.repeat(120);
    mockApi({ 'GET /api/me': me(['google', 'zalo'], [], longName) });
    renderAt(<Harness />, { route: '/trips' });

    const zaloCard = await screen.findByTestId('method-zalo');
    const identity = zaloCard.querySelector('.fsl-linked__identity');
    expect(identity).toBeInTheDocument();
    expect(identity).toHaveAttribute('title', longName);
  });

  it('omits method-zalo card when signIn.zalo is false and only google is linked', async () => {
    mockApi({ 'GET /api/me': me(['google'], [], null, 'minh@example.com', false) });
    renderAt(<Harness />, { route: '/trips' });

    await screen.findByTestId('method-google');
    expect(screen.queryByTestId('method-zalo')).toBeNull();
  });

  it('inside Zalo, Google card shows signIn.googleInZalo text and no Link or Change links', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    mockApi({ 'GET /api/me': me(['zalo']) });
    const { unmount } = renderAt(<Harness />, { route: '/trips' });

    const googleCard = await screen.findByTestId('method-google');
    expect(
      within(googleCard).getByText(
        'Used Google before? Tap ⋯ → Open in browser to sign in with Google, then link Zalo in the account menu.',
      ),
    ).toBeInTheDocument();
    expect(within(googleCard).queryByRole('link', { name: 'Link' })).toBeNull();
    expect(within(googleCard).queryByRole('link', { name: 'Change' })).toBeNull();
    unmount();

    mockApi({ 'GET /api/me': me(['google', 'zalo']) });
    renderAt(<Harness />, { route: '/trips' });

    const googleCardLinked = await screen.findByTestId('method-google');
    expect(
      within(googleCardLinked).getByText(
        'Used Google before? Tap ⋯ → Open in browser to sign in with Google, then link Zalo in the account menu.',
      ),
    ).toBeInTheDocument();
    expect(within(googleCardLinked).queryByRole('link', { name: 'Link' })).toBeNull();
    expect(within(googleCardLinked).queryByRole('link', { name: 'Change' })).toBeNull();
  });
});
