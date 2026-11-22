import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@cc/core';
import { formatDeleteDate } from '@cc/web-util/time';
import { renderAt, mockApi } from '../../test/render';
import { tripView, paymentView, PIDS } from '../../test/fixtures';
import { Settings } from '../Settings';
import { DeletePendingBanner } from '../../components/DeletePendingBanner';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const at = { route: '/t/t-1/settings', path: '/t/:tripId/settings' };

function archivedOrganiserView(overrides: Partial<TripView> = {}, tripOverrides: Partial<TripView['trip']> = {}): TripView {
  const base = tripView(overrides);
  return {
    ...base,
    trip: {
      ...base.trip,
      archived: true,
      deleteAfter: null,
      ...tripOverrides,
    },
  };
}

function archivedAdminView(tripOverrides: Partial<TripView['trip']> = {}): TripView {
  const base = archivedOrganiserView({}, tripOverrides);
  return {
    ...base,
    me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: true },
    people: base.people.map((p) => (p.id === PIDS.A ? { ...p, isMember: true, isAdmin: true } : p)),
  };
}

describe('Deleting an archived group in Settings', () => {
  it('organiser sees Unarchive group and Danger zone Delete group (without calling window.confirm); non-organiser admin does not see Delete group', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockApi({ 'GET /api/trips/t-1': archivedOrganiserView() });
    const first = renderAt(<Settings />, at);

    expect(await screen.findByRole('button', { name: 'Unarchive group' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeInTheDocument();
    expect(screen.getByText('Starts a 30-day wait before permanent deletion. You can cancel anytime.')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    first.unmount();

    mockApi({ 'GET /api/trips/t-1': archivedAdminView() });
    renderAt(<Settings />, at);
    await screen.findByText('This trip is archived. You can still look at it.');
    expect(screen.queryByRole('button', { name: 'Delete group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unarchive group' })).toBeNull();
  });

  it('non-archived direct personal ledger group never shows archive or delete controls', async () => {
    const base = tripView();
    mockApi({
      'GET /api/trips/t-1': {
        ...base,
        trip: { ...base.trip, archived: false, preset: 'direct' },
      },
    });
    renderAt(<Settings />, at);
    await screen.findByRole('link', { name: 'People' });
    expect(screen.queryByRole('button', { name: 'Archive group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete group' })).toBeNull();
  });

  it('clicking Delete group opens the Sheet with the Spending book, 30-day date, and People warnings', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockApi({ 'GET /api/trips/t-1': archivedOrganiserView() });
    renderAt(<Settings />, at);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
    expect(confirmSpy).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog', { name: 'Delete "Đà Lạt · Oct 2026"?' });
    const expectedDate = formatDeleteDate(new Date(Date.now() + 30 * 86_400_000).toISOString(), 'en');

    expect(within(dialog).getByText('Transactions in this group stop counting in Spending book right away.')).toBeInTheDocument();
    expect(within(dialog).getByText(`Permanently deleted on ${expectedDate}. You can cancel anytime before then.`)).toBeInTheDocument();
    expect(within(dialog).getByText('Balances in People stay for 30 days and are removed when permanently deleted.')).toBeInTheDocument();
  });

  it('shows unsettled-balance callout when suggestions or says_paid payments exist, and hides it when both are empty', async () => {
    mockApi({ 'GET /api/trips/t-1': archivedOrganiserView({ suggestions: [], payments: [] }) });
    const cleanRender = renderAt(<Settings />, at);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
    const cleanDialog = await screen.findByRole('dialog', { name: 'Delete "Đà Lạt · Oct 2026"?' });
    expect(
      within(cleanDialog).queryByText(/This group still has unsettled balances/),
    ).toBeNull();
    cleanRender.unmount();

    mockApi({
      'GET /api/trips/t-1': archivedOrganiserView({
        suggestions: [],
        payments: [paymentView('pay-1', PIDS.C, PIDS.M, 500000, { status: 'says_paid' })],
      }),
    });
    const waitingRender = renderAt(<Settings />, at);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
    const waitingDialog = await screen.findByRole('dialog', { name: 'Delete "Đà Lạt · Oct 2026"?' });
    expect(
      within(waitingDialog).getByText(
        'This group still has unsettled balances. They — and any earlier People-tab settlements tied to them — will be permanently lost after 30 days.',
      ),
    ).toBeInTheDocument();
    waitingRender.unmount();
  });

  it('confirming Delete in 30 days calls POST /api/trips/t-1/delete, closes the sheet, and navigates back to /t/t-1; API failure keeps sheet open with InlineError', async () => {
    let shouldFail = true;
    const { calls } = mockApi({
      'GET /api/trips/t-1': archivedOrganiserView(),
      'POST /api/trips/t-1/delete': () => {
        if (shouldFail) {
          return Response.json({ error: { code: 'INTERNAL', message: 'Boom' } }, { status: 500 });
        }
        return Response.json({ deleteAfter: new Date(Date.now() + 30 * 86_400_000).toISOString() });
      },
    });

    renderAt(<Settings />, at);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete "Đà Lạt · Oct 2026"?' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete in 30 days' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Delete "Đà Lạt · Oct 2026"?' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/settings');

    shouldFail = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete in 30 days' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete "Đà Lạt · Oct 2026"?' })).toBeNull();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/);
    });
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/delete')).toHaveLength(2);
  });

  it('pending-delete group + organiser hides Unarchive/Delete, shows countdown notice + Cancel deletion, and cancelling stays on Settings with Snackbar', async () => {
    const deleteAfter = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const expectedDate = formatDeleteDate(deleteAfter, 'en');
    let cancelled = false;
    const { calls } = mockApi({
      'GET /api/trips/t-1': () =>
        Response.json(
          archivedOrganiserView({}, { deleteAfter: cancelled ? null : deleteAfter }),
        ),
      'POST /api/trips/t-1/cancel-delete': () => {
        cancelled = true;
        return new Response(null, { status: 204 });
      },
    });

    renderAt(<Settings />, at);

    expect(
      await screen.findByText(`Permanently deletes in 10 days (${expectedDate})`),
    ).toBeInTheDocument();
    expect(screen.getByText('Transactions no longer count in Spending book.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unarchive group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete group' })).toBeNull();

    const cancelBtn = screen.getByRole('button', { name: 'Cancel deletion' });
    await userEvent.click(cancelBtn);

    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/cancel-delete')).toBe(true);
    });

    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/settings');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Deletion cancelled. Group is back to archived.',
    );
    expect(await screen.findByRole('button', { name: 'Unarchive group' })).toBeInTheDocument();
  });

  it('pending-delete group + non-organiser shows countdown notice without Cancel deletion or Unarchive', async () => {
    const deleteAfter = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const expectedDate = formatDeleteDate(deleteAfter, 'en');
    mockApi({
      'GET /api/trips/t-1': archivedAdminView({ deleteAfter }),
    });

    renderAt(<Settings />, at);

    expect(
      await screen.findByText(`Permanently deletes in 5 days (${expectedDate})`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel deletion' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unarchive group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete group' })).toBeNull();
  });
});

describe('DeletePendingBanner', () => {
  it('supports singular 1-day copy, today copy, optional Spending book note, and inline cancel callback', async () => {
    const oneDay = new Date(Date.now() + 12 * 3600_000).toISOString();
    const oneDayDate = formatDeleteDate(oneDay, 'en');
    const onCancelled = vi.fn();
    mockApi({ 'POST /api/trips/t-1/cancel-delete': null });

    const first = renderAt(
      <DeletePendingBanner
        tripId="t-1"
        deleteAfter={oneDay}
        canCancel={true}
        showSpendingBookNote={true}
        onCancelled={onCancelled}
      />,
      at,
    );

    expect(screen.getByText(`Permanently deletes in 1 day (${oneDayDate})`)).toBeInTheDocument();
    expect(screen.getByText('Transactions no longer count in Spending book.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));
    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    first.unmount();

    const past = new Date(Date.now() - 60_000).toISOString();
    renderAt(
      <DeletePendingBanner
        tripId="t-1"
        deleteAfter={past}
        canCancel={false}
        showSpendingBookNote={false}
      />,
      at,
    );
    expect(screen.getByText('Deletes today')).toBeInTheDocument();
    expect(screen.queryByText('Transactions no longer count in Spending book.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel deletion' })).toBeNull();
  });
});
