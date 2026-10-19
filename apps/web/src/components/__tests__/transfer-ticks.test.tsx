import { useState } from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import type { PayInfo, PaymentView, TripView } from '@fsl/core';
import { apiFetch } from '../../api/client';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, tripView, viewerView, PIDS } from '../../test/fixtures';
import { YourTransfers } from '../YourTransfers';

const PAYMENTS = 'POST /api/trips/t-1/payments';
const recorded = (status: 'confirmed' | 'says_paid' = 'confirmed') => () =>
  Response.json({ paymentId: 'pay-9', status }, { status: 201 });

type Calls = { method: string; path: string; body: unknown }[];
type FetchMock = { mock: { calls: unknown[][] } };
const posted = (calls: Calls) => calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/payments').map((c) => c.body);
/** The `keepalive` flag of every payment POST, in order. */
const keepalives = (fetchMock: FetchMock) =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url).endsWith('/payments') && (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => (init as RequestInit).keepalive === true);

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const later = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

const AN = 'Mark 385.000₫ from An as received';
const CHI = 'Mark 1.245.000₫ from Chi as received';
const CHI_PAYS_MINH = 'Mark 1.245.000₫ to Minh as paid';
const ticks = () => screen.queryAllByRole('button', { name: /^Mark / });

/** The member view with Bình made a member, and a debt of mine to Bình. */
function withMemberBinh(): TripView {
  const base = tripView();
  return {
    ...base,
    people: base.people.map((p) => (p.id === PIDS.B ? { ...p, isMember: true } : p)),
    suggestions: [...base.suggestions, { fromId: PIDS.M, toId: PIDS.B, amount: 50000 }],
  };
}

describe('Your transfers: tick to confirm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup(); // unmount (and flush any tick) while fetch is still stubbed
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a member ticks every row they are in', () => {
    const { unmount } = renderAt(<YourTransfers view={withMemberBinh()} />);
    expect(screen.getByRole('button', { name: CHI })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: AN })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark 50.000₫ to Bình as paid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark 565.000₫ from Bình as received' })).toBeInTheDocument();
    expect(ticks()).toHaveLength(4);
    unmount();

    renderAt(<YourTransfers view={guestChiView()} />);
    expect(ticks().map((b) => b.getAttribute('aria-label'))).toEqual([CHI_PAYS_MINH]);
    expect(screen.getByRole('button', { name: CHI_PAYS_MINH })).toHaveAttribute('title', CHI_PAYS_MINH);
  });

  it('a guest can also tick received when a member pays them', () => {
    const chiWithMemberPaying: TripView = {
      ...guestChiView(),
      suggestions: [{ fromId: PIDS.M, toId: PIDS.C, amount: 100000 }],
    };
    renderAt(<YourTransfers view={chiWithMemberPaying} />);
    const row = screen.getByTestId(`transfer-${PIDS.M}-${PIDS.C}`);
    expect(within(row).getByRole('button', { name: /^Mark 100.000₫ from Minh as received$/ })).toBeInTheDocument();
  });

  it("ticking a member's debt records it after Undo", async () => {
    const { calls } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={withMemberBinh()} />);
    const tick = screen.getByRole('button', { name: 'Mark 565.000₫ from Bình as received' });
    await user().click(tick);
    expect(screen.getByRole('status')).toHaveTextContent('Bình paid 565.000₫');
    await later(5_000);
    expect(posted(calls)).toEqual([{ fromId: PIDS.B, toId: PIDS.M, amount: 565000, settles: true }]);
  });

  it('records a tick after 5 seconds', async () => {
    // A manual clock for this one: with `shouldAdvanceTime` real time moves the fake clock too, which would leave the
    // "nothing at 4.9 seconds" check only ~100ms of slack on a slow machine. user-event waits on real time, so click
    // with fireEvent here.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: false });
    const { calls, fetchMock } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={tripView()} />);
    const tick = screen.getByRole('button', { name: AN });
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tick);
    await later(4_900);

    expect(posted(calls)).toEqual([]);
    expect(tick).toHaveAttribute('aria-pressed', 'true');
    const snack = screen.getByRole('status');
    expect(snack).toHaveTextContent('An paid 385.000₫');
    expect(within(snack).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await later(100);
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000, settles: true }]);
    // Sent with keepalive like every tick: closing the tab while the request is out must not lose it.
    expect(keepalives(fetchMock)).toEqual([true]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Undo cancels the tick', async () => {
    const { calls } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={tripView()} />);
    const tick = screen.getByRole('button', { name: AN });
    await user().click(tick);
    await later(2_000);
    await user().click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    expect(tick).toHaveFocus();
    await later(10_000);
    expect(posted(calls)).toEqual([]);

    // Tapping the ticked circle again is an undo too.
    await user().click(tick);
    await user().click(tick);
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('status')).toBeNull();
    await later(10_000);
    expect(posted(calls)).toEqual([]);
  });

  it('a tick whose transfer disappears before the 5 seconds end is cancelled, not recorded', async () => {
    const { calls } = mockApi({ [PAYMENTS]: recorded() });
    // Polling brings a new trip while Undo is still on offer.
    let setView: (view: TripView) => void = () => {};
    function Polled() {
      const [view, set] = useState(tripView());
      setView = set;
      return <YourTransfers view={view} />;
    }
    renderAt(<Polled />);
    await user().click(screen.getByRole('button', { name: AN }));
    await later(2_000);
    expect(screen.getByRole('status')).toHaveTextContent('An paid 385.000₫');

    // An's debt is gone: the other side recorded it, or Minh confirmed An's own claim. Sending the tick would count it twice.
    act(() => setView({ ...tripView(), suggestions: tripView().suggestions.filter((s) => s.fromId !== PIDS.A) }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: AN })).toBeNull();
    await later(10_000);
    expect(posted(calls)).toEqual([]);

    // Leaving the page now sends nothing either.
    cleanup();
    expect(posted(calls)).toEqual([]);
  });

  it('a tick whose transfer is still there when the new trip arrives is still recorded', async () => {
    const { calls } = mockApi({ [PAYMENTS]: recorded() });
    let setView: (view: TripView) => void = () => {};
    function Polled() {
      const [view, set] = useState(tripView());
      setView = set;
      return <YourTransfers view={view} />;
    }
    renderAt(<Polled />);
    await user().click(screen.getByRole('button', { name: AN }));
    // Someone else's debt changed, not An's.
    act(() => setView({ ...tripView(), suggestions: tripView().suggestions.filter((s) => s.fromId !== PIDS.B) }));
    expect(screen.getByRole('status')).toHaveTextContent('An paid 385.000₫');
    await later(5_000);
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000, settles: true }]);
  });

  it('flushes a pending tick when the component unmounts', async () => {
    const { calls, fetchMock } = mockApi({ [PAYMENTS]: recorded() });
    const { unmount } = renderAt(<YourTransfers view={tripView()} />);
    await user().click(screen.getByRole('button', { name: AN }));
    await later(2_000);
    expect(posted(calls)).toEqual([]);

    unmount();
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000, settles: true }]);
    expect(keepalives(fetchMock)).toEqual([true]);
    await later(10_000);
    expect(posted(calls)).toHaveLength(1);
  });

  it('sends a pending tick at once when the page is hidden or left', async () => {
    const { calls, fetchMock } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={tripView()} />);

    await user().click(screen.getByRole('button', { name: AN }));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000, settles: true }]);
    visibility.mockReturnValue('visible');

    await user().click(screen.getByRole('button', { name: CHI }));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(posted(calls)).toHaveLength(2);
    expect(posted(calls)[1]).toEqual({ fromId: 'p-chi', toId: 'p-minh', amount: 1245000, settles: true });
    expect(keepalives(fetchMock)).toEqual([true, true]);
    await later(10_000);
    expect(posted(calls)).toHaveLength(2);
  });

  it('a second tick sends the first one at once', async () => {
    const { calls, fetchMock } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={tripView()} />);
    await user().click(screen.getByRole('button', { name: AN }));
    await later(1_000);
    await user().click(screen.getByRole('button', { name: CHI }));

    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000, settles: true }]);
    expect(screen.getByRole('status')).toHaveTextContent('Chi paid 1.245.000₫');
    await later(5_000);
    expect(posted(calls)).toEqual([
      { fromId: 'p-an', toId: 'p-minh', amount: 385000, settles: true },
      { fromId: 'p-chi', toId: 'p-minh', amount: 1245000, settles: true },
    ]);
    expect(keepalives(fetchMock)).toEqual([true, true]);
  });

  it('a ticked row stays done while it is being recorded', async () => {
    let release: () => void = () => {};
    mockApi({
      [PAYMENTS]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(Response.json({ paymentId: 'pay-9', status: 'confirmed' }, { status: 201 }));
        }),
    });
    renderAt(<YourTransfers view={tripView()} />);
    const tick = screen.getByRole('button', { name: AN });
    await user().click(tick);
    await later(5_000);

    // Sent, waiting for the server: still done, and a second tap can neither undo nor record it twice.
    expect(tick).toHaveAttribute('aria-pressed', 'true');
    expect(tick).toHaveAttribute('aria-disabled', 'true');
    await user().click(tick);
    expect(tick).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => release());
    await waitFor(() => expect(tick).not.toHaveAttribute('aria-disabled', 'true'));
  });

  it('a tick sent on the way out stays done if the section comes back before the server answers', async () => {
    let release: () => void = () => {};
    const { calls, fetchMock } = mockApi({
      [PAYMENTS]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(Response.json({ paymentId: 'pay-9', status: 'confirmed' }, { status: 201 }));
        }),
    });
    const first = renderAt(<YourTransfers view={tripView()} />);
    await user().click(screen.getByRole('button', { name: AN }));
    first.unmount(); // sent at once, with keepalive
    expect(posted(calls)).toHaveLength(1);
    expect(keepalives(fetchMock)).toEqual([true]);

    // Back within the round trip: the old trip still lists An's debt, but the row is done and can't be sent again.
    const again = renderAt(<YourTransfers view={tripView()} />);
    const tick = within(again.container).getByRole('button', { name: AN });
    expect(tick).toHaveAttribute('aria-pressed', 'true');
    expect(tick).toHaveAttribute('aria-disabled', 'true');
    await user().click(tick);
    expect(screen.queryByRole('status')).toBeNull();
    await later(10_000);
    expect(posted(calls)).toHaveLength(1);
    // Only that trip's row: the same two people in another trip can still tick.
    const base = tripView();
    const other = renderAt(<YourTransfers view={{ ...base, trip: { ...base.trip, id: 't-2' } }} />);
    expect(within(other.container).getByRole('button', { name: AN })).toHaveAttribute('aria-pressed', 'false');
    other.unmount();

    await act(async () => release());
    await waitFor(() => expect(tick).not.toHaveAttribute('aria-disabled', 'true'));
    expect(posted(calls)).toHaveLength(1);
  });

  it('a tick sent on the way out reloads the trip even with nothing on screen', async () => {
    let gets = 0;
    const { calls } = mockApi({
      'GET /api/trips/t-1': () => {
        gets += 1;
        return Response.json(tripView());
      },
      [PAYMENTS]: recorded(),
    });
    function Live() {
      const { data } = useQuery({ queryKey: ['trip', 't-1'], queryFn: () => apiFetch<TripView>('/api/trips/t-1', { tripId: 't-1' }) });
      return data ? <YourTransfers view={data} /> : null;
    }
    const { unmount } = renderAt(<Live />);
    await user().click(await screen.findByRole('button', { name: AN }));
    expect(gets).toBe(1);
    unmount();
    expect(posted(calls)).toHaveLength(1);
    // A screen that comes back then finds the debt gone instead of an old trip it could tick again.
    await waitFor(() => expect(gets).toBe(2));
  });

  it('a tick that fails to record says so and can be ticked again', async () => {
    mockApi({ [PAYMENTS]: () => Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }) });
    renderAt(<YourTransfers view={tripView()} />);
    const tick = screen.getByRole('button', { name: AN });
    await user().click(tick);
    await later(5_000);
    expect(await screen.findByRole('status')).toHaveTextContent('Something went wrong. Try again.');
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    expect(tick).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('a guest ticking a debt to a member then waits for them', async () => {
    const saysPaid: PaymentView = {
      id: 'pay-9', fromId: PIDS.C, toId: PIDS.M, amountClaimed: 1245000, amountConfirmed: null,
      status: 'says_paid', notArrived: false, createdAt: '2026-10-15T08:00:00.000Z',
    };
    // After Chi says she paid, the debt leaves the suggestions until Minh confirms it.
    const after: TripView = { ...guestChiView(), suggestions: tripView().suggestions.filter((s) => s.fromId !== PIDS.C), payments: [saysPaid] };
    let paid = false;
    const { calls } = mockApi({
      'GET /api/trips/t-1': () => Response.json(paid ? after : guestChiView()),
      [PAYMENTS]: () => {
        paid = true;
        return recorded('says_paid')();
      },
    });
    function Live() {
      const { data } = useQuery({ queryKey: ['trip', 't-1'], queryFn: () => apiFetch<TripView>('/api/trips/t-1', { tripId: 't-1' }) });
      return data ? <YourTransfers view={data} /> : null;
    }
    renderAt(<Live />);

    await user().click(await screen.findByRole('button', { name: CHI_PAYS_MINH }));
    expect(screen.getByRole('status')).toHaveTextContent('You paid Minh 1.245.000₫');
    await later(5_000);

    const waiting = (await screen.findByText('Waiting for Minh')).closest('li')!;
    expect(posted(calls)).toEqual([{ fromId: PIDS.C, toId: PIDS.M, amount: 1245000, settles: true }]);
    expect(waiting).toHaveTextContent('You → Minh');
    expect(waiting).toHaveTextContent('1.245.000₫');
    // Nothing left to tick or open: Minh confirms it.
    expect(ticks()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /^You → Minh/ })).toBeNull();
    expect(screen.queryByText("You're all settled")).toBeNull();
  });

  it('no ticks on archived trips or for viewers', () => {
    const base = tripView();
    const archived = renderAt(<YourTransfers view={{ ...base, trip: { ...base.trip, archived: true } }} />);
    expect(screen.getByRole('button', { name: /^Chi → You/ })).toBeInTheDocument();
    expect(ticks()).toHaveLength(0);
    archived.unmount();

    const viewer = renderAt(<YourTransfers view={viewerView()} />);
    expect(ticks()).toHaveLength(0);
    viewer.unmount();

    // A guest whose name is still waiting for approval can't confirm anything yet.
    const chi = guestChiView();
    renderAt(<YourTransfers view={{ ...chi, me: { ...chi.me, participantPending: true } }} />);
    expect(screen.getByRole('button', { name: /^You → Minh/ })).toBeInTheDocument();
    expect(ticks()).toHaveLength(0);
  });

  it("on phones the same row swipes to Received or I've paid", async () => {
    mockMedia({ coarse: true });
    const { calls } = mockApi({ [PAYMENTS]: recorded() });
    const phone = renderAt(<YourTransfers view={withMemberBinh()} />);
    const anRow = screen.getByTestId(`transfer-${PIDS.A}-${PIDS.M}`);
    // Member paying me has Received behind it too; debts of mine have I've paid.
    expect(within(screen.getByTestId(`transfer-${PIDS.B}-${PIDS.M}`)).getByRole('button', { name: 'Received' })).toBeInTheDocument();
    expect(within(screen.getByTestId(`transfer-${PIDS.M}-${PIDS.B}`)).getByRole('button', { name: "I've paid" })).toBeInTheDocument();

    await user().click(within(anRow).getByRole('button', { name: 'Received' }));
    expect(screen.getByRole('status')).toHaveTextContent('An paid 385.000₫');
    expect(within(anRow).getByRole('button', { name: AN })).toHaveAttribute('aria-pressed', 'true');
    // Already ticked: the swipe action is gone, so it can't be recorded twice.
    expect(within(anRow).queryByRole('button', { name: 'Received' })).toBeNull();
    await later(5_000);
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000, settles: true }]);
    phone.unmount();

    // A guest on phone gets a swipe action when a member pays them too.
    const guestPhone = renderAt(
      <YourTransfers
        view={{
          ...guestChiView(),
          suggestions: [{ fromId: PIDS.M, toId: PIDS.C, amount: 100000 }],
        }}
      />,
    );
    expect(within(screen.getByTestId(`transfer-${PIDS.M}-${PIDS.C}`)).getByRole('button', { name: 'Received' })).toBeInTheDocument();
    guestPhone.unmount();

    // With a mouse the tick is the only way: no hover tool on the row.
    mockMedia({ coarse: false });
    renderAt(<YourTransfers view={withMemberBinh()} />);
    expect(screen.queryByRole('button', { name: 'Received' })).toBeNull();
    expect(screen.queryByRole('button', { name: "I've paid" })).toBeNull();
  });

  it('a tick someone else already recorded says so and reloads the trip', async () => {
    let reloaded = false;
    mockApi({
      [PAYMENTS]: () =>
        Response.json(
          { error: { code: 'ALREADY_HANDLED', message: 'Someone already handled this.' } },
          { status: 409 },
        ),
      'GET /api/trips/t-1': () => {
        reloaded = true;
        return Response.json(tripView());
      },
    });
    function Live() {
      const { data } = useQuery({ queryKey: ['trip', 't-1'], queryFn: () => apiFetch<TripView>('/api/trips/t-1', { tripId: 't-1' }) });
      return data ? <YourTransfers view={data} /> : null;
    }
    renderAt(<Live />);
    await user().click(await screen.findByRole('button', { name: AN }));
    await later(5_000);
    expect(await screen.findByText('Already recorded. The list is up to date.')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong. Try again.')).toBeNull();
    expect(reloaded).toBe(true);
  });
});

describe('Your transfers: open rows and initials', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const BANK = { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' };
  const payInfo = (overrides: Partial<PayInfo> = {}): PayInfo => ({
    to: { id: PIDS.M, name: 'Minh' }, amount: 1245000, bankState: 'ok', bank: BANK, refCode: 'DALAT C7K2',
    payload: '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572',
    inFlight: [], ...overrides,
  });

  it('an open row names the part it opens', async () => {
    mockApi({ 'GET /api/trips/t-1/pay/p-minh': payInfo() });
    renderAt(<YourTransfers view={tripView()} />);
    const row = screen.getByRole('button', { name: /^Chi → You/ });
    expect(row).not.toHaveAttribute('aria-controls');
    await userEvent.click(row);
    const id = row.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    const detail = document.getElementById(id!)!;
    expect(detail).not.toBeNull();
    expect(await within(detail).findByRole('img', { name: /VietQR code/ })).toBeInTheDocument();
    await userEvent.click(row);
    expect(row).not.toHaveAttribute('aria-controls');
  });

  it('an open row with nothing to show says so instead of an empty box', async () => {
    mockApi({ 'GET /api/trips/t-1/pay/p-minh': payInfo({ amount: 0, payload: null }) });
    const owed = renderAt(<YourTransfers view={tripView()} />);
    await userEvent.click(screen.getByRole('button', { name: /^Chi → You/ }));
    expect(await screen.findByText("Chi doesn't owe you anything right now.")).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR code/ })).toBeNull();
    owed.unmount();

    mockApi({ 'GET /api/trips/t-1/pay/p-minh': payInfo({ amount: 0, payload: null }) });
    renderAt(<YourTransfers view={guestChiView()} />);
    await userEvent.click(screen.getByRole('button', { name: /^You → Minh/ }));
    expect(await screen.findByText("You don't owe Minh anything right now.")).toBeInTheDocument();
  });

  it('rows where I pay show my own initial while the text says You', () => {
    renderAt(<YourTransfers view={guestChiView()} />);
    const row = screen.getByRole('button', { name: /^You → Minh/ });
    expect(row).toHaveTextContent('You → Minh');
    expect(row.querySelector('.fsl-avatar')).toHaveTextContent(/^C$/);
  });
});

describe('Your transfers: multiple incoming transfers (member and guest payers)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const memberAndGuestPayersView = (kind: 'member' | 'guest' = 'member'): TripView => {
    const base = tripView();
    const meId = 'p-me';
    const memberPayerId = 'p-member-payer';
    const guestPayer1Id = 'p-guest-1';
    const guestPayer2Id = 'p-guest-2';
    return {
      ...base,
      me: { ...base.me, kind, participantId: meId },
      people: [
        { id: meId, name: 'You Person', isMember: kind === 'member', status: 'active', bank: 'none' },
        { id: memberPayerId, name: 'Nguyen Vu Nhan', isMember: true, status: 'active', bank: 'none' },
        { id: guestPayer1Id, name: 'Thủy', isMember: false, status: 'active', bank: 'none' },
        { id: guestPayer2Id, name: 'Huyền', isMember: false, status: 'active', bank: 'none' },
      ],
      suggestions: [
        { fromId: memberPayerId, toId: meId, amount: 1000000 },
        { fromId: guestPayer1Id, toId: meId, amount: 1000000 },
        { fromId: guestPayer2Id, toId: meId, amount: 1000000 },
      ],
      balances: {
        [meId]: 3000000,
        [memberPayerId]: -1000000,
        [guestPayer1Id]: -1000000,
        [guestPayer2Id]: -1000000,
      },
    };
  };

  it('renders a Received tick on EVERY row when both members and guests owe me', async () => {
    const { calls } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={memberAndGuestPayersView('member')} />);

    const memberTick = screen.getByRole('button', { name: 'Mark 1.000.000₫ from Nguyen Vu Nhan as received' });
    const thuyTick = screen.getByRole('button', { name: 'Mark 1.000.000₫ from Thủy as received' });
    const huyenTick = screen.getByRole('button', { name: 'Mark 1.000.000₫ from Huyền as received' });

    expect(memberTick).toBeInTheDocument();
    expect(thuyTick).toBeInTheDocument();
    expect(huyenTick).toBeInTheDocument();
    expect(ticks()).toHaveLength(3);
    // Crucial check: none of the rows should fall back to the empty tick-space placeholder!
    expect(document.querySelectorAll('.fsl-transfers__tick-space')).toHaveLength(0);

    // Ticking the member payer marks it received and posts settles: true
    await user().click(memberTick);
    expect(screen.getByRole('status')).toHaveTextContent('Nguyen Vu Nhan paid 1.000.000₫');
    expect(memberTick).toHaveAttribute('aria-pressed', 'true');
    await later(5_000);
    expect(posted(calls)).toEqual([{ fromId: 'p-member-payer', toId: 'p-me', amount: 1000000, settles: true }]);
  });

  it('renders a Received tick on EVERY row even when I am viewing as a guest', async () => {
    const { calls } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={memberAndGuestPayersView('guest')} />);

    expect(screen.getByRole('button', { name: 'Mark 1.000.000₫ from Nguyen Vu Nhan as received' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark 1.000.000₫ from Thủy as received' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark 1.000.000₫ from Huyền as received' })).toBeInTheDocument();
    expect(ticks()).toHaveLength(3);
    expect(document.querySelectorAll('.fsl-transfers__tick-space')).toHaveLength(0);

    await user().click(screen.getByRole('button', { name: 'Mark 1.000.000₫ from Nguyen Vu Nhan as received' }));
    expect(screen.getByRole('status')).toHaveTextContent('Nguyen Vu Nhan paid 1.000.000₫');
    await later(5_000);
    expect(posted(calls)).toEqual([{ fromId: 'p-member-payer', toId: 'p-me', amount: 1000000, settles: true }]);
  });
});
