import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import type { PayInfo } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { YourTransfers } from '../../components/YourTransfers';
import { PayScreen } from '../../screens/PayScreen';

const PAYMENTS = 'POST /api/trips/t-1/payments';
const KEY = /^[A-Za-z0-9_-]{16,64}$/;
const payRoute = { route: `/t/t-1/pay/${PIDS.M}`, path: '/t/:tripId/pay/:toId' };

type Calls = { method: string; path: string; body: unknown }[];
const keysOf = (calls: Calls) =>
  calls
    .filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/payments')
    .map((c) => (c.body as { idempotencyKey?: string }).idempotencyKey);

const payInfo = (): PayInfo => ({
  to: { id: PIDS.M, name: 'Minh' },
  amount: 1245000,
  bankState: 'ok',
  bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' },
  refCode: 'DALAT C7K2',
  payload: '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572',
  inFlight: [],
});

const payApi = (post: () => Response | Promise<Response>) =>
  mockApi({
    'GET /api/trips/t-1': guestChiView(),
    'GET /api/trips/t-1/version': { version: 3 },
    [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo(),
    [PAYMENTS]: post,
  });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('payment idempotency keys', () => {
  it('a scheduled tick sends an idempotencyKey', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: false });
    const { calls } = mockApi({ [PAYMENTS]: () => Response.json({ paymentId: 'pay-9', status: 'confirmed' }, { status: 201 }) });
    renderAt(<YourTransfers view={tripView()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark 385.000₫ from An as received' }));
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    const keys = keysOf(calls);
    expect(keys).toHaveLength(1);
    expect(typeof keys[0]).toBe('string');
    expect(keys[0]!.length).toBeGreaterThanOrEqual(16);
    expect(keys[0]).toMatch(KEY);
  });

  it('I paid retry after an error reuses the key', async () => {
    const user = userEvent.setup();
    let n = 0;
    const { calls } = payApi(() => {
      n += 1;
      if (n === 1) throw new TypeError('Failed to fetch');
      return Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 });
    });
    renderAt(<PayScreen />, payRoute);
    await user.click(await screen.findByRole('button', { name: "I've paid" }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: "I've paid" }));
    await vi.waitFor(() => expect(keysOf(calls)).toHaveLength(2));
    const [first, second] = keysOf(calls);
    expect(first).toMatch(KEY);
    expect(second).toBe(first);
  });

  it('I paid after a success uses a new key', async () => {
    const user = userEvent.setup();
    const { calls } = payApi(() => Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 }));
    renderAt(<PayScreen />, payRoute);
    await user.click(await screen.findByRole('button', { name: "I've paid" }));
    await vi.waitFor(() => expect(keysOf(calls)).toHaveLength(1));
    // After a success the screen shows the status card; "still owed" brings the QR (and "I've paid") back.
    await user.click(await screen.findByRole('button', { name: 'Show QR for the rest' }));
    await user.click(await screen.findByRole('button', { name: "I've paid" }));
    await vi.waitFor(() => expect(keysOf(calls)).toHaveLength(2));
    const [first, second] = keysOf(calls);
    expect(first).toMatch(KEY);
    expect(second).toMatch(KEY);
    expect(second).not.toBe(first);
  });
  it('I paid retry for a different amount uses a new key', async () => {
    const user = userEvent.setup();
    let posts = 0;
    const { calls } = mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      // The amount owed changes after the failed attempt (someone else recorded something meanwhile).
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: () => Response.json({ ...payInfo(), amount: posts === 0 ? 1245000 : 1000000 }),
      [PAYMENTS]: () => {
        posts += 1;
        if (posts === 1) throw new TypeError('Failed to fetch');
        return Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 });
      },
    });
    renderAt(<PayScreen />, payRoute);
    await user.click(await screen.findByRole('button', { name: "I've paid" }));
    await screen.findByRole('alert');
    // Coming back to the tab refetches the pay info, which now has the new amount.
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET' && c.path === `/api/trips/t-1/pay/${PIDS.M}`).length).toBeGreaterThanOrEqual(2),
    );
    await user.click(screen.getByRole('button', { name: "I've paid" }));
    await vi.waitFor(() => expect(keysOf(calls)).toHaveLength(2));
    const posted = calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/payments').map((c) => c.body as { amount: number; idempotencyKey: string });
    expect(posted.map((b) => b.amount)).toEqual([1245000, 1000000]);
    expect(posted[1]!.idempotencyKey).toMatch(KEY);
    expect(posted[1]!.idempotencyKey).not.toBe(posted[0]!.idempotencyKey);
    focusManager.setFocused(undefined);
  });
});
