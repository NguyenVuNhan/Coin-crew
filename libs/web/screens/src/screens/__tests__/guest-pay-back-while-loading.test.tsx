import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, PIDS } from '../../test/fixtures';
import { App } from '../../App';

afterEach(() => {
  vi.unstubAllGlobals();
});

// A guest only reaches their pay pages (#110). While a pay page loads or fails, its back link must stay on those
// pages too, not point at the group under the link: CI caught this as a race in join.test.tsx.
const never = () => new Promise<Response>(() => {});

describe("a guest's pay pages keep their links under the link while loading", () => {
  const pickedView = () => ({ ...guestChiView(), links: null });

  it('"You owe" while the group is still loading', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'x', access: 'group' },
      'GET /api/trips/t-1': never,
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    await waitFor(() => expect(document.querySelector('.fsl-owe__loading')).not.toBeNull());
    const back = screen.getByRole('link', { name: 'Back' });
    expect(back.getAttribute('href')).toBe('/j/gtok-1/who');
  });

  it('"Pay" while the payment details are still loading', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'x', access: 'group' },
      'GET /api/trips/t-1': pickedView(),
      'GET /api/trips/t-1/version': { version: 3 },
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: never,
    });
    renderAt(<App />, { route: `/j/gtok-1/pay/${PIDS.M}` });

    await waitFor(() => expect(document.querySelector('.fsl-pay__loading')).not.toBeNull());
    for (const a of document.querySelectorAll('a[href^="/"]')) expect(a.getAttribute('href')).toMatch(/^\/(j\/gtok-1\/|privacy)/);
  });
});
