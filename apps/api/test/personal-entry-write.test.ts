import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { ApiError } from '@cc/api-util/errors';
import type { AssetView, CategoriesResponse, WalletDetailResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, seedLegacyStarters, switchOn } from './personal-helpers';
import { prepareEntryWrite, writeEntry } from '../src/personal/entryWrite';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const createAsset = (sid: string, body: unknown) => postJson('/api/me/personal/assets', sid, body);

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_asset_counts').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_balances').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
});

describe('personal entryWrite helper', () => {
  it('stores source and externalRef, and rolls back the whole batch on duplicate ref', async () => {
    const userId = 'u-ew-1';
    const sid = await memberSid(userId, 'EW1');
    await switchOn(userId);
    await seedLegacyStarters(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví chính', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

    const db = getDb(env);
    const now = '2026-12-05T08:00:00.000Z';

    const entries = await writeEntry(
      db,
      userId,
      {
        type: 'expense',
        walletId: wallet.id,
        amount: 75_000,
        categoryId: food.id,
        date: '2026-12-05',
        note: 'Tiền nhà',
        tags: ['Fixed', 'Rent'],
      },
      { source: 'recurring', externalRef: 'r1:2026-12-05', now },
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      walletId: wallet.id,
      type: 'expense',
      amount: 75_000,
      categoryId: food.id,
      date: '2026-12-05',
      tags: ['Fixed', 'Rent'],
    });

    const stored = await env.DB.prepare(
      'SELECT id, source, external_ref FROM personal_transactions WHERE id = ?',
    )
      .bind(entries[0]!.id)
      .first<{ id: string; source: string; external_ref: string | null }>();
    expect(stored).toEqual({
      id: entries[0]!.id,
      source: 'recurring',
      external_ref: 'r1:2026-12-05',
    });

    const balBefore = await env.DB.prepare(
      'SELECT personal_net, entry_count FROM personal_wallet_balances WHERE wallet_id = ?',
    )
      .bind(wallet.id)
      .first<{ personal_net: number; entry_count: number }>();
    expect(balBefore).toEqual({ personal_net: -75_000, entry_count: 1 });

    // Second call with the same ref throws and leaves wallet balance cache and tx count unchanged
    await expect(
      writeEntry(
        db,
        userId,
        {
          type: 'expense',
          walletId: wallet.id,
          amount: 75_000,
          categoryId: food.id,
          date: '2026-12-05',
          note: 'Duplicate',
          tags: ['BrandNewTagShouldRollBack'],
        },
        { source: 'recurring', externalRef: 'r1:2026-12-05', now },
      ),
    ).rejects.toThrow();

    const balAfter = await env.DB.prepare(
      'SELECT personal_net, entry_count FROM personal_wallet_balances WHERE wallet_id = ?',
    )
      .bind(wallet.id)
      .first<{ personal_net: number; entry_count: number }>();
    expect(balAfter).toEqual({ personal_net: -75_000, entry_count: 1 });

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(txCount?.cnt).toBe(1);

    const rolledBackTag = await env.DB.prepare(
      'SELECT id FROM personal_tags WHERE user_id = ? AND lower(name) = ?',
    )
      .bind(userId, 'brandnewtagshouldrollback')
      .first<{ id: string }>();
    expect(rolledBackTag).toBeNull();
  });

  it('stores externalRef on transfer_out and externalRef + ":in" on transfer_in', async () => {
    const userId = 'u-ew-tr';
    const sid = await memberSid(userId, 'EWTr');
    await switchOn(userId);
    await seedLegacyStarters(userId);

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví A', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví B', startAmount: 100_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const db = getDb(env);
    const now = '2026-12-05T08:00:00.000Z';

    const entries = await writeEntry(
      db,
      userId,
      {
        type: 'transfer',
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountSent: 200_000,
        date: '2026-12-05',
      },
      { source: 'recurring', externalRef: 'r1:2026-12-05', now },
    );

    expect(entries).toHaveLength(2);
    const rows = (
      await env.DB.prepare(
        'SELECT type, source, external_ref FROM personal_transactions WHERE user_id = ? ORDER BY type DESC',
      )
        .bind(userId)
        .all<{ type: string; source: string; external_ref: string | null }>()
    ).results;

    expect(rows).toEqual([
      { type: 'transfer_out', source: 'recurring', external_ref: 'r1:2026-12-05' },
      { type: 'transfer_in', source: 'recurring', external_ref: 'r1:2026-12-05:in' },
    ]);
  });

  it('rejects a buy without a valid quantity with VALIDATION', async () => {
    const userId = 'u-ew-buy';
    const sid = await memberSid(userId, 'EWBuy');
    await switchOn(userId);
    await seedLegacyStarters(userId);

    const invWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Đầu tư',
          currency: 'VND',
          kind: 'investment',
          startAmount: 10_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    const asset = (
      await json<{ asset: AssetView }>(
        await createAsset(sid, {
          name: 'Bitcoin',
          unit: 'BTC',
          groupName: 'Crypto',
          decimals: 8,
        }),
      )
    ).asset;

    const db = getDb(env);
    const now = '2026-12-05T08:00:00.000Z';

    let caught: unknown;
    try {
      await writeEntry(
        db,
        userId,
        {
          type: 'buy',
          walletId: invWallet.id,
          assetId: asset.id,
          quantity: 0,
          amount: 1_000_000,
          date: '2026-12-05',
        },
        { source: 'recurring', externalRef: 'r2:2026-12-05', now },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('VALIDATION');
    expect((caught as ApiError).status).toBe(422);
  });

  it('prepareEntryWrite does not write tags or transactions until the returned batch runs', async () => {
    const userId = 'u-ew-prep';
    const sid = await memberSid(userId, 'EWPrep');
    await switchOn(userId);
    await seedLegacyStarters(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

    const db = getDb(env);
    const prepared = await prepareEntryWrite(
      db,
      userId,
      {
        type: 'expense',
        walletId: wallet.id,
        amount: 50_000,
        categoryId: food.id,
        date: '2026-12-05',
        tags: ['UnwrittenTag'],
      },
      { source: 'recurring', externalRef: 'r3:2026-12-05', now: '2026-12-05T08:00:00.000Z' },
    );

    expect(prepared.entries).toHaveLength(1);

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    const tagCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_tags WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();

    expect(txCount?.cnt).toBe(0);
    expect(tagCount?.cnt).toBe(0);
  });
});
