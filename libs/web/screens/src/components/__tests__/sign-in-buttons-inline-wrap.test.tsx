import { describe, it, expect, afterEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { MeResponse } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { SignInButtons } from '../SignInButtons';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function signedOutMe(): MeResponse {
  return {
    user: null,
    signIn: { zalo: true },
    mergeRequests: { incoming: [], outgoing: [] },
  };
}

describe('SignInButtons inline layout wraps long labels', () => {
  it('lets inline links shrink, wrap and keep a 44px minimum height', async () => {
    mockApi({ 'GET /api/me': signedOutMe() });
    renderAt(<SignInButtons returnTo="/trips" layout="inline" />);

    const google = document.querySelector<HTMLAnchorElement>('a[href^="/api/auth/google/start"]');
    expect(google).not.toBeNull();
    const zalo = await waitFor(() => {
      const link = document.querySelector<HTMLAnchorElement>('a[href^="/api/auth/zalo/start"]');
      expect(link).not.toBeNull();
      return link!;
    });

    for (const link of [google!, zalo]) {
      expect(link).toHaveClass('min-w-0', 'max-w-full', 'whitespace-normal', 'h-auto', 'min-h-11');
      expect(link).not.toHaveClass('shrink-0');
      expect(link).not.toHaveClass('whitespace-nowrap');
    }
  });
});
