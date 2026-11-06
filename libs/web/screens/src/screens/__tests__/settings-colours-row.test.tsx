import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Settings } from '../Settings';
import { mockApi, renderAt } from '../../test/render';
import { tripView } from '../../test/fixtures';

describe('Settings Group colours row', () => {
  it("shows Each person's own when no colour is set and keeps shrink-0 on the label", async () => {
    const base = tripView();
    mockApi({
      'GET /api/trips/t-1': {
        ...base,
        trip: { ...base.trip, theme: null },
      },
    });

    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    const row = await screen.findByRole('button', { name: /Group colours/i });
    expect(row).toHaveClass('fsl-settings__colours', 'text-left');
    expect(row).toHaveTextContent("Each person's own");
    expect(row).not.toHaveTextContent("Each person's own theme");

    const label = row.querySelector('.fsl-settings__label');
    expect(label).not.toBeNull();
    expect(label).toHaveClass('shrink-0');
  });

  it('shows Sky when sky is set', async () => {
    const base = tripView();
    mockApi({
      'GET /api/trips/t-1': {
        ...base,
        trip: { ...base.trip, theme: 'sky' },
      },
    });

    renderAt(<Settings />, { route: '/t/t-1/settings', path: '/t/:tripId/settings' });

    const row = await screen.findByRole('button', { name: /Group colours/i });
    expect(row).toHaveTextContent('Sky');
  });
});
