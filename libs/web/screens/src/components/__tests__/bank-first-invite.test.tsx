import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderAt } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { PIDS, tripView } from '../../test/fixtures';
import { InviteCard } from '../InviteSheet';
import { People } from '../../screens/People';

const peopleRoute = { route: '/t/t-1/people', path: '/t/:tripId/people' };

describe('bank-first invite suggestions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('the invite card on a new group suggests bank details first', () => {
    const noneView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
    });
    renderAt(<InviteCard view={noneView} />);

    expect(screen.getByText('Add your bank details first?')).toBeInTheDocument();
    const addLink = screen.getByRole('link', { name: 'Add bank details' });
    expect(addLink).toHaveAttribute('href', '/me/bank');

    const shareBtn = screen.getByRole('button', { name: 'Share' });
    expect(shareBtn).toHaveClass('fsl-button--secondary');
  });

  it('the invite card says nothing when bank details exist', () => {
    const approvedView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'approved' } : p)),
    });
    renderAt(<InviteCard view={approvedView} />);

    expect(screen.queryByText('Add your bank details first?')).not.toBeInTheDocument();
    const shareBtn = screen.getByRole('button', { name: 'Share' });
    expect(shareBtn).toHaveClass('fsl-button--primary');
  });

  it('the Mini App Zalo invite asks first, then shares anyway', async () => {
    const noneView = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
    });
    mockApi({ 'GET /api/trips/t-1': noneView });
    const platform = fakePlatform({ kind: 'zmp' });
    renderAt(<People />, { ...peopleRoute, platform });

    const button = await screen.findByRole('button', { name: 'Invite Zalo friends' });
    await userEvent.click(button);

    const dialog = await screen.findByRole('dialog', { name: 'Add your bank details first?' });
    expect(dialog).toBeInTheDocument();
    expect(platform.calls.share).toHaveLength(0);

    const anywayBtn = within(dialog).getByRole('button', { name: 'Share anyway' });
    await userEvent.click(anywayBtn);

    expect(platform.calls.share).toHaveLength(1);
  });
});
