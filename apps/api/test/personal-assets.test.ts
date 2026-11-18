import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { AssetsResponse, AssetView, WalletDetailResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getAssets = (sid: string | null) =>
  call('/api/me/personal/assets', sid ? as(sid) : {});

const createAsset = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);

const patchAsset = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/assets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteAsset = (id: string, sid: string | null, moveTo?: string) => {
  const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
  return call(`/api/me/personal/assets/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });
};

async function createInvestmentWallet(sid: string, userId: string, name = 'Đầu tư'): Promise<string> {
  const wallet = (
    await json<WalletDetailResponse>(await addWallet(sid, { name, startAmount: 10_000_000 }))
  ).wallet;
  await env.DB.prepare(
    "INSERT INTO personal_wallet_settings (wallet_id, user_id, kind, sort_order, updated_at) VALUES (?, ?, 'investment', 0, '2026-11-15T00:00:00.000Z') ON CONFLICT(wallet_id) DO UPDATE SET kind = 'investment'",
  )
    .bind(wallet.id, userId)
    .run();
  return wallet.id;
}

async function seedBuyTx(
  id: string,
  userId: string,
  walletId: string,
  assetId: string,
  quantity = 100_000_000,
  amount = 1_000_000,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, asset_id, quantity, date, created_at, updated_at) VALUES (?, ?, ?, 'buy', ?, ?, ?, '2026-11-15', '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z')",
  )
    .bind(id, userId, walletId, amount, assetId, quantity)
    .run();
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal assets', () => {
  it('create, list (sorted by sortOrder with entryCount), rename, and hide', async () => {
    const sid = await memberSid('u-ast-1', 'AssetUser1');
    await switchOn('u-ast-1');
    const walletId = await createInvestmentWallet(sid, 'u-ast-1');

    const r1 = await createAsset(sid, {
      name: '  Bitcoin ',
      unit: ' BTC ',
      groupName: ' Crypto ',
      decimals: 8,
    });
    expect(r1.status).toBe(201);
    const a1 = (await json<{ asset: AssetView }>(r1)).asset;
    expect(a1).toMatchObject({
      name: 'Bitcoin',
      unit: 'BTC',
      groupName: 'Crypto',
      decimals: 8,
      hidden: false,
      sortOrder: 0,
      entryCount: 0,
    });

    const r2 = await createAsset(sid, {
      name: 'Vàng SJC',
      unit: 'chỉ',
      groupName: 'Vàng',
      decimals: 2,
    });
    expect(r2.status).toBe(201);
    const a2 = (await json<{ asset: AssetView }>(r2)).asset;
    expect(a2.sortOrder).toBe(1);

    await seedBuyTx('tx-ast-1', 'u-ast-1', walletId, a1.id);
    await seedBuyTx('tx-ast-2', 'u-ast-1', walletId, a1.id);

    const list1 = await json<AssetsResponse>(await getAssets(sid));
    expect(list1.assets).toEqual([
      { ...a1, entryCount: 2 },
      { ...a2, entryCount: 0 },
    ]);

    // Rename + hide
    const patchRes = await patchAsset(a2.id, sid, { name: 'Vàng nhẫn', hidden: true });
    expect(patchRes.status).toBe(200);
    const patched = (await json<{ asset: AssetView }>(patchRes)).asset;
    expect(patched).toMatchObject({
      id: a2.id,
      name: 'Vàng nhẫn',
      hidden: true,
      entryCount: 0,
    });

    // Hidden assets remain in the list with hidden: true
    const list2 = await json<AssetsResponse>(await getAssets(sid));
    expect(list2.assets.find((a) => a.id === a2.id)).toMatchObject({
      name: 'Vàng nhẫn',
      hidden: true,
    });
  });

  it('duplicate name (case-insensitive, trimmed) returns 422 VALIDATION with details.field = name', async () => {
    const sid = await memberSid('u-ast-dup', 'AssetDup');
    await switchOn('u-ast-dup');

    const r1 = await createAsset(sid, {
      name: 'Bitcoin',
      unit: 'BTC',
      groupName: 'Crypto',
      decimals: 8,
    });
    expect(r1.status).toBe(201);
    const btc = (await json<{ asset: AssetView }>(r1)).asset;

    const r2 = await createAsset(sid, {
      name: 'Ethereum',
      unit: 'ETH',
      groupName: 'Crypto',
      decimals: 8,
    });
    expect(r2.status).toBe(201);
    const eth = (await json<{ asset: AssetView }>(r2)).asset;

    const dupCreate = await createAsset(sid, {
      name: '  bitcoin ',
      unit: 'BTC',
      groupName: 'Crypto',
      decimals: 8,
    });
    expect(dupCreate.status).toBe(422);
    expect(await json<{ error: { code: string; details: { field: string } } }>(dupCreate)).toMatchObject({
      error: { code: 'VALIDATION', details: { field: 'name' } },
    });

    const dupPatch = await patchAsset(eth.id, sid, { name: ' BITCOIN ' });
    expect(dupPatch.status).toBe(422);
    expect(await json<{ error: { code: string; details: { field: string } } }>(dupPatch)).toMatchObject({
      error: { code: 'VALIDATION', details: { field: 'name' } },
    });

    // Self-casing rename is allowed
    const selfRename = await patchAsset(btc.id, sid, { name: 'BITCOIN' });
    expect(selfRename.status).toBe(200);
  });

  it('decimals change: 200 when unused, 409 IN_USE when used', async () => {
    const sid = await memberSid('u-ast-dec', 'AssetDec');
    await switchOn('u-ast-dec');
    const walletId = await createInvestmentWallet(sid, 'u-ast-dec');

    const a1 = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'VN30 ETF', unit: 'CCQ', groupName: 'ETF', decimals: 2 }),
      )
    ).asset;

    const unusedPatch = await patchAsset(a1.id, sid, { decimals: 4 });
    expect(unusedPatch.status).toBe(200);
    expect((await json<{ asset: AssetView }>(unusedPatch)).asset.decimals).toBe(4);

    await seedBuyTx('tx-dec-1', 'u-ast-dec', walletId, a1.id);

    const usedPatch = await patchAsset(a1.id, sid, { decimals: 6 });
    expect(usedPatch.status).toBe(409);
    expect((await json<{ error: { code: string } }>(usedPatch)).error.code).toBe('IN_USE');
  });

  it('delete unused -> 200; delete used -> 409 with count; moveTo same decimals -> 200; different decimals -> 422', async () => {
    const sid = await memberSid('u-ast-del', 'AssetDel');
    await switchOn('u-ast-del');
    const walletId = await createInvestmentWallet(sid, 'u-ast-del');

    const unused = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'Unused', unit: 'U', groupName: 'Crypto', decimals: 0 }),
      )
    ).asset;
    const src = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'BTC Old', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    const sameDec = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'BTC New', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    const diffDec = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'Vàng', unit: 'chỉ', groupName: 'Vàng', decimals: 2 }),
      )
    ).asset;

    const delUnused = await deleteAsset(unused.id, sid);
    expect(delUnused.status).toBe(200);

    await seedBuyTx('tx-del-a1', 'u-ast-del', walletId, src.id);
    await seedBuyTx('tx-del-a2', 'u-ast-del', walletId, src.id);

    const inUse = await deleteAsset(src.id, sid);
    expect(inUse.status).toBe(409);
    expect(await json<{ error: { code: string; count: number } }>(inUse)).toMatchObject({
      error: { code: 'IN_USE', count: 2 },
    });

    // Self moveTo -> 422
    expect((await deleteAsset(src.id, sid, src.id)).status).toBe(422);

    // Different decimals -> 422
    expect((await deleteAsset(src.id, sid, diffDec.id)).status).toBe(422);

    // Same decimals -> 200 and entries moved
    const moved = await deleteAsset(src.id, sid, sameDec.id);
    expect(moved.status).toBe(200);

    const movedRows = await env.DB.prepare(
      'SELECT asset_id FROM personal_transactions WHERE id IN (?, ?)',
    )
      .bind('tx-del-a1', 'tx-del-a2')
      .all<{ asset_id: string }>();
    expect(movedRows.results.map((r) => r.asset_id)).toEqual([sameDec.id, sameDec.id]);

    const list = await json<AssetsResponse>(await getAssets(sid));
    expect(list.assets.some((a) => a.id === src.id)).toBe(false);
    expect(list.assets.find((a) => a.id === sameDec.id)?.entryCount).toBe(2);
  });

  it('second account gets 404 on PATCH, DELETE, and moveTo; never sees another user asset', async () => {
    const sid1 = await memberSid('u-ast-own1', 'AssetOwner1');
    const sid2 = await memberSid('u-ast-own2', 'AssetOwner2');
    await switchOn('u-ast-own1');
    await switchOn('u-ast-own2');

    const a1 = (
      await json<{ asset: AssetView }>(
        await createAsset(sid1, { name: 'User1 BTC', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;
    const a2 = (
      await json<{ asset: AssetView }>(
        await createAsset(sid2, { name: 'User2 BTC', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;

    const list2 = await json<AssetsResponse>(await getAssets(sid2));
    expect(list2.assets.map((a) => a.id)).toEqual([a2.id]);

    expect((await patchAsset(a1.id, sid2, { name: 'Hack' })).status).toBe(404);
    expect((await deleteAsset(a1.id, sid2)).status).toBe(404);
    expect((await deleteAsset(a2.id, sid2, a1.id)).status).toBe(404);
  });

  it('switch off: 403 on all four routes', async () => {
    const sid = await memberSid('u-ast-off', 'AssetOff');
    await switchOn('u-ast-off', 0);

    expect((await getAssets(sid)).status).toBe(403);
    expect(
      (await createAsset(sid, { name: 'BTC', unit: 'BTC', groupName: 'Crypto', decimals: 8 })).status,
    ).toBe(403);
    expect((await patchAsset('any-id', sid, { name: 'ETH' })).status).toBe(403);
    expect((await deleteAsset('any-id', sid)).status).toBe(403);
  });
});
