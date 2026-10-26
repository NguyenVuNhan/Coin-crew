import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActivityItem, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView, PIDS } from '../../test/fixtures';
import { Settings } from '../Settings';
import { People } from '../People';
import { Activity } from '../Activity';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = (screenName: string) => ({ route: `/t/t-1/${screenName}`, path: `/t/:tripId/${screenName}` });

/** A member who is a Group Admin but not the organiser: An, signed in. Minh created the trip. */
function anView(): TripView {
  const base = tripView();
  return {
    ...base,
    me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: true },
    people: base.people.map((p) => {
      if (p.id === PIDS.M) return { ...p, isOrganiser: true, isAdmin: true };
      if (p.id === PIDS.A) return { ...p, isMember: true, isAdmin: true };
      return p;
    }),
  };
}

describe('Settings', () => {
  it('Fewest transfers lives in settings and switches', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': tripView(), 'PATCH /api/trips/t-1': null });
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByText("We combine everyone's debts so people make as few bank transfers as possible. What each person owes in total stays the same.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Fewest transfers' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ fewestTransfers: false }));
  });

  it('links to people and activity', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByRole('link', { name: 'People' })).toHaveAttribute('href', '/t/t-1/people');
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/t/t-1/activity');
    expect(screen.queryByRole('link', { name: 'Your bank details' })).toBeNull();
    expect(screen.queryByText('Language')).toBeNull();
  });

  it('only the organiser can archive; other members can leave', async () => {
    mockApi({ 'GET /api/trips/t-1': anView() });
    const { unmount } = renderAt(<Settings />, at('settings'));
    await screen.findByRole('switch', { name: 'Fewest transfers' });
    expect(screen.getByText('Danger zone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive group' })).toBeNull();
    expect(screen.queryByText('Nobody can change an archived trip until the organiser unarchives it.')).toBeNull();
    unmount();

    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByText('Danger zone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive group' })).toBeInTheDocument();
    expect(screen.getByText('Nobody can change an archived trip until the organiser unarchives it.')).toBeInTheDocument();
  });

  it('asks before archiving', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': tripView(), 'POST /api/trips/t-1/archive': null });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt(<Settings />, at('settings'));
    await userEvent.click(await screen.findByRole('button', { name: 'Archive group' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Archive group' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/archive')).toBe(true));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('says so when the trip is archived and offers nothing to change', async () => {
    const view = tripView();
    mockApi({ 'GET /api/trips/t-1': { ...view, trip: { ...view.trip, archived: true } } });
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByText('This trip is archived. You can still look at it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive group' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Fewest transfers' })).toBeNull();
  });

  it('the organiser unarchives without being asked twice', async () => {
    const view = tripView();
    const { calls } = mockApi({ 'GET /api/trips/t-1': { ...view, trip: { ...view.trip, archived: true } }, 'POST /api/trips/t-1/unarchive': null });
    const confirm = vi.spyOn(window, 'confirm');
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByText('Everyone can make changes again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive group' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/unarchive')).toBe(true));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('only the organiser sees Unarchive', async () => {
    const view = anView();
    mockApi({ 'GET /api/trips/t-1': { ...view, trip: { ...view.trip, archived: true } } });
    renderAt(<Settings />, at('settings'));
    await screen.findByText('This trip is archived. You can still look at it.');
    expect(screen.queryByRole('button', { name: 'Unarchive group' })).toBeNull();
  });
});

describe('People', () => {
  const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) }).closest('li')!;

  it('shows each person with a role', async () => {
    mockApi({ 'GET /api/trips/t-1': anView() });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Minh,/ });
    expect(within(rowOf('Minh')).getByText('Organiser')).toBeInTheDocument();
    expect(within(rowOf('An')).getByText('Admin')).toBeInTheDocument();
    expect(within(rowOf('Chi')).getByText('Guest')).toBeInTheDocument();
  });

  it('no Remove for the organiser or for me', async () => {
    mockApi({ 'GET /api/trips/t-1': anView() });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Minh,/ });
    // Minh created the trip, An is me: both can be merged, neither can be removed.
    expect(within(rowOf('Minh')).getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    expect(within(rowOf('Minh')).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(rowOf('An')).getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    expect(within(rowOf('An')).queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(within(rowOf('Bình')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(within(rowOf('Chi')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('Remove is offered on a signed-in member who is not an admin', async () => {
    // Bình has an account too: not the organiser, not me, not an admin, so an admin can remove them.
    const view = anView();
    mockApi({ 'GET /api/trips/t-1': { ...view, people: view.people.map((p) => (p.id === PIDS.B ? { ...p, isMember: true } : p)) } });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Bình,/ });
    expect(within(rowOf('Bình')).getByText('Member')).toBeInTheDocument();
    expect(within(rowOf('Bình')).getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    expect(within(rowOf('Bình')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(within(rowOf('Chi')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Bình,/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('guests show their bank details, and members manage them from the row', async () => {
    const view = anView();
    const account = { bankName: 'VPBank', accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' };
    mockApi({
      'GET /api/trips/t-1': {
        ...view,
        people: view.people.map((p) =>
          p.id === PIDS.C ? { ...p, bank: 'approved' as const, bankAccount: account } : p.id === PIDS.B ? { ...p, bank: 'pending' as const } : p,
        ),
      },
    });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Chi,/ });
    expect(within(rowOf('Chi')).getByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
    expect(within(rowOf('Bình')).getByText('Bank details waiting')).toBeInTheDocument();
    // Members manage their own details: no bank line and no action on their rows.
    expect(within(rowOf('Minh')).queryByText(/bank details/i)).toBeNull();
    expect(within(rowOf('Minh')).queryByRole('button', { name: 'Bank details' })).toBeNull();
    await userEvent.click(within(rowOf('Chi')).getByRole('button', { name: 'Bank details' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/people/p-chi/bank'));
  });

  it("a guest's waiting account says it waits", async () => {
    const view = anView();
    const account = { bankName: 'VPBank', accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' };
    mockApi({ 'GET /api/trips/t-1': { ...view, people: view.people.map((p) => (p.id === PIDS.C ? { ...p, bank: 'pending' as const, bankAccount: account } : p)) } });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Chi,/ });
    expect(within(rowOf('Chi')).getByText('VPBank · 0123 •••• 6789 · waiting for approval')).toBeInTheDocument();
  });

  it('a guest with no bank details says so', async () => {
    mockApi({ 'GET /api/trips/t-1': anView() });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Chi,/ });
    expect(within(rowOf('Chi')).getByText('No bank details')).toBeInTheDocument();
  });

  it('offers nothing to change in an archived trip', async () => {
    const view = anView();
    mockApi({ 'GET /api/trips/t-1': { ...view, trip: { ...view.trip, archived: true } } });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Chi,/ });
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bank details' })).toBeNull();
  });

  it('a tap on a person opens the same two actions in a sheet', async () => {
    mockApi({ 'GET /api/trips/t-1': anView() });
    renderAt(<People />, at('people'));
    await userEvent.click(await screen.findByRole('button', { name: /^Bình,/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Merge' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('on a phone the actions sit behind a swipe, and the sheet is the way to them', async () => {
    mockMedia({ coarse: true });
    mockApi({ 'GET /api/trips/t-1': anView() });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Bình,/ });
    expect(within(rowOf('Bình')).getByRole('button', { name: 'Remove' })).toBeInTheDocument(); // in the swipe tray
    expect(within(rowOf('An')).queryByRole('button', { name: 'Remove' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Chi,/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('merges one name into another, explaining it first', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': anView(), 'POST /api/trips/t-1/people/merge': null });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Bình,/ });
    expect(screen.queryByText(/Merge moves every expense and payment/)).toBeNull();
    await userEvent.click(within(rowOf('Bình')).getByRole('button', { name: 'Merge' }));
    const dialog = await screen.findByRole('dialog', { name: 'Merge Bình into…' });
    expect(within(dialog).getByText('Merge moves every expense and payment from one name to another, for duplicates that slipped through.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Bình' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chi' }));
    expect(confirm).toHaveBeenCalledWith('Move every expense and payment from Bình to Chi?');
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ fromId: PIDS.B, intoId: PIDS.C }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a refused removal explains itself and the next try clears it', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': anView(),
      // Whatever the 403 says, the screen explains it in its own words (and language).
      'DELETE /api/trips/t-1/people/p-chi': () => Response.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 }),
      'DELETE /api/trips/t-1/people/p-binh': null,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Chi,/ });
    await userEvent.click(within(rowOf('Chi')).getByRole('button', { name: 'Remove' }));
    expect(await within(rowOf('Chi')).findByText("You can't remove this person.")).toBeInTheDocument();
    expect(screen.queryByText('Forbidden')).toBeNull();
    await userEvent.click(within(rowOf('Bình')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/trips/t-1/people/p-binh')).toBe(true));
    // The next try clears the old message; only the row that was just acted on can show one.
    await waitFor(() => expect(screen.queryByText("You can't remove this person.")).toBeNull());
  });

  it('promotes an active member to admin', async () => {
    const view = anView();
    const { calls } = mockApi({
      'GET /api/trips/t-1': {
        ...view,
        people: view.people.map((p) => (p.id === PIDS.B ? { ...p, isMember: true, isAdmin: false } : p)),
      },
      'POST /api/trips/t-1/people/p-binh/admin': null,
    });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Bình,/ });
    expect(within(rowOf('Bình')).getByText('Member')).toBeInTheDocument();
    await userEvent.click(within(rowOf('Bình')).getByRole('button', { name: 'Make admin' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/people/p-binh/admin')).toBe(true),
    );
  });

  it('non-admin members do not see add-person form, merge, or remove', async () => {
    const base = tripView();
    const nonAdminView: TripView = {
      ...base,
      me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: false },
      people: base.people.map((p) => {
        if (p.id === PIDS.M) return { ...p, isOrganiser: true, isAdmin: true };
        if (p.id === PIDS.A) return { ...p, isMember: true, isAdmin: false };
        return p;
      }),
    };
    mockApi({ 'GET /api/trips/t-1': nonAdminView });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^An,/ });
    expect(within(rowOf('An')).getByText('Member')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add someone else')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('Activity', () => {
  const item = (id: string, action: ActivityItem['action'], actorName: string | null, details: ActivityItem['details'], createdAt: Date, deviceShort: string | null = null): ActivityItem => ({
    id, action, actorName, details, deviceShort, createdAt: createdAt.toISOString(),
  });
  const today = (hours: number, minutes: number) => {
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  };
  const yesterday = (hours: number, minutes: number) => {
    const d = today(hours, minutes);
    d.setDate(d.getDate() - 1);
    return d;
  };
  const render = (items: ActivityItem[]) => {
    mockApi({ 'GET /api/trips/t-1': tripView(), 'GET /api/trips/t-1/activity': items });
    return renderAt(<Activity />, at('activity'));
  };

  it('activity says what changed', async () => {
    render([
      item('a-4', 'payment_recorded', 'Chi', { fromId: PIDS.C, toId: PIDS.M, amount: 177500, status: 'says_paid' }, today(21, 40)),
      item('a-3', 'expense_approved', 'Minh', { description: 'Bánh tráng nướng' }, today(21, 12)),
      item('a-2', 'expense_added', 'Chi', { description: 'Bánh tráng nướng', amount: 180000 }, today(20, 58)),
      item('a-1', 'expense_disabled', 'Minh', {}, today(20, 30)),
    ]);
    expect(await screen.findByText('Chi added Bánh tráng nướng · 180.000₫')).toBeInTheDocument();
    expect(screen.getByText('Chi paid Minh 177.500₫')).toBeInTheDocument();
    expect(screen.getByText('Minh approved Bánh tráng nướng')).toBeInTheDocument();
    // Nothing more to say: the generic wording stays.
    expect(screen.getByText('Minh disabled an expense')).toBeInTheDocument();
  });

  it('keeps the generic line when it cannot name who paid whom', async () => {
    render([item('a-1', 'payment_recorded', 'Chi', { fromId: 'p-gone', toId: PIDS.M, amount: 100000 }, today(10, 0))]);
    expect(await screen.findByText('Chi recorded a payment')).toBeInTheDocument();
  });

  it('activity is grouped by day', async () => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    render([
      item('a-3', 'expense_approved', 'Minh', { description: 'Lẩu' }, today(9, 0)),
      item('a-2', 'trip_created', 'Minh', {}, yesterday(18, 5)),
      item('a-1', 'name_added', 'Minh', { name: 'Chi' }, lastWeek),
    ]);
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Today', 'Yesterday', expect.stringMatching(/\d{4}$/)]);
    const yesterdayGroup = screen.getByRole('heading', { name: 'Yesterday' }).closest('section')!;
    expect(within(yesterdayGroup).getByText('Minh created the trip')).toBeInTheDocument();
    expect(within(yesterdayGroup).queryByText('Minh approved Lẩu')).toBeNull();
  });

  it('shows the time and the device in small monospace', async () => {
    render([item('a-1', 'trip_created', 'Minh', {}, today(21, 40), 'f38b7e')]);
    expect(await screen.findByText(/^21:40 · device/)).toBeInTheDocument();
    const device = screen.getByText('f38b7e');
    expect(device.tagName).toBe('CODE');
  });

  it('shows no device when the item has none', async () => {
    render([item('a-1', 'trip_created', 'Minh', {}, today(8, 5))]);
    expect(await screen.findByText('08:05')).toBeInTheDocument();
    expect(screen.queryByText(/device/)).toBeNull();
  });

  it('invites nothing when nothing has happened', async () => {
    render([]);
    expect(await screen.findByText('Nothing has happened yet.')).toBeInTheDocument();
  });

  it('still lists the activity when the trip cannot be read', async () => {
    mockApi({ 'GET /api/trips/t-1/activity': [item('a-1', 'trip_created', 'Minh', {}, today(8, 5))] });
    renderAt(<Activity />, at('activity'));
    expect(await screen.findByText('Minh created the trip')).toBeInTheDocument();
  });
});
