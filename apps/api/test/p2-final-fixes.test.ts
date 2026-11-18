import { afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { json, memberSid } from './helpers';
import { postJson, switchOn } from './personal-helpers';

const createAsset = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);

const patchAsset = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/assets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
  await env.DB.prepare('DELETE FROM users').run();
});

describe('M5: duplicate asset names with Vietnamese capitals', () => {
  it('"VÀNG" exists -> creating "vàng" gives 422 VALIDATION with details.field "name"', async () => {
    const sid = await memberSid('u-vi-asset', 'Vi Asset');
    await switchOn('u-vi-asset', 1);

    const first = await createAsset(sid, {
      name: 'VÀNG',
      unit: 'chỉ',
      groupName: 'Vàng',
      decimals: 2,
    });
    expect(first.status).toBe(201);

    const dup = await createAsset(sid, {
      name: 'vàng',
      unit: 'chỉ',
      groupName: 'Vàng',
      decimals: 2,
    });
    expect(dup.status).toBe(422);
    const body = await json<{ error: { code: string; details?: { field?: string } } }>(dup);
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.details?.field).toBe('name');
  });

  it('PATCHing another asset to "vàng" when "VÀNG" exists gives 422 VALIDATION', async () => {
    const sid = await memberSid('u-vi-asset-patch', 'Vi Asset Patch');
    await switchOn('u-vi-asset-patch', 1);

    const gold = await createAsset(sid, {
      name: 'VÀNG',
      unit: 'chỉ',
      groupName: 'Vàng',
      decimals: 2,
    });
    expect(gold.status).toBe(201);

    const silver = await createAsset(sid, {
      name: 'BẠC',
      unit: 'lượng',
      groupName: 'Kim loại',
      decimals: 2,
    });
    expect(silver.status).toBe(201);
    const silverBody = await json<{ asset: { id: string } }>(silver);

    const patch = await patchAsset(silverBody.asset.id, sid, { name: 'vàng' });
    expect(patch.status).toBe(422);
    const errBody = await json<{ error: { code: string; details?: { field?: string } } }>(patch);
    expect(errBody.error.code).toBe('VALIDATION');
    expect(errBody.error.details?.field).toBe('name');
  });
});
