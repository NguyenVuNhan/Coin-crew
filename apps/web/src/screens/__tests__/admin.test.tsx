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

/** A member who is not the organiser: An, signed in. Minh created the trip. */
function anView(): TripView {
  const base = tripView();
  return {
    ...base,
    me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false },
    people: base.people.map((p) => {
      if (p.id === PIDS.M) return { ...p, isOrganiser: true };
      if (p.id === PIDS.A) return { ...p, isMember: true };
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

  it('links to people, activity and my bank details, and switches language', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByRole('link', { name: 'People' })).toHaveAttribute('href', '/t/t-1/people');
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/t/t-1/activity');
    expect(screen.getByRole('link', { name: 'Your bank details' })).toHaveAttribute('href', '/t/t-1/bank');
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Tiếng Việt' })).toBeInTheDocument();
  });

  it('only the organiser can archive', async () => {
    mockApi({ 'GET /api/trips/t-1': anView() });
    const { unmount } = renderAt(<Settings />, at('settings'));
    await screen.findByRole('switch', { name: 'Fewest transfers' });
    expect(screen.queryByText('Danger zone')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive trip' })).toBeNull();
    expect(screen.queryByText('Nobody can change an archived trip.')).toBeNull();
    unmount();

    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByText('Danger zone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive trip' })).toBeInTheDocument();
    expect(screen.getByText('Nobody can change an archived trip.')).toBeInTheDocument();
  });

  it('asks before archiving', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': tripView(), 'POST /api/trips/t-1/archive': null });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt(<Settings />, at('settings'));
    await userEvent.click(await screen.findByRole('button', { name: 'Archive trip' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Archive trip' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/archive')).toBe(true));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('says so when the trip is archived and offers nothing to change', async () => {
    const view = tripView();
    mockApi({ 'GET /api/trips/t-1': { ...view, trip: { ...view.trip, archived: true } } });
    renderAt(<Settings />, at('settings'));
    expect(await screen.findByText('This trip is archived. You can still look at it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive trip' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Fewest transfers' })).toBeNull();
  });
});

describe('People', () => {
  const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) }).closest('li')!;

  it('shows each person with a role', async () => {
    mockApi({ 'GET /api/trips/t-1': anView() });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Minh,/ });
    expect(within(rowOf('Minh')).getByText('Organiser')).toBeInTheDocument();
    expect(within(rowOf('An')).getByText('Member')).toBeInTheDocument();
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

  it('offers nothing to change in an archived trip', async () => {
    const view = anView();
    mockApi({ 'GET /api/trips/t-1': { ...view, trip: { ...view.trip, archived: true } } });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Chi,/ });
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
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

  it('removes a person and says "Use merge instead" when they are in an expense', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': anView(),
      'DELETE /api/trips/t-1/people/p-chi': () => Response.json({ error: { code: 'VALIDATION', message: 'Use merge instead' } }, { status: 409 }),
      'DELETE /api/trips/t-1/people/p-binh': null,
    });
    renderAt(<People />, at('people'));
    await screen.findByRole('button', { name: /^Chi,/ });
    await userEvent.click(within(rowOf('Chi')).getByRole('button', { name: 'Remove' }));
    expect(await within(rowOf('Chi')).findByText('Use merge instead')).toBeInTheDocument();
    await userEvent.click(within(rowOf('Bình')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/trips/t-1/people/p-binh')).toBe(true));
    // The next try clears the old message; only the row that was just acted on can show one.
    await waitFor(() => expect(screen.queryByText('Use merge instead')).toBeNull());
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
