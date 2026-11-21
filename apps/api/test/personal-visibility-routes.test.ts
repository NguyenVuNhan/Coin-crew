import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { AssetView, WalletDetailResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

async function getSyncVersion(userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
    .bind(userId)
    .first<{ version: number }>();
  return row?.version ?? 0;
}

async function getCategoryVisibilityRows(userId: string) {
  const res = await env.DB.prepare(
    'SELECT wallet_id, category_id, visible FROM personal_category_visibility WHERE user_id = ? ORDER BY wallet_id, category_id',
  )
    .bind(userId)
    .all<{ wallet_id: string; category_id: string; visible: number }>();
  return res.results;
}

async function getAssetVisibilityRows(userId: string) {
  const res = await env.DB.prepare(
    'SELECT wallet_id, asset_id, visible FROM personal_asset_visibility WHERE user_id = ? ORDER BY wallet_id, asset_id',
  )
    .bind(userId)
    .all<{ wallet_id: string; asset_id: string; visible: number }>();
  return res.results;
}

async function createUserFixture(userId: string, name: string) {
  const sid = await memberSid(userId, name);
  await switchOn(userId, 1);

  const w1Res = await postJson('/api/me/personal/wallets', sid, {
    name: `${name} W1`,
    currency: 'VND',
    startAmount: 1_000_000,
    startDate: '2026-11-01',
  });
  expect(w1Res.status).toBe(201);
  const w1 = (await json<WalletDetailResponse>(w1Res)).wallet;

  const w2Res = await addWallet(sid, {
    name: `${name} W2`,
    currency: 'USDT',
    kind: 'investment',
    startAmount: 0,
    startDate: '2026-11-01',
  });
  expect(w2Res.status).toBe(201);
  const w2 = (await json<WalletDetailResponse>(w2Res)).wallet;

  // Trigger lazy starter category seeding
  const catsRes = await call('/api/me/personal/categories', as(sid));
  expect(catsRes.status).toBe(200);

  const assetRes = await postJson('/api/me/personal/assets', sid, {
    name: `${name} BTC`,
    unit: 'BTC',
    groupName: 'Crypto',
    decimals: 8,
  });
  expect(assetRes.status).toBe(201);
  const asset = (await json<{ asset: AssetView }>(assetRes)).asset;

  return { sid, w1, w2, asset };
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_category_visibility').run();
  await env.DB.prepare('DELETE FROM personal_asset_visibility').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal visibility write routes', () => {
  it('PUT /wallets/:id/visibility upserts category and asset overrides and bumps sync version', async () => {
    const uid = 'u-vis-wallet';
    const { sid, w1, asset } = await createUserFixture(uid, 'WalletVis');
    const foodId = `${uid}:food`;
    const investId = `${uid}:invest`;

    const v0 = await getSyncVersion(uid);

    const res1 = await postJson(
      `/api/me/personal/wallets/${w1.id}/visibility`,
      sid,
      {
        categories: [
          { id: foodId, visible: false },
          { id: investId, visible: true },
        ],
        assets: [{ id: asset.id, visible: false }],
      },
      'PUT',
    );
    expect(res1.status).toBe(200);
    expect(await json<{ ok: boolean }>(res1)).toEqual({ ok: true });

    const v1 = await getSyncVersion(uid);
    expect(v1).toBeGreaterThan(v0);

    const catRows = await getCategoryVisibilityRows(uid);
    expect(catRows).toEqual([
      { wallet_id: w1.id, category_id: foodId, visible: 0 },
      { wallet_id: w1.id, category_id: investId, visible: 1 },
    ]);

    const assetRows = await getAssetVisibilityRows(uid);
    expect(assetRows).toEqual([{ wallet_id: w1.id, asset_id: asset.id, visible: 0 }]);

    // Updating an existing override overwrites in place (onConflictDoUpdate)
    const res2 = await postJson(
      `/api/me/personal/wallets/${w1.id}/visibility`,
      sid,
      {
        categories: [{ id: foodId, visible: true }],
        assets: [{ id: asset.id, visible: true }],
      },
      'PUT',
    );
    expect(res2.status).toBe(200);
    expect(await getSyncVersion(uid)).toBeGreaterThan(v1);

    expect(await getCategoryVisibilityRows(uid)).toEqual([
      { wallet_id: w1.id, category_id: foodId, visible: 1 },
      { wallet_id: w1.id, category_id: investId, visible: 1 },
    ]);
    expect(await getAssetVisibilityRows(uid)).toEqual([
      { wallet_id: w1.id, asset_id: asset.id, visible: 1 },
    ]);
  });

  it('PUT /categories/:id/wallets writes overrides for the category and its direct children across active wallets and bumps sync version', async () => {
    const uid = 'u-vis-cat';
    const { sid, w1, w2 } = await createUserFixture(uid, 'CatVis');
    const feesId = `${uid}:fees`;
    const taxId = `${uid}:tax`;
    const feeId = `${uid}:fee`;

    const v0 = await getSyncVersion(uid);

    const res = await postJson(
      `/api/me/personal/categories/${feesId}/wallets`,
      sid,
      { walletIds: [w1.id] },
      'PUT',
    );
    expect(res.status).toBe(200);
    expect(await json<{ ok: boolean }>(res)).toEqual({ ok: true });
    expect(await getSyncVersion(uid)).toBeGreaterThan(v0);

    const rows = await getCategoryVisibilityRows(uid);
    const byKey = new Map(rows.map((r) => [`${r.wallet_id}|${r.category_id}`, r.visible]));
    expect(rows).toHaveLength(6);
    expect(byKey.get(`${w1.id}|${feesId}`)).toBe(1);
    expect(byKey.get(`${w1.id}|${taxId}`)).toBe(1);
    expect(byKey.get(`${w1.id}|${feeId}`)).toBe(1);
    expect(byKey.get(`${w2.id}|${feesId}`)).toBe(0);
    expect(byKey.get(`${w2.id}|${taxId}`)).toBe(0);
    expect(byKey.get(`${w2.id}|${feeId}`)).toBe(0);
  });

  it('PUT /assets/:id/wallets writes overrides across active wallets and bumps sync version', async () => {
    const uid = 'u-vis-asset';
    const { sid, w1, w2, asset } = await createUserFixture(uid, 'AssetVis');

    const v0 = await getSyncVersion(uid);

    const res = await postJson(
      `/api/me/personal/assets/${asset.id}/wallets`,
      sid,
      { walletIds: [w2.id] },
      'PUT',
    );
    expect(res.status).toBe(200);
    expect(await json<{ ok: boolean }>(res)).toEqual({ ok: true });
    expect(await getSyncVersion(uid)).toBeGreaterThan(v0);

    const rows = await getAssetVisibilityRows(uid);
    const byWallet = new Map(rows.map((r) => [r.wallet_id, r.visible]));
    expect(rows).toHaveLength(2);
    expect(byWallet.get(w1.id)).toBe(0);
    expect(byWallet.get(w2.id)).toBe(1);
  });

  it('leaves archived wallets untouched and returns 404 if an archived wallet is named in walletIds', async () => {
    const uid = 'u-vis-arch';
    const { sid, w1, asset } = await createUserFixture(uid, 'ArchVis');

    const w3Res = await addWallet(sid, {
      name: 'Archived W3',
      currency: 'VND',
      startAmount: 0,
      startDate: '2026-11-01',
    });
    expect(w3Res.status).toBe(201);
    const w3 = (await json<WalletDetailResponse>(w3Res)).wallet;

    const archRes = await postJson(
      `/api/me/personal/wallets/${w3.id}`,
      sid,
      { archived: true },
      'PATCH',
    );
    expect(archRes.status).toBe(200);

    const feesId = `${uid}:fees`;

    // PUT categories/:id/wallets without w3 writes no rows for w3
    const catOk = await postJson(
      `/api/me/personal/categories/${feesId}/wallets`,
      sid,
      { walletIds: [w1.id] },
      'PUT',
    );
    expect(catOk.status).toBe(200);
    const catRows = await getCategoryVisibilityRows(uid);
    expect(catRows.some((r) => r.wallet_id === w3.id)).toBe(false);

    // PUT assets/:id/wallets without w3 writes no rows for w3
    const assetOk = await postJson(
      `/api/me/personal/assets/${asset.id}/wallets`,
      sid,
      { walletIds: [w1.id] },
      'PUT',
    );
    expect(assetOk.status).toBe(200);
    const assetRows = await getAssetVisibilityRows(uid);
    expect(assetRows.some((r) => r.wallet_id === w3.id)).toBe(false);

    // Naming archived w3 in walletIds returns 404 on both routes
    const catArch = await postJson(
      `/api/me/personal/categories/${feesId}/wallets`,
      sid,
      { walletIds: [w1.id, w3.id] },
      'PUT',
    );
    expect(catArch.status).toBe(404);

    const assetArch = await postJson(
      `/api/me/personal/assets/${asset.id}/wallets`,
      sid,
      { walletIds: [w3.id] },
      'PUT',
    );
    expect(assetArch.status).toBe(404);
  });

  it("returns 404 when referencing another user's wallet, category, or asset id", async () => {
    const uidA = 'u-vis-a';
    const uidB = 'u-vis-b';
    const a = await createUserFixture(uidA, 'UserA');
    const b = await createUserFixture(uidB, 'UserB');

    const aFood = `${uidA}:food`;
    const bFood = `${uidB}:food`;

    // A using B's wallet id in path
    expect(
      (
        await postJson(
          `/api/me/personal/wallets/${b.w1.id}/visibility`,
          a.sid,
          { categories: [{ id: aFood, visible: false }] },
          'PUT',
        )
      ).status,
    ).toBe(404);

    // A using B's category id in body
    expect(
      (
        await postJson(
          `/api/me/personal/wallets/${a.w1.id}/visibility`,
          a.sid,
          { categories: [{ id: bFood, visible: false }] },
          'PUT',
        )
      ).status,
    ).toBe(404);

    // A using B's asset id in body
    expect(
      (
        await postJson(
          `/api/me/personal/wallets/${a.w1.id}/visibility`,
          a.sid,
          { assets: [{ id: b.asset.id, visible: false }] },
          'PUT',
        )
      ).status,
    ).toBe(404);

    // A using B's category id in path
    expect(
      (
        await postJson(
          `/api/me/personal/categories/${bFood}/wallets`,
          a.sid,
          { walletIds: [a.w1.id] },
          'PUT',
        )
      ).status,
    ).toBe(404);

    // A using B's wallet id in category walletIds
    expect(
      (
        await postJson(
          `/api/me/personal/categories/${aFood}/wallets`,
          a.sid,
          { walletIds: [b.w1.id] },
          'PUT',
        )
      ).status,
    ).toBe(404);

    // A using B's asset id in path
    expect(
      (
        await postJson(
          `/api/me/personal/assets/${b.asset.id}/wallets`,
          a.sid,
          { walletIds: [a.w1.id] },
          'PUT',
        )
      ).status,
    ).toBe(404);

    // A using B's wallet id in asset walletIds
    expect(
      (
        await postJson(
          `/api/me/personal/assets/${a.asset.id}/wallets`,
          a.sid,
          { walletIds: [b.w1.id] },
          'PUT',
        )
      ).status,
    ).toBe(404);

    // B's visibility tables remain untouched
    expect(await getCategoryVisibilityRows(uidB)).toEqual([]);
    expect(await getAssetVisibilityRows(uidB)).toEqual([]);
  });

  it('returns 400 for malformed bodies', async () => {
    const uid = 'u-vis-bad';
    const { sid, w1, asset } = await createUserFixture(uid, 'BadBody');
    const foodId = `${uid}:food`;

    // Invalid JSON
    const badJson = await call(`/api/me/personal/wallets/${w1.id}/visibility`, {
      method: 'PUT',
      headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(badJson.status).toBe(400);

    // Non-boolean visible
    expect(
      (
        await postJson(
          `/api/me/personal/wallets/${w1.id}/visibility`,
          sid,
          { categories: [{ id: foodId, visible: 'yes' }] },
          'PUT',
        )
      ).status,
    ).toBe(400);

    // Non-array walletIds on category route
    expect(
      (
        await postJson(
          `/api/me/personal/categories/${foodId}/wallets`,
          sid,
          { walletIds: w1.id },
          'PUT',
        )
      ).status,
    ).toBe(400);

    // Missing walletIds on asset route
    expect(
      (await postJson(`/api/me/personal/assets/${asset.id}/wallets`, sid, {}, 'PUT')).status,
    ).toBe(400);
  });

  it('enforces 401 when signed out and 403 when personal money is switched off', async () => {
    const uidA = 'u-vis-guard-a';
    const a = await createUserFixture(uidA, 'GuardA');
    const foodId = `${uidA}:food`;

    const sidOff = await memberSid('u-vis-guard-off', 'GuardOff');
    await switchOn('u-vis-guard-off', 0);

    const cases = [
      {
        label: 'PUT /wallets/:id/visibility',
        path: `/api/me/personal/wallets/${a.w1.id}/visibility`,
        body: { categories: [{ id: foodId, visible: false }] },
      },
      {
        label: 'PUT /categories/:id/wallets',
        path: `/api/me/personal/categories/${foodId}/wallets`,
        body: { walletIds: [a.w1.id] },
      },
      {
        label: 'PUT /assets/:id/wallets',
        path: `/api/me/personal/assets/${a.asset.id}/wallets`,
        body: { walletIds: [a.w1.id] },
      },
    ];

    for (const tc of cases) {
      const resAnon = await postJson(tc.path, null, tc.body, 'PUT');
      expect(resAnon.status, `anon ${tc.label}`).toBe(401);

      const resOff = await postJson(tc.path, sidOff, tc.body, 'PUT');
      expect(resOff.status, `switch-off ${tc.label}`).toBe(403);
    }
  });
});
