import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import type { PaymentView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { PIDS, tripView, guestChiView, viewerView, picker } from '../../test/fixtures';
import { App } from '../../App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OweScreen', () => {
  it('owes two people: lists both with a Pay button each', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': {
        ...guestChiView(),
        suggestions: [
          { fromId: PIDS.C, toId: PIDS.M, amount: 1000000 },
          { fromId: PIDS.C, toId: PIDS.B, amount: 245000 },
        ],
      },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    expect(await screen.findByText('Minh')).toBeInTheDocument();
    expect(screen.getByText('Bình')).toBeInTheDocument();
    expect(screen.getByText('1.000.000₫')).toBeInTheDocument();
    expect(screen.getByText('245.000₫')).toBeInTheDocument();

    const payMinh = screen.getByRole('link', { name: 'Pay Minh' });
    expect(payMinh).toHaveAttribute('href', `/j/gtok-1/pay/${PIDS.M}`);

    const payBinh = screen.getByRole('link', { name: 'Pay Bình' });
    expect(payBinh).toHaveAttribute('href', `/j/gtok-1/pay/${PIDS.B}`);

    const seeGroup = screen.getByRole('link', { name: 'See the group' });
    expect(seeGroup).toHaveAttribute('href', '/j/gtok-1');
  });

  it('owes exactly one person: opens that pay screen', async () => {
    const payInfo = {
      to: { id: PIDS.M, name: 'Minh' },
      amount: 1245000,
      bankState: 'ok' as const,
      bank: {
        bin: '970407',
        bankName: 'Techcombank',
        accountNumber: '19031234565678',
        accountNumberMasked: '1903 •••• 5678',
        holderName: 'NGUYEN VAN MINH',
      },
      refCode: 'DALAT C7K2',
      payload:
        '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572',
      inFlight: [],
    };
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo,
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/j/gtok-1/pay/${PIDS.M}`),
    );
    expect(await screen.findByRole('link', { name: 'See the group' })).toBeInTheDocument();
  });

  it("owes nothing: says you're all set", async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': { ...guestChiView(), suggestions: [], payments: [] },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    expect(await screen.findByText("You're all set")).toBeInTheDocument();
    expect(screen.getByText("You don't owe anyone in Đà Lạt · Oct 2026.")).toBeInTheDocument();
    // The title names the group, never "…, you owe" above "you don't owe anyone".
    expect(screen.queryByText(/, you owe$/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the group' })).toHaveAttribute(
      'href',
      '/j/gtok-1',
    );
  });

  it('a payment waits for confirmation: says so instead of all set', async () => {
    const waitingPayment: PaymentView = {
      id: 'pay-1',
      fromId: PIDS.C,
      toId: PIDS.M,
      amountClaimed: 1245000,
      amountConfirmed: null,
      status: 'says_paid',
      notArrived: false,
      createdAt: new Date().toISOString(),
    };
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': { ...guestChiView(), suggestions: [], payments: [waitingPayment] },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    expect(await screen.findByText('Waiting for Minh to confirm')).toBeInTheDocument();
    expect(screen.queryByText("You're all set")).not.toBeInTheDocument();
  });

  it('guest without a remembered name: goes to Who are you? and comes back here', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': {
        ...guestChiView(),
        me: { kind: 'guest', participantId: null, participantPending: false, isOrganiser: false },
      },
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/people/picker': picker(),
    });

    function Probe() {
      const location = useLocation();
      const next = new URLSearchParams(location.search).get('next');
      return <div data-testid="next-param">{next}</div>;
    }

    renderAt(
      <>
        <App />
        <Probe />
      </>,
      { route: '/j/gtok-1/owe' },
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/j/gtok-1/who'),
    );
    expect(screen.getByTestId('next-param')).toHaveTextContent('/j/gtok-1/owe');
  });

  it('remembered name has left the group: asks again', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': {
        ...guestChiView(),
        people: guestChiView().people.map((p) =>
          p.id === PIDS.C ? { ...p, status: 'left' as const } : p,
        ),
      },
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/people/picker': picker(),
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/j/gtok-1/who'),
    );
  });

  it('archived group: lands on the group page', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': {
        ...guestChiView(),
        trip: { ...guestChiView().trip, archived: true },
      },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/j\/gtok-1$/),
    );
  });

  it('view-only link: lands on the group page', async () => {
    mockApi({
      'GET /api/links/vtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'view' },
      'GET /api/trips/t-1': viewerView(),
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/vtok-1/owe' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/j\/vtok-1$/),
    );
  });

  it('member on /j/<token>/owe: moves to /t/<tripId>/owe', async () => {
    mockApi({
      'GET /api/links/gtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': {
        ...tripView(),
        suggestions: [
          { fromId: PIDS.M, toId: PIDS.A, amount: 100000 },
          { fromId: PIDS.M, toId: PIDS.B, amount: 50000 },
        ],
      },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1\/owe$/),
    );
    expect(await screen.findByRole('link', { name: 'Pay An' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pay Bình' })).toBeInTheDocument();
  });
});
