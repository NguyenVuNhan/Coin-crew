import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  AssetsResponse,
  AssetView,
  CategoriesResponse,
  EntriesResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const createFirstWallet = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/wallets', sid, body);

const getCategories = (sid: string | null) =>
  call('/api/me/personal/categories', sid ? as(sid) : {});

const createEntry = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const patchEntry = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/transactions/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteEntry = (id: string, sid: string | null) =>
  call(`/api/me/personal/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });

const restoreEntries = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/transactions/restore', sid, body);

const balanceCheck = (walletId: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/wallets/${encodeURIComponent(walletId)}/balance-check`, sid, body);

const createAsset = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);

const getAssets = (sid: string | null) =>
  call('/api/me/personal/assets', sid ? as(sid) : {});

const deleteAsset = (id: string, sid: string | null, moveTo?: string) => {
  const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
  return call(`/api/me/personal/assets/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });
};

interface WalletBalanceRow {
  wallet_id: string;
  user_id: string;
  personal_net: number;
  entry_count: number;
  needs_replay: number;
}

interface AssetCountRow {
  asset_id: string;
  user_id: string;
  entry_count: number;
}

async function getWalletBalanceRow(walletId: string): Promise<WalletBalanceRow | null> {
  return env.DB.prepare(
    'SELECT wallet_id, user_id, personal_net, entry_count, needs_replay FROM personal_wallet_balances WHERE wallet_id = ?',
  )
    .bind(walletId)
    .first<WalletBalanceRow>();
}

async function getAssetCountRow(assetId: string): Promise<AssetCountRow | null> {
  return env.DB.prepare(
    'SELECT asset_id, user_id, entry_count FROM personal_asset_counts WHERE asset_id = ?',
  )
    .bind(assetId)
    .first<AssetCountRow>();
}

async function sumTransactionsForWallet(
  walletId: string,
): Promise<{ personal_net: number; entry_count: number }> {
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN type IN ('income', 'transfer_in', 'sell') THEN amount ELSE -amount END), 0) AS personal_net,
       COUNT(*) AS entry_count
     FROM personal_transactions
     WHERE wallet_id = ?`,
  )
    .bind(walletId)
    .first<{ personal_net: number; entry_count: number }>();
  return {
    personal_net: Number(row?.personal_net ?? 0),
    entry_count: Number(row?.entry_count ?? 0),
  };
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_balance_checks').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_asset_counts').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_balances').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal wallet balance & asset count cache writes', () => {
  it('initializes personal_wallet_balances (0, 0, needs_replay=0) for VND everyday, USD everyday, and VND investment wallets', async () => {
    const sid = await memberSid('u-cache-init', 'CacheInit');
    await switchOn('u-cache-init', 1);

    const wVnd = (
      await json<WalletDetailResponse>(
        await createFirstWallet(sid, {
          name: 'VND Everyday',
          currency: 'VND',
          kind: 'everyday',
          startAmount: 1_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const wUsd = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'USD Everyday',
          currency: 'USD',
          kind: 'everyday',
          startAmount: 100_00,
          startDate: '2026-11-01',
          startCostVnd: 2_500_000,
        }),
      )
    ).wallet;

    const wInv = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'VND Investment',
          currency: 'VND',
          kind: 'investment',
          startAmount: 5_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    for (const w of [wVnd, wUsd, wInv]) {
      const row = await getWalletBalanceRow(w.id);
      expect(row).toMatchObject({
        wallet_id: w.id,
        user_id: 'u-cache-init',
        personal_net: 0,
        entry_count: 0,
        needs_replay: 0,
      });
    }
  });

  it('expense & income: create, edit (amount, type flip, wallet move), delete, and restore match personal_transactions sums', async () => {
    const sid = await memberSid('u-cache-exp', 'CacheExp');
    await switchOn('u-cache-exp', 1);

    const wA = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Wallet A', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const wB = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Wallet B', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const expCat = cats.find((c) => c.type === 'expense')!;
    const incCat = cats.find((c) => c.type === 'income')!;

    // Create expense on A
    const createRes = await createEntry(sid, {
      type: 'expense',
      walletId: wA.id,
      amount: 100_000,
      categoryId: expCat.id,
      date: '2026-11-10',
    });
    expect(createRes.status).toBe(201);
    const created = (await json<EntriesResponse>(createRes)).entries[0]!;
    expect(await getWalletBalanceRow(wA.id)).toMatchObject({
      personal_net: -100_000,
      entry_count: 1,
    });

    // Edit amount on A
    const editAmtRes = await patchEntry(created.id, sid, {
      type: 'expense',
      walletId: wA.id,
      amount: 150_000,
      categoryId: expCat.id,
      date: '2026-11-10',
    });
    expect(editAmtRes.status).toBe(200);
    expect(await getWalletBalanceRow(wA.id)).toMatchObject(
      await sumTransactionsForWallet(wA.id),
    );

    // Flip expense -> income on A
    const flipRes = await patchEntry(created.id, sid, {
      type: 'income',
      walletId: wA.id,
      amount: 200_000,
      categoryId: incCat.id,
      date: '2026-11-10',
    });
    expect(flipRes.status).toBe(200);
    expect(await getWalletBalanceRow(wA.id)).toMatchObject({
      personal_net: 200_000,
      entry_count: 1,
    });

    // Move wallet A -> B
    const moveRes = await patchEntry(created.id, sid, {
      type: 'income',
      walletId: wB.id,
      amount: 200_000,
      categoryId: incCat.id,
      date: '2026-11-10',
    });
    expect(moveRes.status).toBe(200);
    expect(await getWalletBalanceRow(wA.id)).toMatchObject({
      personal_net: 0,
      entry_count: 0,
    });
    expect(await getWalletBalanceRow(wB.id)).toMatchObject({
      personal_net: 200_000,
      entry_count: 1,
    });

    // Delete from B
    const delRes = await deleteEntry(created.id, sid);
    expect(delRes.status).toBe(200);
    const deleted = (await json<EntriesResponse>(delRes)).entries[0]!;
    expect(await getWalletBalanceRow(wB.id)).toMatchObject({
      personal_net: 0,
      entry_count: 0,
    });

    // Restore to B
    const restoreRes = await restoreEntries(sid, { entries: [deleted] });
    expect(restoreRes.status).toBe(200);
    expect(await getWalletBalanceRow(wB.id)).toMatchObject({
      personal_net: 200_000,
      entry_count: 1,
    });
  });

  it('cross-currency transfer: create, edit, delete, and restore update balances and set needs_replay=1 on all non-VND/investment wallets', async () => {
    const sid = await memberSid('u-cache-xfer', 'CacheXfer');
    await switchOn('u-cache-xfer', 1);

    const wVnd = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'VND', currency: 'VND', startAmount: 10_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const wUsd = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'USD', currency: 'USD', startAmount: 0, startDate: '2026-11-01' }),
      )
    ).wallet;
    const wOtherUsd = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'USD 2', currency: 'USD', startAmount: 0, startDate: '2026-11-01' }),
      )
    ).wallet;

    // Create VND -> USD transfer
    const createRes = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: wVnd.id,
      toWalletId: wUsd.id,
      amountSent: 2_500_000,
      amountReceived: 100_00,
      date: '2026-11-10',
    });
    expect(createRes.status).toBe(201);
    const [outEntry] = (await json<EntriesResponse>(createRes)).entries;

    expect(await getWalletBalanceRow(wVnd.id)).toMatchObject({
      personal_net: -2_500_000,
      entry_count: 1,
      needs_replay: 0,
    });
    expect(await getWalletBalanceRow(wUsd.id)).toMatchObject({
      personal_net: 100_00,
      entry_count: 1,
      needs_replay: 1,
    });
    expect(await getWalletBalanceRow(wOtherUsd.id)).toMatchObject({
      needs_replay: 1,
    });

    // Reset needs_replay to 0 manually so we can verify edit, delete, and restore each set it to 1
    await env.DB.prepare('UPDATE personal_wallet_balances SET needs_replay = 0 WHERE user_id = ?')
      .bind('u-cache-xfer')
      .run();

    // Edit: flip wallets USD -> VND with new amounts
    const editRes = await patchEntry(outEntry!.id, sid, {
      type: 'transfer',
      fromWalletId: wUsd.id,
      toWalletId: wVnd.id,
      amountSent: 50_00,
      amountReceived: 1_250_000,
      date: '2026-11-10',
    });
    expect(editRes.status).toBe(200);
    expect(await getWalletBalanceRow(wVnd.id)).toMatchObject({
      personal_net: 1_250_000,
      entry_count: 1,
      needs_replay: 0,
    });
    expect(await getWalletBalanceRow(wUsd.id)).toMatchObject({
      personal_net: -50_00,
      entry_count: 1,
      needs_replay: 1,
    });
    expect(await getWalletBalanceRow(wOtherUsd.id)).toMatchObject({
      needs_replay: 1,
    });

    // Reset needs_replay = 0, then delete
    await env.DB.prepare('UPDATE personal_wallet_balances SET needs_replay = 0 WHERE user_id = ?')
      .bind('u-cache-xfer')
      .run();

    const delRes = await deleteEntry(outEntry!.id, sid);
    expect(delRes.status).toBe(200);
    const deletedPair = (await json<EntriesResponse>(delRes)).entries;
    expect(await getWalletBalanceRow(wVnd.id)).toMatchObject({
      personal_net: 0,
      entry_count: 0,
      needs_replay: 0,
    });
    expect(await getWalletBalanceRow(wUsd.id)).toMatchObject({
      personal_net: 0,
      entry_count: 0,
      needs_replay: 1,
    });
    expect(await getWalletBalanceRow(wOtherUsd.id)).toMatchObject({
      needs_replay: 1,
    });

    // Reset needs_replay = 0, then restore
    await env.DB.prepare('UPDATE personal_wallet_balances SET needs_replay = 0 WHERE user_id = ?')
      .bind('u-cache-xfer')
      .run();

    const restoreRes = await restoreEntries(sid, { entries: deletedPair });
    expect(restoreRes.status).toBe(200);
    expect(await getWalletBalanceRow(wVnd.id)).toMatchObject({
      personal_net: 1_250_000,
      entry_count: 1,
      needs_replay: 0,
    });
    expect(await getWalletBalanceRow(wUsd.id)).toMatchObject({
      personal_net: -50_00,
      entry_count: 1,
      needs_replay: 1,
    });
    expect(await getWalletBalanceRow(wOtherUsd.id)).toMatchObject({
      needs_replay: 1,
    });
  });

  it('trades (buy/sell): create, edit (assetId, amount, qty, wallet), delete, restore, and 422 OVERSELL guard', async () => {
    const sid = await memberSid('u-cache-trade', 'CacheTrade');
    await switchOn('u-cache-trade', 1);

    const invA = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Inv A',
          currency: 'VND',
          kind: 'investment',
          startAmount: 100_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    const invB = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Inv B',
          currency: 'VND',
          kind: 'investment',
          startAmount: 50_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const btc = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'BTC', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    const eth = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'ETH', unit: 'ETH', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;

    // Create buy on invA for btc
    const buyRes = await createEntry(sid, {
      type: 'buy',
      walletId: invA.id,
      assetId: btc.id,
      amount: 10_000_000,
      quantity: 100_000_000,
      date: '2026-11-05',
    });
    expect(buyRes.status).toBe(201);
    const buyEntry = (await json<EntriesResponse>(buyRes)).entries[0]!;

    expect(await getWalletBalanceRow(invA.id)).toMatchObject({
      personal_net: -10_000_000,
      entry_count: 1,
      needs_replay: 1,
    });
    expect(await getAssetCountRow(btc.id)).toMatchObject({ entry_count: 1 });

    // Create sell on invA for btc
    const sellRes = await createEntry(sid, {
      type: 'sell',
      walletId: invA.id,
      assetId: btc.id,
      amount: 6_000_000,
      quantity: 50_000_000,
      date: '2026-11-06',
    });
    expect(sellRes.status).toBe(201);
    const sellEntry = (await json<EntriesResponse>(sellRes)).entries[0]!;
    expect(await getWalletBalanceRow(invA.id)).toMatchObject({
      personal_net: -4_000_000,
      entry_count: 2,
      needs_replay: 1,
    });
    expect(await getAssetCountRow(btc.id)).toMatchObject({ entry_count: 2 });

    // 422 OVERSELL on creating excessive sell: cache must remain untouched
    const badSellRes = await createEntry(sid, {
      type: 'sell',
      walletId: invA.id,
      assetId: btc.id,
      amount: 10_000_000,
      quantity: 80_000_000,
      date: '2026-11-07',
    });
    expect(badSellRes.status).toBe(422);
    expect(await getWalletBalanceRow(invA.id)).toMatchObject({
      personal_net: -4_000_000,
      entry_count: 2,
    });
    expect(await getAssetCountRow(btc.id)).toMatchObject({ entry_count: 2 });

    // 422 OVERSELL on deleting the buy while sell exists: cache must remain untouched
    const badDelBuyRes = await deleteEntry(buyEntry.id, sid);
    expect(badDelBuyRes.status).toBe(422);
    expect(await getWalletBalanceRow(invA.id)).toMatchObject({
      personal_net: -4_000_000,
      entry_count: 2,
    });
    expect(await getAssetCountRow(btc.id)).toMatchObject({ entry_count: 2 });

    // Delete the sell -> invA net = -10_000_000, count = 1, btc count = 1
    const delSellRes = await deleteEntry(sellEntry.id, sid);
    expect(delSellRes.status).toBe(200);
    const deletedSell = (await json<EntriesResponse>(delSellRes)).entries[0]!;
    expect(await getWalletBalanceRow(invA.id)).toMatchObject({
      personal_net: -10_000_000,
      entry_count: 1,
      needs_replay: 1,
    });
    expect(await getAssetCountRow(btc.id)).toMatchObject({ entry_count: 1 });

    // Edit buy: change assetId btc -> eth, amount, qty, wallet invA -> invB
    const editBuyRes = await patchEntry(buyEntry.id, sid, {
      type: 'buy',
      walletId: invB.id,
      assetId: eth.id,
      amount: 12_000_000,
      quantity: 200_000_000,
      date: '2026-11-05',
    });
    expect(editBuyRes.status).toBe(200);
    expect(await getWalletBalanceRow(invA.id)).toMatchObject({
      personal_net: 0,
      entry_count: 0,
      needs_replay: 1,
    });
    expect(await getWalletBalanceRow(invB.id)).toMatchObject({
      personal_net: -12_000_000,
      entry_count: 1,
      needs_replay: 1,
    });
    expect(await getAssetCountRow(btc.id)).toMatchObject({ entry_count: 0 });
    expect(await getAssetCountRow(eth.id)).toMatchObject({ entry_count: 1 });

    // Edit buy back to invA + btc so we can restore sell
    const editBackRes = await patchEntry(buyEntry.id, sid, {
      type: 'buy',
      walletId: invA.id,
      assetId: btc.id,
      amount: 10_000_000,
      quantity: 100_000_000,
      date: '2026-11-05',
    });
    expect(editBackRes.status).toBe(200);

    // Restore sell
    const restoreSellRes = await restoreEntries(sid, { entries: [deletedSell] });
    expect(restoreSellRes.status).toBe(200);
    expect(await getWalletBalanceRow(invA.id)).toMatchObject({
      personal_net: -4_000_000,
      entry_count: 2,
      needs_replay: 1,
    });
    expect(await getAssetCountRow(btc.id)).toMatchObject({ entry_count: 2 });
  });

  it('balance-check with diff !== 0 updates personal_wallet_balances', async () => {
    const sid = await memberSid('u-cache-chk', 'CacheChk');
    await switchOn('u-cache-chk', 1);

    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const chkRes = await balanceCheck(w.id, sid, { actual: 1_250_000 });
    expect(chkRes.status).toBe(200);

    expect(await getWalletBalanceRow(w.id)).toMatchObject({
      personal_net: 250_000,
      entry_count: 1,
    });
  });

  it('DELETE /me/personal/assets/:id with reassignment transfers entry_count to targetAssetId and GET returns exact entryCount', async () => {
    const sid = await memberSid('u-cache-ast', 'CacheAst');
    await switchOn('u-cache-ast', 1);

    const inv = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Inv',
          currency: 'VND',
          kind: 'investment',
          startAmount: 100_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const src = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'BTC Old', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    const dst = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'BTC New', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;

    await createEntry(sid, {
      type: 'buy',
      walletId: inv.id,
      assetId: src.id,
      amount: 5_000_000,
      quantity: 50_000_000,
      date: '2026-11-05',
    });
    await createEntry(sid, {
      type: 'buy',
      walletId: inv.id,
      assetId: src.id,
      amount: 3_000_000,
      quantity: 30_000_000,
      date: '2026-11-06',
    });

    const delRes = await deleteAsset(src.id, sid, dst.id);
    expect(delRes.status).toBe(200);

    expect(await getAssetCountRow(dst.id)).toMatchObject({ entry_count: 2 });

    const list = await json<AssetsResponse>(await getAssets(sid));
    expect(list.assets.find((a) => a.id === dst.id)?.entryCount).toBe(2);
  });
});
