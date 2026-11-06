import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { BalanceCard } from '../BalanceCard';

// Owner, 2026-11-06: a real Pink theme sits near Lychee's hue, so no theme accent may colour money. The owed-to-you
// balance is money in: Leaf in every theme (Jade looks the same, as Leaf and Jade are near twins).
describe('the balance is a money colour, never the theme accent', () => {
  it('the owed-to-you amount is Leaf, not the accent', async () => {
    renderAt(<BalanceCard view={tripView()} />, { route: '/t/t-1', path: '/t/:tripId' });
    await screen.findByText("You're owed");
    const amount = document.querySelector('.fsl-balance .fsl-amount') ?? screen.getAllByText(/₫/)[0]!;
    expect(amount.className).toContain('text-success');
    expect(amount.className).not.toContain('text-primary');
  });
});
