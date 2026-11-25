import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  isCategoryVisibleIn,
  type AssetsResponse,
  type AssetView,
  type CategoriesResponse,
  type CategoryView,
  type WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn, seedLegacyStarters } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const createCategory = (sid: string, body: unknown) =>
  postJson('/api/me/personal/categories', sid, body);
const patchCategory = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/categories/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const getAssets = (sid: string) => call('/api/me/personal/assets', as(sid));
const createAsset = (sid: string, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);
const patchAsset = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/assets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const patchWallet = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/wallets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

async function insertCategoryOverride(
  userId: string,
  walletId: string,
  categoryId: string,
  visible: 0 | 1,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO personal_category_visibility (user_id, wallet_id, category_id, visible) VALUES (?, ?, ?, ?)',
  )
    .bind(userId, walletId, categoryId, visible)
    .run();
}

async function insertAssetOverride(
  userId: string,
  walletId: string,
  assetId: string,
  visible: 0 | 1,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO personal_asset_visibility (user_id, wallet_id, asset_id, visible) VALUES (?, ?, ?, ?)',
  )
    .bind(userId, walletId, assetId, visible)
    .run();
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_category_visibility').run();
  await env.DB.prepare('DELETE FROM personal_asset_visibility').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
});

describe('personal visibility read & inheritance', () => {
  it('GET returns starterKey and walletOverrides for categories and assets, and PATCH preserves them', async () => {
    const uid = 'u-vis-read';
    const sid = await memberSid(uid, 'VisRead');
    await switchOn(uid);
    await seedLegacyStarters(uid);

    const w1 = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Bank', startAmount: 1_000_000 }))
    ).wallet;

    // Seed starters
    const seeded = await json<CategoriesResponse>(await getCategories(sid));
    const food = seeded.categories.find((c) => c.id === `${uid}:food`)!;
    expect(food.starterKey).toBe('food');
    expect(food.walletOverrides).toEqual([]);

    // User-created category has starterKey: null
    const customCat = (
      await json<{ category: CategoryView }>(
        await createCategory(sid, { type: 'expense', name: 'Thú cưng', icon: 'paw-print' }),
      )
    ).category;
    expect(customCat.starterKey).toBeNull();
    expect(customCat.walletOverrides).toEqual([]);

    // Create an asset
    const btc = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'Bitcoin', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    expect(btc.walletOverrides).toEqual([]);

    // Insert overrides directly
    await insertCategoryOverride(uid, w1.id, food.id, 0);
    await insertAssetOverride(uid, w1.id, btc.id, 0);

    // GET categories returns overrides and starterKey
    const catsAfter = await json<CategoriesResponse>(await getCategories(sid));
    const foodAfter = catsAfter.categories.find((c) => c.id === food.id)!;
    const customAfter = catsAfter.categories.find((c) => c.id === customCat.id)!;
    expect(foodAfter.starterKey).toBe('food');
    expect(foodAfter.walletOverrides).toEqual([{ walletId: w1.id, visible: false }]);
    expect(customAfter.starterKey).toBeNull();
    expect(customAfter.walletOverrides).toEqual([]);

    // GET assets returns overrides
    const assetsAfter = await json<AssetsResponse>(await getAssets(sid));
    const btcAfter = assetsAfter.assets.find((a) => a.id === btc.id)!;
    expect(btcAfter.walletOverrides).toEqual([{ walletId: w1.id, visible: false }]);

    // PATCH category and asset also fill starterKey / walletOverrides
    const patchedCat = (
      await json<{ category: CategoryView }>(await patchCategory(food.id, sid, { name: 'Ăn uống 2' }))
    ).category;
    expect(patchedCat.starterKey).toBe('food');
    expect(patchedCat.walletOverrides).toEqual([{ walletId: w1.id, visible: false }]);

    const patchedAsset = (
      await json<{ asset: AssetView }>(await patchAsset(btc.id, sid, { name: 'BTC Spot' }))
    ).asset;
    expect(patchedAsset.walletOverrides).toEqual([{ walletId: w1.id, visible: false }]);
  });

  it('POST category under a parent copies parent overrides; new top-level category has []', async () => {
    const uid = 'u-vis-cat-create';
    const sid = await memberSid(uid, 'VisCatCreate');
    await switchOn(uid);
    await seedLegacyStarters(uid);

    const w1 = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Binance', startAmount: 0, kind: 'investment' }))
    ).wallet;

    const seeded = await json<CategoriesResponse>(await getCategories(sid));
    const food = seeded.categories.find((c) => c.id === `${uid}:food`)!;

    await insertCategoryOverride(uid, w1.id, food.id, 0);

    // Sub under food copies {w1: false}
    const subRes = await createCategory(sid, {
      type: 'expense',
      name: 'Cà phê',
      icon: 'coffee',
      parentId: food.id,
    });
    expect(subRes.status).toBe(201);
    const sub = (await json<{ category: CategoryView }>(subRes)).category;
    expect(sub.starterKey).toBeNull();
    expect(sub.walletOverrides).toEqual([{ walletId: w1.id, visible: false }]);

    // New top-level category has []
    const topRes = await createCategory(sid, {
      type: 'expense',
      name: 'Du lịch',
      icon: 'plane',
    });
    expect(topRes.status).toBe(201);
    const top = (await json<{ category: CategoryView }>(topRes)).category;
    expect(top.starterKey).toBeNull();
    expect(top.walletOverrides).toEqual([]);

    // Confirm persisted on GET
    const list = await json<CategoriesResponse>(await getCategories(sid));
    expect(list.categories.find((c) => c.id === sub.id)?.walletOverrides).toEqual([
      { walletId: w1.id, visible: false },
    ]);
    expect(list.categories.find((c) => c.id === top.id)?.walletOverrides).toEqual([]);
  });

  it('POST asset inherits hidden overrides when every existing asset in its group is hidden on a wallet', async () => {
    const uid = 'u-vis-ast-create';
    const sid = await memberSid(uid, 'VisAstCreate');
    await switchOn(uid);
    await seedLegacyStarters(uid);

    const w1 = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Bank', startAmount: 0 }))
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Binance', startAmount: 0, kind: 'investment' }))
    ).wallet;

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
    const gold = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'Vàng SJC', unit: 'chỉ', groupName: 'Vàng', decimals: 2 }),
      )
    ).asset;

    // Both Crypto assets hidden on w1; only BTC hidden on w2; Vàng visible everywhere
    await insertAssetOverride(uid, w1.id, btc.id, 0);
    await insertAssetOverride(uid, w1.id, eth.id, 0);
    await insertAssetOverride(uid, w2.id, btc.id, 0);

    // New Crypto asset inherits {w1: false}, not w2
    const solRes = await createAsset(sid, {
      name: 'Solana',
      unit: 'SOL',
      groupName: 'Crypto',
      decimals: 6,
    });
    expect(solRes.status).toBe(201);
    const sol = (await json<{ asset: AssetView }>(solRes)).asset;
    expect(sol.walletOverrides).toEqual([{ walletId: w1.id, visible: false }]);

    // New ETF asset (empty group) has []
    const etfRes = await createAsset(sid, {
      name: 'E1VFVN30',
      unit: 'CCQ',
      groupName: 'ETF',
      decimals: 2,
    });
    expect(etfRes.status).toBe(201);
    const etf = (await json<{ asset: AssetView }>(etfRes)).asset;
    expect(etf.walletOverrides).toEqual([]);

    // Confirm persisted on GET
    const list = await json<AssetsResponse>(await getAssets(sid));
    expect(list.assets.find((a) => a.id === sol.id)?.walletOverrides).toEqual([
      { walletId: w1.id, visible: false },
    ]);
    expect(list.assets.find((a) => a.id === etf.id)?.walletOverrides).toEqual([]);
    expect(list.assets.find((a) => a.id === gold.id)?.walletOverrides).toEqual([]);
  });

  it('changing wallet kind via PATCH keeps overrides and flips defaults (Review Focus 4)', async () => {
    const uid = 'u-vis-kind';
    const sid = await memberSid(uid, 'VisKind');
    await switchOn(uid);
    await seedLegacyStarters(uid);

    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'My Wallet', startAmount: 1_000_000, kind: 'everyday' }),
      )
    ).wallet;
    expect(w.kind).toBe('everyday');

    const seeded = await json<CategoriesResponse>(await getCategories(sid));
    const food = seeded.categories.find((c) => c.id === `${uid}:food`)!;

    // Explicit override: food visible = true on everyday wallet
    await insertCategoryOverride(uid, w.id, food.id, 1);

    // PATCH wallet to investment
    const patchRes = await patchWallet(w.id, sid, { kind: 'investment' });
    expect(patchRes.status).toBe(200);
    const updatedWallet = (await json<WalletDetailResponse>(patchRes)).wallet;
    expect(updatedWallet.kind).toBe('investment');

    // Fetch categories and evaluate effective visibility on the updated wallet
    const after = await json<CategoriesResponse>(await getCategories(sid));
    const foodAfter = after.categories.find((c) => c.id === `${uid}:food`)!;
    const investAfter = after.categories.find((c) => c.id === `${uid}:invest`)!;
    const feesAfter = after.categories.find((c) => c.id === `${uid}:fees`)!;

    expect(foodAfter.walletOverrides).toEqual([{ walletId: w.id, visible: true }]);
    expect(isCategoryVisibleIn(foodAfter, after.categories, { id: updatedWallet.id, kind: updatedWallet.kind })).toBe(
      true,
    );
    expect(
      isCategoryVisibleIn(investAfter, after.categories, { id: updatedWallet.id, kind: updatedWallet.kind }),
    ).toBe(false);
    expect(isCategoryVisibleIn(feesAfter, after.categories, { id: updatedWallet.id, kind: updatedWallet.kind })).toBe(
      true,
    );
  });

  it("another user's override rows never leak into GET responses", async () => {
    const uidA = 'u-vis-iso-a';
    const uidB = 'u-vis-iso-b';
    const sidA = await memberSid(uidA, 'IsoA');
    const sidB = await memberSid(uidB, 'IsoB');
    await switchOn(uidA);
    await seedLegacyStarters(uidA);
    await switchOn(uidB);
    await seedLegacyStarters(uidB);

    const wA = (
      await json<WalletDetailResponse>(await addWallet(sidA, { name: 'Wallet A', startAmount: 0 }))
    ).wallet;
    const catsA = await json<CategoriesResponse>(await getCategories(sidA));
    const foodA = catsA.categories.find((c) => c.id === `${uidA}:food`)!;
    const assetA = (
      await json<{ asset: AssetView }>(
        await createAsset(sidA, { name: 'BTC A', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;

    await insertCategoryOverride(uidA, wA.id, foodA.id, 0);
    await insertAssetOverride(uidA, wA.id, assetA.id, 0);

    // User B fetches categories and assets
    const catsB = await json<CategoriesResponse>(await getCategories(sidB));
    const assetB = (
      await json<{ asset: AssetView }>(
        await createAsset(sidB, { name: 'BTC B', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    const assetsB = await json<AssetsResponse>(await getAssets(sidB));

    for (const c of catsB.categories) {
      expect(c.walletOverrides).toEqual([]);
    }
    expect(assetsB.assets).toHaveLength(1);
    expect(assetsB.assets[0]!.id).toBe(assetB.id);
    expect(assetsB.assets[0]!.walletOverrides).toEqual([]);
  });
});
