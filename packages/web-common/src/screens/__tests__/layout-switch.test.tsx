import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMediaLive } from '../../test/media';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { MemberTrip } from '../MemberTrip';
import { GuestTrip } from '../GuestTrip';

// Ruling R-Z: crossing 1024px swaps the trip page's phone and layout A trees. An open QR row and a tick waiting out
// its Undo must survive the switch: the row stays open, the tick is not sent early, and Undo still cancels it.

const PAYMENTS = 'POST /api/trips/t-1/payments';
const PAY_TO_MINH = 'GET /api/trips/t-1/pay/p-minh';
const AN = 'Mark 385.000₫ from An as received';
const PAYLOAD = '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572';
const BANK = { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' };
const payInfo = (amount: number): PayInfo => ({
  to: { id: PIDS.M, name: 'Minh' }, amount, bankState: 'ok', bank: BANK, refCode: 'DALAT C7K2', payload: PAYLOAD, inFlight: [],
});

type Calls = { method: string; path: string; body: unknown }[];
const posted = (calls: Calls) => calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/payments').map((c) => c.body);
const row = (name: RegExp) => screen.getByRole('button', { name });
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const later = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

afterEach(() => {
  cleanup(); // unmount (and flush any tick) while fetch is still stubbed
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('crossing 1024px with a tick pending', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  });

  it('records it only after the full 5 seconds, once, with the snackbar shown in both layouts', async () => {
    const media = mockMediaLive({ wide: false });
    const { calls } = mockApi({ [PAYMENTS]: () => Response.json({ paymentId: 'pay-9', status: 'confirmed' }, { status: 201 }) });
    renderAt(<MemberTrip view={tripView()} />);
    await user().click(screen.getByRole('button', { name: AN }));
    await later(2_000);

    act(() => media.set({ wide: true }));
    expect(posted(calls)).toEqual([]);
    expect(screen.getByRole('button', { name: AN })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('An paid 385.000₫');

    await later(2_800);
    expect(posted(calls)).toEqual([]);
    await later(200);
    expect(posted(calls)).toEqual([{ fromId: PIDS.A, toId: PIDS.M, amount: 385000, settles: true }]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Undo still cancels it after the switch, both ways', async () => {
    const media = mockMediaLive({ wide: true });
    const { calls } = mockApi({ [PAYMENTS]: () => Response.json({ paymentId: 'pay-9', status: 'confirmed' }, { status: 201 }) });
    renderAt(<MemberTrip view={tripView()} />);
    await user().click(screen.getByRole('button', { name: AN }));
    await later(1_000);

    act(() => media.set({ wide: false }));
    await later(1_000);
    act(() => media.set({ wide: true }));
    await user().click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: AN })).toHaveAttribute('aria-pressed', 'false');
    await later(10_000);
    expect(posted(calls)).toEqual([]);
  });
});

describe('crossing 1024px with a QR row open', () => {
  it('keeps the member row open, with its QR, both ways', async () => {
    const media = mockMediaLive({ wide: false });
    mockApi({ [PAY_TO_MINH]: payInfo(385000) });
    renderAt(<MemberTrip view={tripView()} />);
    await userEvent.click(row(/^An → You/));
    expect(await screen.findByRole('img', { name: /VietQR code/ })).toBeInTheDocument();

    act(() => media.set({ wide: true }));
    expect(row(/^An → You/)).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('img', { name: /VietQR code/ })).toBeInTheDocument();

    act(() => media.set({ wide: false }));
    expect(row(/^An → You/)).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('img', { name: /VietQR code/ })).toBeInTheDocument();
  });

  it("keeps a guest's row open too", async () => {
    const media = mockMediaLive({ wide: true });
    mockApi({ [PAY_TO_MINH]: payInfo(1245000) });
    renderAt(<GuestTrip view={guestChiView()} />);
    await userEvent.click(row(/^You → Minh/));
    expect(await screen.findByRole('img', { name: /VietQR code to pay Minh/ })).toBeInTheDocument();

    act(() => media.set({ wide: false }));
    expect(row(/^You → Minh/)).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('img', { name: /VietQR code to pay Minh/ })).toBeInTheDocument();
  });
});
