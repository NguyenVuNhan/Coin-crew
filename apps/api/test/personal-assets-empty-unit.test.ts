import { afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { AssetView, WalletDetailResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const createAsset = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);

const patchAsset = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/assets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal assets empty unit', () => {
  it('allows creating and patching an asset with an empty unit (0-20 chars)', async () => {
    const sid = await memberSid('u-ast-empty-1', 'EmptyUnitUser');
    await switchOn('u-ast-empty-1');

    const createdRes = await createAsset(sid, {
      name: 'BTC',
      unit: '   ',
      groupName: 'Crypto',
      decimals: 4,
    });
    expect(createdRes.status).toBe(201);
    const created = (await json<{ asset: AssetView }>(createdRes)).asset;
    expect(created.unit).toBe('');
    expect(created.decimals).toBe(4);

    // Rejects > 20 chars
    const tooLong = await createAsset(sid, {
      name: 'ETH',
      unit: 'a'.repeat(21),
      groupName: 'Crypto',
      decimals: 4,
    });
    expect(tooLong.status).toBe(422);

    // Patching to a word unit with same decimals succeeds
    const patchedWord = await patchAsset(created.id, sid, { unit: 'sat', decimals: 4 });
    expect(patchedWord.status).toBe(200);
    expect((await json<{ asset: AssetView }>(patchedWord)).asset.unit).toBe('sat');

    // Patching back to empty unit succeeds
    const patchedEmpty = await patchAsset(created.id, sid, { unit: '' });
    expect(patchedEmpty.status).toBe(200);
    expect((await json<{ asset: AssetView }>(patchedEmpty)).asset.unit).toBe('');
  });

  it('keeps 409 IN_USE when changing decimals on a used asset, but allows unit change with same decimals', async () => {
    const sid = await memberSid('u-ast-empty-2', 'EmptyUnitUser2');
    await switchOn('u-ast-empty-2');

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Đầu tư', startAmount: 10_000_000 }))
    ).wallet;
    await env.DB.prepare(
      "INSERT INTO personal_wallet_settings (wallet_id, user_id, kind, sort_order, updated_at) VALUES (?, ?, 'investment', 0, '2026-11-15T00:00:00.000Z') ON CONFLICT(wallet_id) DO UPDATE SET kind = 'investment'",
    )
      .bind(wallet.id, 'u-ast-empty-2')
      .run();

    const created = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, { name: 'Vàng', unit: 'chỉ', groupName: 'Vàng', decimals: 2 }),
      )
    ).asset;

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, asset_id, quantity, date, created_at, updated_at) VALUES ('tx-u1', 'u-ast-empty-2', ?, 'buy', 1000000, ?, 100, '2026-11-15', '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z')",
    )
      .bind(wallet.id, created.id)
      .run();

    const sameDecimals = await patchAsset(created.id, sid, { unit: 'lượng', decimals: 2 });
    expect(sameDecimals.status).toBe(200);

    const diffDecimals = await patchAsset(created.id, sid, { unit: '', decimals: 4 });
    expect(diffDecimals.status).toBe(409);
    const errBody = await json<{ error: { code: string } }>(diffDecimals);
    expect(errBody.error.code).toBe('IN_USE');
  });
});
