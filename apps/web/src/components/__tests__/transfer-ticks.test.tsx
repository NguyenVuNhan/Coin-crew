import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
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

  it('ticks only where a guest pays me and on my own debts', () => {
    const { unmount } = renderAt(<YourTransfers view={withMemberBinh()} />);
    expect(screen.getByRole('button', { name: CHI })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: AN })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark 50.000₫ to Bình as paid' })).toBeInTheDocument();
    // Bình is a member: they mark it paid themselves and it counts straight away.
    expect(within(screen.getByTestId(`transfer-${PIDS.B}-${PIDS.M}`)).queryByRole('button', { name: /^Mark / })).toBeNull();
    expect(ticks()).toHaveLength(3);
    unmount();

    renderAt(<YourTransfers view={guestChiView()} />);
    expect(ticks().map((b) => b.getAttribute('aria-label'))).toEqual([CHI_PAYS_MINH]);
    expect(screen.getByRole('button', { name: CHI_PAYS_MINH })).toHaveAttribute('title', CHI_PAYS_MINH);
  });

  it('records a tick after 5 seconds', async () => {
    const { calls, fetchMock } = mockApi({ [PAYMENTS]: recorded() });
    renderAt(<YourTransfers view={tripView()} />);
    const tick = screen.getByRole('button', { name: AN });
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    await user().click(tick);
    // Advance straight away: the clock also runs with real time, so slow queries first would eat the 100ms margin.
    await later(4_900);

    expect(posted(calls)).toEqual([]);
    expect(tick).toHaveAttribute('aria-pressed', 'true');
    const snack = screen.getByRole('status');
    expect(snack).toHaveTextContent('An paid 385.000₫');
    expect(within(snack).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    await later(100);
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000 }]);
    expect(keepalives(fetchMock)).toEqual([false]);
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

  it('flushes a pending tick when the component unmounts', async () => {
    const { calls, fetchMock } = mockApi({ [PAYMENTS]: recorded() });
    const { unmount } = renderAt(<YourTransfers view={tripView()} />);
    await user().click(screen.getByRole('button', { name: AN }));
    await later(2_000);
    expect(posted(calls)).toEqual([]);

    unmount();
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000 }]);
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
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000 }]);
    visibility.mockReturnValue('visible');

    await user().click(screen.getByRole('button', { name: CHI }));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(posted(calls)).toHaveLength(2);
    expect(posted(calls)[1]).toEqual({ fromId: 'p-chi', toId: 'p-minh', amount: 1245000 });
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

    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000 }]);
    expect(screen.getByRole('status')).toHaveTextContent('Chi paid 1.245.000₫');
    await later(5_000);
    expect(posted(calls)).toEqual([
      { fromId: 'p-an', toId: 'p-minh', amount: 385000 },
      { fromId: 'p-chi', toId: 'p-minh', amount: 1245000 },
    ]);
    expect(keepalives(fetchMock)).toEqual([false, false]);
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
    expect(posted(calls)).toEqual([{ fromId: PIDS.C, toId: PIDS.M, amount: 1245000 }]);
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
    // The member's row has nothing behind it.
    expect(within(screen.getByTestId(`transfer-${PIDS.B}-${PIDS.M}`)).queryByRole('button', { name: 'Received' })).toBeNull();
    expect(within(screen.getByTestId(`transfer-${PIDS.M}-${PIDS.B}`)).getByRole('button', { name: "I've paid" })).toBeInTheDocument();

    await user().click(within(anRow).getByRole('button', { name: 'Received' }));
    expect(screen.getByRole('status')).toHaveTextContent('An paid 385.000₫');
    expect(within(anRow).getByRole('button', { name: AN })).toHaveAttribute('aria-pressed', 'true');
    // Already ticked: the swipe action is gone, so it can't be recorded twice.
    expect(within(anRow).queryByRole('button', { name: 'Received' })).toBeNull();
    await later(5_000);
    expect(posted(calls)).toEqual([{ fromId: 'p-an', toId: 'p-minh', amount: 385000 }]);
    phone.unmount();

    // With a mouse the tick is the only way: no hover tool on the row.
    mockMedia({ coarse: false });
    renderAt(<YourTransfers view={withMemberBinh()} />);
    expect(screen.queryByRole('button', { name: 'Received' })).toBeNull();
    expect(screen.queryByRole('button', { name: "I've paid" })).toBeNull();
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
