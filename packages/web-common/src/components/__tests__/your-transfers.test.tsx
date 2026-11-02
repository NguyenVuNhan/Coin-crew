import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, tripView, viewerView, PIDS } from '../../test/fixtures';
import { shareQr } from '../../lib/qr';
import { YourTransfers } from '../YourTransfers';
import { PayQr } from '../PayQr';

// Building the PNG needs a real canvas, which jsdom does not have: the share step is replaced, the QR itself is real.
vi.mock('../../lib/qr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/qr')>()),
  shareQr: vi.fn(async () => 'shared' as const),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const PAYLOAD = '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572';
const BANK = { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' };

function payInfo(overrides: Partial<PayInfo> = {}): PayInfo {
  return { to: { id: PIDS.M, name: 'Minh' }, amount: 1245000, bankState: 'ok', bank: BANK, refCode: 'DALAT C7K2', payload: PAYLOAD, inFlight: [], ...overrides };
}

/** Chi is a guest; the fixture's other two rows (An, Bình → Minh) are not hers. */
const chi = guestChiView;
/** A member view with one transfer between two other people. */
const withOthers = (): TripView => {
  const base = tripView();
  return { ...base, suggestions: [...base.suggestions, { fromId: PIDS.A, toId: PIDS.B, amount: 25000 }] };
};

const PAY_TO_MINH = '/api/trips/t-1/pay/p-minh';
const fetched = (fetchMock: { mock: { calls: unknown[][] } }) => fetchMock.mock.calls.map(([url]) => String(url));
const row = (name: RegExp) => screen.getByRole('button', { name });

describe('Your transfers: the rows', () => {
  it('shows only my transfers until I ask for all', () => {
    renderAt(<YourTransfers view={tripView()} />);
    expect(screen.getByRole('heading', { name: 'Your transfers' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(row(/^Chi → You, 1\.245\.000₫/)).toBeInTheDocument();
    expect(row(/^Bình → You, 565\.000₫/)).toBeInTheDocument();
    expect(row(/^An → You, 385\.000₫/)).toBeInTheDocument();
  });

  it("a guest sees only what they owe, as 'You → Minh'", () => {
    renderAt(<YourTransfers view={chi()} />);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    expect(row(/^You → Minh, 1\.245\.000₫/)).toBeInTheDocument();
    expect(screen.queryByText(/Bình → Minh/)).toBeNull();
    expect(screen.queryByText(/An → Minh/)).toBeNull();
  });

  it('Show all switches the rows and the title, and is remembered', async () => {
    const first = renderAt(<YourTransfers view={withOthers()} />);
    expect(screen.queryByText(/An → Bình/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('heading', { name: 'Who pays whom' })).toBeInTheDocument();
    expect(screen.getByText(/An → Bình/)).toBeInTheDocument();
    expect(screen.getByText('25.000₫')).toBeInTheDocument();
    // Other people's rows are read-only: text, not a button.
    expect(screen.queryByRole('button', { name: /An → Bình/ })).toBeNull();
    expect(localStorage.getItem('fsl.transfers.mode')).toBe('all');

    // Coming back to the page, it is still on "all".
    first.unmount();
    renderAt(<YourTransfers view={withOthers()} />);
    expect(screen.getByRole('heading', { name: 'Who pays whom' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show mine' }));
    expect(screen.getByRole('heading', { name: 'Your transfers' })).toBeInTheDocument();
    expect(screen.queryByText(/An → Bình/)).toBeNull();
    expect(localStorage.getItem('fsl.transfers.mode')).toBe('mine');
  });

  it('still switches when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt(<YourTransfers view={withOthers()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('heading', { name: 'Who pays whom' })).toBeInTheDocument();
  });

  it('settled trips say so, and a view-only link sees everyone with no switch', () => {
    const settled = tripView({ suggestions: [] });
    const { unmount } = renderAt(<YourTransfers view={settled} />);
    expect(screen.getByText('Everyone is settled up.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
    unmount();

    renderAt(<YourTransfers view={viewerView()} />);
    expect(screen.getByRole('heading', { name: 'Who pays whom' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show mine' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it("nothing for me says I'm settled while other rows stay behind Show all", () => {
    const base = tripView();
    renderAt(<YourTransfers view={{ ...base, suggestions: [{ fromId: PIDS.A, toId: PIDS.B, amount: 25000 }] }} />);
    expect(screen.getByText("You're all settled")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument();
  });
});

describe('Your transfers: the QR in place', () => {
  it('opening a row I am owed shows my QR with Share', async () => {
    const { fetchMock } = mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo() });
    renderAt(<YourTransfers view={tripView()} />);
    const chiRow = row(/^Chi → You/);
    expect(chiRow).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(chiRow);

    const qr = await screen.findByRole('img', { name: /VietQR code/ });
    await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/));
    expect(chiRow).toHaveAttribute('aria-expanded', 'true');
    expect(fetched(fetchMock)).toContain(`${PAY_TO_MINH}?from=${PIDS.C}`);
    expect(screen.getByText('Techcombank · NGUYEN VAN MINH')).toBeInTheDocument();
    expect(screen.getByText('DALAT C7K2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save QR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open bank app' })).toBeNull();

    // Share sends the picture with the usual reminder text for that person.
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(shareQr).toHaveBeenCalledTimes(1);
    const [svg, text, refCode] = vi.mocked(shareQr).mock.calls[0]!;
    expect(svg).toMatch(/^<svg/);
    expect(text).toBe(`Hi Chi! You still owe Minh 1.245.000₫ for "Đà Lạt · Oct 2026". See details and pay with VietQR: ${location.origin}/j/gtok-1`);
    expect(refCode).toBe('DALAT C7K2');
  });

  it('only one row is open at a time', async () => {
    mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo() });
    renderAt(<YourTransfers view={tripView()} />);
    await userEvent.click(row(/^Chi → You/));
    await screen.findByRole('img', { name: /VietQR code/ });
    await userEvent.click(row(/^Bình → You/));
    expect(row(/^Chi → You/)).toHaveAttribute('aria-expanded', 'false');
    expect(row(/^Bình → You/)).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findAllByRole('img', { name: /VietQR code/ })).toHaveLength(1);
    // Tapping the open row closes it.
    await userEvent.click(row(/^Bình → You/));
    expect(screen.queryByRole('img', { name: /VietQR code/ })).toBeNull();
  });

  it('opening a row I owe shows their QR, bank app only on phones', async () => {
    mockMedia({ coarse: true });
    const { fetchMock } = mockApi({ 'GET /api/trips/t-1': chi(), [`GET ${PAY_TO_MINH}`]: payInfo() });
    const phone = renderAt(<YourTransfers view={chi()} />);
    await userEvent.click(row(/^You → Minh/));
    await screen.findByRole('img', { name: /VietQR code/ });
    expect(fetched(fetchMock)).toContain(PAY_TO_MINH);
    expect(screen.getByText('Techcombank · NGUYEN VAN MINH')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save QR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open bank app' }));
    expect(await screen.findByRole('dialog', { name: 'Choose your bank app' })).toBeInTheDocument();
    phone.unmount();

    mockMedia({ coarse: false });
    renderAt(<YourTransfers view={chi()} />);
    await userEvent.click(row(/^You → Minh/));
    await screen.findByRole('img', { name: /VietQR code/ });
    expect(screen.getByRole('button', { name: 'Save QR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open bank app' })).toBeNull();
  });

  it('without approved bank details it asks me to add them', async () => {
    mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo({ bankState: 'none', bank: null, payload: null }) });
    const { unmount } = renderAt(<YourTransfers view={tripView()} />, { route: '/t/t-1' });
    await userEvent.click(row(/^Chi → You/));
    const add = await screen.findByRole('link', { name: 'Add your bank details to get a QR code' });
    expect(add).toHaveAttribute('href', '/t/t-1/bank');
    expect(screen.queryByRole('img', { name: /VietQR code/ })).toBeNull();
    unmount();

    // Waiting for a member to approve them is the same prompt: the bank page shows where it stands.
    mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo({ bankState: 'pending', bank: null, payload: null }) });
    renderAt(<YourTransfers view={tripView()} />, { route: '/t/t-1' });
    await userEvent.click(row(/^Chi → You/));
    expect(await screen.findByRole('link', { name: 'Add your bank details to get a QR code' })).toBeInTheDocument();
  });

  it("when they have no bank details it says so and offers Remind", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo({ bankState: 'none', bank: null, payload: null }) });
    renderAt(<YourTransfers view={chi()} />);
    await userEvent.click(row(/^You → Minh/));
    expect(await screen.findByText("Minh hasn't added bank details yet")).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR code/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remind Minh' }));
    expect(share).toHaveBeenCalledWith({ text: expect.stringContaining('Please add your bank details in "Đà Lạt · Oct 2026"') });
  });

  it('a member who owes a guest without bank details can add them for the guest', async () => {
    const view = tripView({ suggestions: [{ fromId: PIDS.M, toId: PIDS.C, amount: 300000 }] });
    mockApi({ 'GET /api/trips/t-1/pay/p-chi': payInfo({ to: { id: PIDS.C, name: 'Chi' }, bankState: 'none', bank: null, payload: null }) });
    renderAt(<YourTransfers view={view} />, { route: '/t/t-1' });
    await userEvent.click(row(/^You → Chi/));
    expect(await screen.findByText("Chi hasn't added bank details yet")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add bank details for Chi' })).toHaveAttribute('href', '/t/t-1/people/p-chi/bank');
    expect(screen.getByRole('button', { name: 'Remind Chi' })).toBeInTheDocument();
  });

  it('a guest, or a member owing another member, only gets Remind', async () => {
    mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo({ bankState: 'none', bank: null, payload: null }) });
    const guest = renderAt(<YourTransfers view={chi()} />);
    await userEvent.click(row(/^You → Minh/));
    await screen.findByText("Minh hasn't added bank details yet");
    expect(screen.queryByRole('link', { name: /^Add bank details for/ })).toBeNull();
    guest.unmount();

    const base = tripView({ suggestions: [{ fromId: PIDS.M, toId: PIDS.A, amount: 300000 }] });
    const view = { ...base, people: base.people.map((p) => (p.id === PIDS.A ? { ...p, isMember: true } : p)) };
    mockApi({ 'GET /api/trips/t-1/pay/p-an': payInfo({ to: { id: PIDS.A, name: 'An' }, bankState: 'none', bank: null, payload: null }) });
    renderAt(<YourTransfers view={view} />, { route: '/t/t-1' });
    await userEvent.click(row(/^You → An/));
    await screen.findByText("An hasn't added bank details yet");
    expect(screen.queryByRole('link', { name: /^Add bank details for/ })).toBeNull();
  });

  it('their bank details waiting for approval: no QR, no Remind', async () => {
    mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo({ bankState: 'pending', bank: null, payload: null }) });
    renderAt(<YourTransfers view={chi()} />);
    await userEvent.click(row(/^You → Minh/));
    expect(await screen.findByText("Minh's bank details are waiting for approval")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remind/ })).toBeNull();
  });

  it('a failed lookup says so and can be retried', async () => {
    let fail = true;
    mockApi({ [`GET ${PAY_TO_MINH}`]: () => (fail ? Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }) : Response.json(payInfo())) });
    renderAt(<YourTransfers view={chi()} />);
    await userEvent.click(row(/^You → Minh/));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('img', { name: /VietQR code/ })).toBeInTheDocument();
  });
});

describe('Your transfers: the debt changes while a QR is open', () => {
  /** The same screen after the next poll hands it a new trip view. */
  function Polled({ first, next }: { first: TripView; next: TripView }) {
    const [view, setView] = useState(first);
    return (
      <>
        <button type="button" onClick={() => setView(next)}>
          next poll
        </button>
        <YourTransfers view={view} />
      </>
    );
  }

  it('an open QR closes when its transfer disappears', async () => {
    mockApi({ [`GET ${PAY_TO_MINH}`]: payInfo() });
    const first = tripView();
    const next = tripView({
      trip: { ...first.trip, version: 4 },
      suggestions: first.suggestions.filter((s) => s.fromId !== PIDS.C),
    });
    renderAt(<Polled first={first} next={next} />);
    await userEvent.click(row(/^Chi → You/));
    await screen.findByRole('img', { name: /VietQR code/ });

    await userEvent.click(screen.getByRole('button', { name: 'next poll' }));
    expect(screen.queryByRole('img', { name: /VietQR code/ })).toBeNull();
    expect(screen.queryByText(/Chi → You/)).toBeNull();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('a new amount fetches a new QR and never shows the old one', async () => {
    let amount = 1245000;
    const { fetchMock } = mockApi({ [`GET ${PAY_TO_MINH}`]: () => Response.json(payInfo({ amount })) });
    const first = tripView();
    const next = tripView({
      trip: { ...first.trip, version: 4 },
      suggestions: first.suggestions.map((s) => (s.fromId === PIDS.C ? { ...s, amount: 500000 } : s)),
    });
    renderAt(<Polled first={first} next={next} />);
    await userEvent.click(row(/^Chi → You/));
    await screen.findByRole('img', { name: /1\.245\.000₫/ });

    amount = 500000;
    await userEvent.click(screen.getByRole('button', { name: 'next poll' }));
    expect(screen.queryByRole('img', { name: /1\.245\.000₫/ })).toBeNull();
    expect(await screen.findByRole('img', { name: /500\.000₫/ })).toBeInTheDocument();
    expect(fetched(fetchMock).filter((u) => u.includes('?from=p-chi'))).toHaveLength(2);
  });
});

describe('PayQr', () => {
  it('never shows a 0₫ QR', () => {
    const { unmount } = renderAt(<PayQr info={payInfo({ amount: 0 })} variant="pay" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/0₫/)).toBeNull();
    unmount();

    renderAt(<PayQr info={payInfo({ amount: 0 })} variant="receive" shareText="Hi" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing without a payload either', () => {
    renderAt(<PayQr info={payInfo({ payload: null })} variant="pay" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says what happened after Share saved the picture instead', async () => {
    vi.mocked(shareQr).mockResolvedValueOnce('saved');
    renderAt(<PayQr info={payInfo()} variant="receive" shareText="Hi Chi!" />);
    await screen.findByRole('img', { name: /VietQR code/ });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('QR saved and message copied.')).toBeInTheDocument();
  });

  it('says so when Share did not work', async () => {
    vi.mocked(shareQr).mockResolvedValueOnce('failed');
    renderAt(<PayQr info={payInfo()} variant="receive" shareText="Hi Chi!" />);
    await screen.findByRole('img', { name: /VietQR code/ });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(await screen.findByText("Couldn't share. Try Save QR.")).toBeInTheDocument();
  });
});
