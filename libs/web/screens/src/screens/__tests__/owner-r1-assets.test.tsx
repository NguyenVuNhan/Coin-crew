import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { AssetView, EntryView, HoldingView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { AssetForm } from '../../components/AssetForm';
import { TransactionRow } from '../../components/TransactionRow';
import { AssetsScreen } from '../AssetsScreen';
import { TransactionDetailContent } from '../TransactionDetail';
import { WalletScreen } from '../WalletScreen';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOn = {
  user: { id: 'u-1', email: 'owner@example.com', name: 'Owner', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const btcAsset: AssetView = {
  id: 'a-btc',
  name: 'BTC',
  unit: '',
  groupName: 'Crypto',
  decimals: 4,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

const goldAsset: AssetView = {
  id: 'a-gold',
  name: 'Vàng SJC',
  unit: 'chỉ',
  groupName: 'Vàng',
  decimals: 2,
  hidden: false,
  sortOrder: 1,
  entryCount: 1,
};

const investWallet: WalletDetailView = {
  id: 'w-inv',
  name: 'Binance',
  kind: 'investment',
  currency: 'USDT',
  balance: 100_000,
  startAmount: 10_000_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 250_000_000,
  icon: 'bg-avatar-1',
  sortOrder: 0,
  archived: false,
  isDefault: false,
  entryCount: 2,
};

const everydayWallet: WalletDetailView = {
  id: 'w-day',
  name: 'Tiền mặt',
  kind: 'everyday',
  currency: 'VND',
  balance: 1_000_000,
  startAmount: 1_000_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: 'bg-avatar-2',
  sortOrder: 1,
  archived: false,
  isDefault: true,
  entryCount: 0,
};

describe('owner review round 1: assets and holdings', () => {
  it('AssetForm parses a number step and a word, shows step error, and blocks step change when in use', async () => {
    const { calls } = mockApi({
      'POST /api/me/personal/assets': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          name: string;
          unit: string;
          groupName: string;
          decimals: number;
        };
        return Response.json(
          {
            asset: {
              id: 'a-new',
              ...body,
              hidden: false,
              sortOrder: 0,
              entryCount: 0,
            },
          },
          { status: 201 },
        );
      },
      'PATCH /api/me/personal/assets/a-gold': (init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Partial<AssetView>;
        return Response.json({ asset: { ...goldAsset, ...body } });
      },
    });

    const onSaved = vi.fn();
    const { unmount } = renderAt(<AssetForm groups={[]} onSaved={onSaved} onCancel={() => {}} />);
    act(() => setLang('vi'));

    // No decimals stepper
    expect(screen.queryByTestId('asset-decimals-minus')).toBeNull();
    expect(screen.queryByTestId('asset-decimals-plus')).toBeNull();

    fireEvent.change(screen.getByTestId('asset-name-input'), { target: { value: 'BTC' } });
    // Invalid step
    fireEvent.change(screen.getByTestId('asset-unit-input'), { target: { value: '0.0005' } });
    expect(screen.getByText('Nhập bước nhỏ nhất như 1, 0.1, 0.01…')).toBeTruthy();
    expect((screen.getByTestId('asset-save-btn') as HTMLButtonElement).disabled).toBe(true);

    // Valid number step
    fireEvent.change(screen.getByTestId('asset-unit-input'), { target: { value: '0.0001' } });
    expect(screen.queryByText('Nhập bước nhỏ nhất như 1, 0.1, 0.01…')).toBeNull();
    fireEvent.click(screen.getByTestId('asset-save-btn'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const postCall = calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/assets');
    expect(postCall?.body).toMatchObject({
      name: 'BTC',
      unit: '',
      decimals: 4,
    });

    unmount();

    // Used asset: cannot change step, can change word keeping decimals=2
    const onSavedEdit = vi.fn();
    renderAt(<AssetForm asset={goldAsset} groups={[]} onSaved={onSavedEdit} onCancel={() => {}} />);
    act(() => setLang('vi'));
    const unitInput = screen.getByTestId('asset-unit-input') as HTMLInputElement;
    expect(unitInput.value).toBe('chỉ');

    fireEvent.change(unitInput, { target: { value: '0.0001' } });
    expect(screen.getByText('Đã có giao dịch, không đổi được bước nhỏ nhất')).toBeTruthy();
    expect((screen.getByTestId('asset-save-btn') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(unitInput, { target: { value: 'lượng' } });
    expect(screen.queryByText('Đã có giao dịch, không đổi được bước nhỏ nhất')).toBeNull();
    expect((screen.getByTestId('asset-save-btn') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('asset-save-btn'));
    await waitFor(() => expect(onSavedEdit).toHaveBeenCalledTimes(1));
  });

  it('displays 0,0481 BTC and 2,5 chỉ across TransactionRow and TransactionDetail', () => {
    const buyBtc: EntryView = {
      id: 'e-btc',
      walletId: 'w-inv',
      type: 'buy',
      amount: -5_208_333,
      currency: 'USDT',
      categoryId: null,
      assetId: 'a-btc',
      quantity: 481,
      date: '2026-11-18',
      time: null,
      note: null,
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      transferId: null,
      counterpartWalletId: null,
      createdAt: '2026-11-18T00:00:00.000Z',
    };
    const buyGold: EntryView = {
      ...buyBtc,
      id: 'e-gold',
      assetId: 'a-gold',
      quantity: 250,
    };

    const { unmount } = renderAt(
      <div>
        <TransactionRow
          row={{ kind: 'entry', entry: buyBtc }}
          wallets={[investWallet]}
          assets={[btcAsset, goldAsset]}
        />
        <TransactionRow
          row={{ kind: 'entry', entry: buyGold }}
          wallets={[investWallet]}
          assets={[btcAsset, goldAsset]}
        />
      </div>,
    );
    act(() => setLang('vi'));
    expect(screen.getByText(/0,0481 BTC/)).toBeTruthy();
    expect(screen.getByText(/2,5 chỉ/)).toBeTruthy();
    unmount();

    renderAt(
      <TransactionDetailContent
        entry={buyBtc}
        wallets={[investWallet]}
        categories={[]}
        assets={[btcAsset]}
        onDone={() => {}}
      />,
    );
    act(() => setLang('vi'));
    expect(screen.getByTestId('tx-detail-quantity').textContent).toBe('0,0481 BTC');
    expect(screen.getByText('Giá mỗi BTC')).toBeTruthy();
  });

  it('AssetsScreen shows visible edit and hide/show icon buttons with accessible labels', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/assets': { assets: [btcAsset, { ...goldAsset, hidden: true }] },
      'PATCH /api/me/personal/assets/a-btc': { asset: { ...btcAsset, hidden: true } },
    });

    renderAt(<AssetsScreen />, { route: '/personal/assets' });
    act(() => setLang('vi'));
    await waitFor(() => expect(screen.getByTestId('asset-row-a-btc')).toBeTruthy());

    const editBtn = screen.getByRole('button', { name: 'Sửa BTC' });
    const hideBtn = screen.getByRole('button', { name: 'Ẩn BTC' });
    expect(editBtn.className).toContain('min-h-11');
    expect(hideBtn.className).toContain('min-h-11');

    fireEvent.click(editBtn);
    await waitFor(() => expect(screen.getByTestId('asset-form')).toBeTruthy());
    expect((screen.getByTestId('asset-unit-input') as HTMLInputElement).value).toBe('0.0001');
  });

  it('WalletScreen shows holdings pie with average price for investment wallet and no pie for everyday wallet', async () => {
    const holdings: HoldingView[] = [
      { walletId: 'w-inv', assetId: 'a-btc', quantity: 10000, cost: 5_208_333, costVnd: 130_000_000 },
      { walletId: 'w-inv', assetId: 'a-gold', quantity: 250, cost: 0, costVnd: 0 },
    ];

    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [investWallet, everydayWallet] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [btcAsset, goldAsset] },
      'GET /api/me/personal/holdings': { holdings },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    const { unmount } = renderAt(<WalletScreen />, {
      route: '/wallets/w-inv',
      path: '/wallets/:id',
    });
    act(() => setLang('vi'));

    await waitFor(() => expect(screen.getByTestId('wallet-holdings-pie')).toBeTruthy());
    expect(screen.getByText('TB 52.083,33 USDT/BTC')).toBeTruthy();
    // Zero-cost holding stays in the list, left out of pie
    expect(screen.getByTestId('wallet-holding-a-gold')).toBeTruthy();
    expect(screen.getByTestId('wallet-holding-a-gold').textContent).toContain('2,5 chỉ');
    expect(screen.getByTestId('wallet-holdings-pie').textContent).not.toContain('Vàng SJC');
    unmount();

    renderAt(<WalletScreen />, {
      route: '/wallets/w-day',
      path: '/wallets/:id',
    });
    act(() => setLang('vi'));
    await waitFor(() => expect(screen.getByTestId('wallet-summary')).toBeTruthy());
    expect(screen.queryByTestId('wallet-holdings-pie')).toBeNull();
  });
});
