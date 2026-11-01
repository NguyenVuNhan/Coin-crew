import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { MeResponse } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { SignInButtons } from '../SignInButtons';

const ZALO_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Zalo/12.0';

let uaSpy: MockInstance | undefined;

afterEach(() => {
  uaSpy?.mockRestore();
  uaSpy = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function signedOutMe(): MeResponse {
  return {
    user: null,
    signIn: { zalo: true },
    mergeRequests: {
      incoming: [],
      outgoing: [],
    },
  };
}

describe('SignInButtons provider logos', () => {
  it('in stack layout, Google and Zalo links contain their provider logos', async () => {
    mockApi({ 'GET /api/me': signedOutMe() });
    renderAt(<SignInButtons returnTo="/trips" layout="stack" />);

    const googleLink = document.querySelector<HTMLAnchorElement>('a[href^="/api/auth/google/start"]');
    expect(googleLink).not.toBeNull();
    const googleImg = googleLink?.querySelector('img[data-provider="google"]');
    expect(googleImg).toBeInTheDocument();

    const zaloLink = await waitFor(() => {
      const link = document.querySelector<HTMLAnchorElement>('a[href^="/api/auth/zalo/start"]');
      expect(link).not.toBeNull();
      return link!;
    });
    const zaloImg = zaloLink.querySelector('img[data-provider="zalo"]');
    expect(zaloImg).toBeInTheDocument();
  });

  it('in inline layout, Google and Zalo links still contain their provider logos', async () => {
    mockApi({ 'GET /api/me': signedOutMe() });
    renderAt(<SignInButtons returnTo="/trips" layout="inline" />);

    const googleLink = document.querySelector<HTMLAnchorElement>('a[href^="/api/auth/google/start"]');
    expect(googleLink).not.toBeNull();
    const googleImg = googleLink?.querySelector('img[data-provider="google"]');
    expect(googleImg).toBeInTheDocument();

    const zaloLink = await waitFor(() => {
      const link = document.querySelector<HTMLAnchorElement>('a[href^="/api/auth/zalo/start"]');
      expect(link).not.toBeNull();
      return link!;
    });
    const zaloImg = zaloLink.querySelector('img[data-provider="zalo"]');
    expect(zaloImg).toBeInTheDocument();
  });

  it('inside Zalo, only the Zalo link exists and contains the Zalo logo', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    mockApi({ 'GET /api/me': signedOutMe() });
    renderAt(<SignInButtons returnTo="/trips" layout="stack" />);

    const zaloLink = await waitFor(() => {
      const link = document.querySelector<HTMLAnchorElement>('a[href^="/api/auth/zalo/start"]');
      expect(link).not.toBeNull();
      return link!;
    });
    const zaloImg = zaloLink.querySelector('img[data-provider="zalo"]');
    expect(zaloImg).toBeInTheDocument();

    expect(document.querySelector('a[href^="/api/auth/google/start"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /google/i })).toBeNull();
  });
});
