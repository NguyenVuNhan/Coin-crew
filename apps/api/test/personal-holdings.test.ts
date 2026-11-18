import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  AssetView,
  EntriesResponse,
  HoldingsResponse,
  ListResponse,
  PersonalSummary,
  WalletDetailResponse,
  WalletDetailsResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getHoldings = (sid: string | null, query = '') =>
  call(`/api/me/personal/holdings${query}`, sid ? as(sid) : {});

const getList = (sid: string | null, query = '') =>
  call(`/api/me/personal/transactions${query}`, sid ? as(sid) : {});

const getSummary = (sid: string | null, query = '') =>
  call(`/api/me/personal/summary${query}`, sid ? as(sid) : {});

const getWallets = (sid: string) => call('/api/me/personal/wallets', as(sid));

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createAsset = (sid: string, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const patchWallet = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/wallets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal holdings, asset filter, and VND totals', () => {
  it('returns 403 when personal switch is off', async () => {
    const sid = await memberSid('u-hold-off', 'HoldOff');
    const res = await getHoldings(sid);
    expect(res.status).toBe(403);
  });

  it('returns quantity, cost, and costVnd after buy, buy, and partial sell', async () => {
    const sid = await memberSid('u-hold-1', 'Hold1');
    await switchOn('u-hold-1');

    const everyday = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Cash',
          kind: 'everyday',
          currency: 'VND',
          startAmount: 0,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Crypto VND',
          kind: 'investment',
          currency: 'VND',
          startAmount: 3_000_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const btc = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, {
          name: 'Bitcoin',
          unit: 'BTC',
          groupName: 'Crypto',
          decimals: 8,
        }),
      )
    ).asset;

    // Buy 1 BTC for 1.000.000.000
    await createEntry(sid, {
      type: 'buy',
      walletId: wallet.id,
      assetId: btc.id,
      quantity: 100_000_000,
      amount: 1_000_000_000,
      date: '2026-11-02',
    });
    // Buy 1 BTC for 1.400.000.000
    await createEntry(sid, {
      type: 'buy',
      walletId: wallet.id,
      assetId: btc.id,
      quantity: 100_000_000,
      amount: 1_400_000_000,
      date: '2026-11-03',
    });
    // Sell 0.5 BTC for 800.000.000
    await createEntry(sid, {
      type: 'sell',
      walletId: wallet.id,
      assetId: btc.id,
      quantity: 50_000_000,
      amount: 800_000_000,
      date: '2026-11-04',
    });

    const res = await getHoldings(sid);
    expect(res.status).toBe(200);
    const body = await json<HoldingsResponse>(res);
    expect(body.holdings).toEqual([
      {
        walletId: wallet.id,
        assetId: btc.id,
        quantity: 150_000_000,
        cost: 1_800_000_000,
        costVnd: 1_800_000_000,
      },
    ]);

    // Everyday wallet by walletId returns empty holdings
    const everydayRes = await getHoldings(sid, `?walletId=${encodeURIComponent(everyday.id)}`);
    expect(everydayRes.status).toBe(200);
    expect(await json<HoldingsResponse>(everydayRes)).toEqual({ holdings: [] });

    // Foreign or unknown walletId -> 404
    const sidOther = await memberSid('u-hold-other', 'HoldOther');
    await switchOn('u-hold-other');
    const otherWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sidOther, {
          name: 'Other',
          kind: 'investment',
          currency: 'VND',
          startAmount: 0,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    expect((await getHoldings(sid, `?walletId=${encodeURIComponent(otherWallet.id)}`)).status).toBe(
      404,
    );
    expect((await getHoldings(sid, '?walletId=missing-wallet')).status).toBe(404);

    // Archived investment wallet: excluded by default, included when asked by walletId
    expect((await patchWallet(wallet.id, sid, { archived: true })).status).toBe(200);
    expect(await json<HoldingsResponse>(await getHoldings(sid))).toEqual({ holdings: [] });
    const archivedById = await getHoldings(sid, `?walletId=${encodeURIComponent(wallet.id)}`);
    expect(archivedById.status).toBe(200);
    expect((await json<HoldingsResponse>(archivedById)).holdings).toHaveLength(1);
  });

  it('computes costVnd and summary totalVnd for a transfer-funded USDT wallet', async () => {
    const sid = await memberSid('u-hold-usdt', 'HoldUsdt');
    await switchOn('u-hold-usdt');

    const vndWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'VND Cash',
          kind: 'everyday',
          currency: 'VND',
          startAmount: 25_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const usdtWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'USDT Invest',
          kind: 'investment',
          currency: 'USDT',
          startAmount: 0,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const btc = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, {
          name: 'Bitcoin',
          unit: 'BTC',
          groupName: 'Crypto',
          decimals: 8,
        }),
      )
    ).asset;

    // 25.000.000 VND -> 1.000 USDT (100_000 minor units)
    const trRes = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: vndWallet.id,
      toWalletId: usdtWallet.id,
      amountSent: 25_000_000,
      amountReceived: 100_000,
      date: '2026-11-02',
    });
    expect(trRes.status).toBe(201);

    // Buy 1 BTC using 400 USDT (40_000 minor units)
    const buyRes = await createEntry(sid, {
      type: 'buy',
      walletId: usdtWallet.id,
      assetId: btc.id,
      quantity: 100_000_000,
      amount: 40_000,
      date: '2026-11-03',
    });
    expect(buyRes.status).toBe(201);

    const holdingsRes = await getHoldings(sid);
    expect(holdingsRes.status).toBe(200);
    const holdingsBody = await json<HoldingsResponse>(holdingsRes);
    expect(holdingsBody.holdings).toEqual([
      {
        walletId: usdtWallet.id,
        assetId: btc.id,
        quantity: 100_000_000,
        cost: 40_000,
        costVnd: 10_000_000,
      },
    ]);

    const walletsBody = await json<WalletDetailsResponse>(await getWallets(sid));
    const usdtView = walletsBody.wallets.find((w) => w.id === usdtWallet.id)!;
    expect(usdtView.vndValue).toBe(25_000_000);

    const summaryBody = await json<PersonalSummary>(await getSummary(sid, '?month=2026-11'));
    expect(summaryBody.totalVnd).toBe(25_000_000);
  });

  it('filters transactions by assetId and type=trade, and excludes trades from totals', async () => {
    const sid = await memberSid('u-hold-list', 'HoldList');
    await switchOn('u-hold-list');

    const everyday = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Main',
          kind: 'everyday',
          currency: 'VND',
          startAmount: 1_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const invest = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Invest',
          kind: 'investment',
          currency: 'VND',
          startAmount: 5_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const cats = (await json<{ categories: { id: string; type: string }[] }>(await getCategories(sid)))
      .categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const btc = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'Bitcoin', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    const eth = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'Ethereum', unit: 'ETH', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;

    const expEntry = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: everyday.id,
          amount: 120_000,
          categoryId: food.id,
          date: '2026-11-05',
          note: 'Lunch',
        }),
      )
    ).entries[0]!;

    const buyBtc = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'buy',
          walletId: invest.id,
          assetId: btc.id,
          quantity: 10_000_000,
          amount: 1_000_000,
          date: '2026-11-06',
        }),
      )
    ).entries[0]!;

    const sellBtc = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'sell',
          walletId: invest.id,
          assetId: btc.id,
          quantity: 5_000_000,
          amount: 600_000,
          date: '2026-11-07',
        }),
      )
    ).entries[0]!;

    const buyEth = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'buy',
          walletId: invest.id,
          assetId: eth.id,
          quantity: 20_000_000,
          amount: 500_000,
          date: '2026-11-08',
        }),
      )
    ).entries[0]!;

    // assetId filter returns only that asset's rows
    const btcList = await json<ListResponse>(
      await getList(sid, `?month=2026-11&assetId=${encodeURIComponent(btc.id)}`),
    );
    expect(btcList.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      sellBtc.id,
      buyBtc.id,
    ]);
    expect(btcList.totals).toEqual([]);

    // Foreign or unknown assetId -> 404
    const sidOther = await memberSid('u-hold-list-other', 'HoldListOther');
    await switchOn('u-hold-list-other');
    const foreignAsset = (
      await json<{ asset: AssetView }>(
        await createAsset(sidOther, { name: 'Gold', unit: 'g', groupName: 'Metal', decimals: 2 }),
      )
    ).asset;
    expect(
      (await getList(sid, `?month=2026-11&assetId=${encodeURIComponent(foreignAsset.id)}`)).status,
    ).toBe(404);
    expect((await getList(sid, '?month=2026-11&assetId=missing-asset')).status).toBe(404);

    // type=trade returns buys and sells only
    const tradeList = await json<ListResponse>(await getList(sid, '?month=2026-11&type=trade'));
    expect(tradeList.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      buyEth.id,
      sellBtc.id,
      buyBtc.id,
    ]);
    expect(tradeList.totals).toEqual([]);

    // Month with buy, sell, and expense: totals count only the expense
    const allList = await json<ListResponse>(await getList(sid, '?month=2026-11'));
    expect(allList.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      buyEth.id,
      sellBtc.id,
      buyBtc.id,
      expEntry.id,
    ]);
    expect(allList.totals).toEqual([{ currency: 'VND', spent: 120_000, income: 0 }]);

    const summary = await json<PersonalSummary>(await getSummary(sid, '?month=2026-11'));
    expect(summary.spent).toEqual([{ currency: 'VND', amount: 120_000 }]);
    expect(summary.income).toEqual([]);
  });
});
