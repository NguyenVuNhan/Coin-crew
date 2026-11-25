import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { AssetsResponse, AssetView } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getAssets = (sid: string | null) =>
  call('/api/me/personal/assets', sid ? as(sid) : {});

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

describe('personal assets icon', () => {
  it('creates an asset with an icon', async () => {
    const sid = await memberSid('u-ast-icon-1', 'AssetIcon1');
    await switchOn('u-ast-icon-1');

    const res = await createAsset(sid, {
      name: 'BTC',
      unit: '',
      groupName: 'Crypto',
      decimals: 4,
      icon: 'crypto:btc',
    });
    expect(res.status).toBe(201);
    const { asset } = await json<{ asset: AssetView }>(res);
    expect(asset.icon).toBe('crypto:btc');

    const list = await json<AssetsResponse>(await getAssets(sid));
    expect(list.assets).toHaveLength(1);
    expect(list.assets[0]?.icon).toBe('crypto:btc');
  });

  it('defaults icon to null', async () => {
    const sid = await memberSid('u-ast-icon-2', 'AssetIcon2');
    await switchOn('u-ast-icon-2');

    const res = await createAsset(sid, {
      name: 'Vàng SJC',
      unit: 'chỉ',
      groupName: 'Vàng',
      decimals: 2,
    });
    expect(res.status).toBe(201);
    const { asset } = await json<{ asset: AssetView }>(res);
    expect(asset.icon).toBeNull();

    const list = await json<AssetsResponse>(await getAssets(sid));
    expect(list.assets).toHaveLength(1);
    expect(list.assets[0]?.icon).toBeNull();
  });

  it('PATCH keeps icon when omitted and clears it with null', async () => {
    const sid = await memberSid('u-ast-icon-3', 'AssetIcon3');
    await switchOn('u-ast-icon-3');

    const created = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, {
          name: 'BTC',
          unit: '',
          groupName: 'Crypto',
          decimals: 4,
          icon: 'crypto:btc',
        }),
      )
    ).asset;

    const keepRes = await patchAsset(created.id, sid, { name: 'Bitcoin' });
    expect(keepRes.status).toBe(200);
    const kept = (await json<{ asset: AssetView }>(keepRes)).asset;
    expect(kept.icon).toBe('crypto:btc');

    const clearRes = await patchAsset(created.id, sid, { icon: null });
    expect(clearRes.status).toBe(200);
    const cleared = (await json<{ asset: AssetView }>(clearRes)).asset;
    expect(cleared.icon).toBeNull();

    const list = await json<AssetsResponse>(await getAssets(sid));
    expect(list.assets[0]?.icon).toBeNull();
  });

  it('rejects an icon longer than 40 chars or empty', async () => {
    const sid = await memberSid('u-ast-icon-4', 'AssetIcon4');
    await switchOn('u-ast-icon-4');

    const tooLong = await createAsset(sid, {
      name: 'Long',
      unit: '',
      groupName: 'Crypto',
      decimals: 4,
      icon: 'x'.repeat(41),
    });
    expect(tooLong.status).toBe(422);

    const blank = await createAsset(sid, {
      name: 'Blank',
      unit: '',
      groupName: 'Crypto',
      decimals: 4,
      icon: '  ',
    });
    expect(blank.status).toBe(422);

    const created = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, {
          name: 'ETH',
          unit: '',
          groupName: 'Crypto',
          decimals: 4,
          icon: 'crypto:eth',
        }),
      )
    ).asset;

    const patchTooLong = await patchAsset(created.id, sid, { icon: 'x'.repeat(41) });
    expect(patchTooLong.status).toBe(422);

    const patchBlank = await patchAsset(created.id, sid, { icon: '  ' });
    expect(patchBlank.status).toBe(422);
  });
});
