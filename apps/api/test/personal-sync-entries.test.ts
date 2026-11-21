import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  AssetView,
  CategoriesResponse,
  EntriesResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

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

const createAsset = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);

async function getVersion(userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
    .bind(userId)
    .first<{ version: number }>();
  return row?.version ?? 0;
}

async function getSyncVersion(id: string): Promise<number | null> {
  const row = await env.DB.prepare('SELECT sync_version FROM personal_transactions WHERE id = ?')
    .bind(id)
    .first<{ sync_version: number }>();
  return row?.sync_version ?? null;
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal sync entries', () => {
  it('create expense stamps the row', async () => {
    const userId = 'u-sync-ent-1';
    const sid = await memberSid(userId, 'SyncEnt1');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const vBefore = await getVersion(userId);

    const res = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 50_000,
      categoryId: food.id,
      date: '2026-11-19',
      tags: ['food'],
    });
    expect(res.status).toBe(201);
    const body = await json<EntriesResponse>(res);
    expect(body.entries).toHaveLength(1);
    const tx = body.entries[0]!;

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);
    expect(await getSyncVersion(tx.id)).toBe(vAfter);
  });

  it('create transfer stamps both sides', async () => {
    const userId = 'u-sync-ent-2';
    const sid = await memberSid(userId, 'SyncEnt2');
    await switchOn(userId);

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const vBefore = await getVersion(userId);

    const res = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 100_000,
      date: '2026-11-19',
      tags: ['trans'],
    });
    expect(res.status).toBe(201);
    const body = await json<EntriesResponse>(res);
    expect(body.entries).toHaveLength(2);
    const [outSide, inSide] = body.entries;

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);
    expect(await getSyncVersion(outSide!.id)).toBe(vAfter);
    expect(await getSyncVersion(inSide!.id)).toBe(vAfter);
  });

  it('create buy stamps the row', async () => {
    const userId = 'u-sync-ent-3';
    const sid = await memberSid(userId, 'SyncEnt3');
    await switchOn(userId);

    const invWallet = (
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

    const vBefore = await getVersion(userId);

    const res = await createEntry(sid, {
      type: 'buy',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 50_000_000,
      amount: 50_000_000,
      date: '2026-11-19',
      tags: ['crypto'],
    });
    expect(res.status).toBe(201);
    const body = await json<EntriesResponse>(res);
    expect(body.entries).toHaveLength(1);
    const tx = body.entries[0]!;

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);
    expect(await getSyncVersion(tx.id)).toBe(vAfter);
  });

  it('patch amount stamps', async () => {
    const userId = 'u-sync-ent-4';
    const sid = await memberSid(userId, 'SyncEnt4');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const createRes = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 50_000,
      categoryId: food.id,
      date: '2026-11-19',
    });
    expect(createRes.status).toBe(201);
    const createdTx = (await json<EntriesResponse>(createRes)).entries[0]!;

    const vBefore = await getVersion(userId);

    const patchRes = await patchEntry(createdTx.id, sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 75_000,
      categoryId: food.id,
      date: '2026-11-19',
    });
    expect(patchRes.status).toBe(200);

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);
    expect(await getSyncVersion(createdTx.id)).toBe(vAfter);
  });

  it('patch tags only stamps the transaction', async () => {
    const userId = 'u-sync-ent-5';
    const sid = await memberSid(userId, 'SyncEnt5');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const createRes = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 50_000,
      categoryId: food.id,
      date: '2026-11-19',
      tags: ['old-tag'],
    });
    expect(createRes.status).toBe(201);
    const createdTx = (await json<EntriesResponse>(createRes)).entries[0]!;

    const vBefore = await getVersion(userId);

    const patchRes = await patchEntry(createdTx.id, sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 50_000,
      categoryId: food.id,
      date: '2026-11-19',
      tags: ['new-tag'],
    });
    expect(patchRes.status).toBe(200);

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);
    expect(await getSyncVersion(createdTx.id)).toBe(vAfter);
  });

  it('patch transfer stamps both sides', async () => {
    const userId = 'u-sync-ent-6';
    const sid = await memberSid(userId, 'SyncEnt6');
    await switchOn(userId);

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const createRes = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 100_000,
      date: '2026-11-19',
    });
    expect(createRes.status).toBe(201);
    const [origOut, origIn] = (await json<EntriesResponse>(createRes)).entries;

    const vBefore = await getVersion(userId);

    const patchRes = await patchEntry(origOut!.id, sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 150_000,
      date: '2026-11-19',
    });
    expect(patchRes.status).toBe(200);

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);
    expect(await getSyncVersion(origOut!.id)).toBe(vAfter);
    expect(await getSyncVersion(origIn!.id)).toBe(vAfter);
  });

  it('delete records deletions for both transfer sides and removes rows', async () => {
    const userId = 'u-sync-ent-7';
    const sid = await memberSid(userId, 'SyncEnt7');
    await switchOn(userId);

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const createRes = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 100_000,
      date: '2026-11-19',
    });
    expect(createRes.status).toBe(201);
    const [origOut, origIn] = (await json<EntriesResponse>(createRes)).entries;

    const vBefore = await getVersion(userId);

    const delRes = await deleteEntry(origOut!.id, sid);
    expect(delRes.status).toBe(200);

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);

    expect(await getSyncVersion(origOut!.id)).toBeNull();
    expect(await getSyncVersion(origIn!.id)).toBeNull();

    const dels = await env.DB.prepare(
      'SELECT transaction_id, version FROM personal_sync_deletions WHERE user_id = ? ORDER BY transaction_id',
    )
      .bind(userId)
      .all<{ transaction_id: string; version: number }>();
    expect(dels.results).toHaveLength(2);
    const delIds = dels.results.map((r) => r.transaction_id).sort();
    const expectedIds = [origOut!.id, origIn!.id].sort();
    expect(delIds).toEqual(expectedIds);
    expect(dels.results.every((r) => r.version === vAfter)).toBe(true);
  });

  it('restore re-inserts, stamps and clears the deletion records', async () => {
    const userId = 'u-sync-ent-8';
    const sid = await memberSid(userId, 'SyncEnt8');
    await switchOn(userId);

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'W2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const createRes = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 100_000,
      date: '2026-11-19',
    });
    expect(createRes.status).toBe(201);
    const createdBody = await json<EntriesResponse>(createRes);
    const [origOut, origIn] = createdBody.entries;

    const delRes = await deleteEntry(origOut!.id, sid);
    expect(delRes.status).toBe(200);
    const deletedBody = await json<EntriesResponse>(delRes);

    const delsBefore = await env.DB.prepare(
      'SELECT count(*) as cnt FROM personal_sync_deletions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(delsBefore?.cnt).toBe(2);

    const vBefore = await getVersion(userId);

    const restoreRes = await restoreEntries(sid, deletedBody);
    expect(restoreRes.status).toBe(200);

    const vAfter = await getVersion(userId);
    expect(vAfter).toBe(vBefore + 1);

    expect(await getSyncVersion(origOut!.id)).toBe(vAfter);
    expect(await getSyncVersion(origIn!.id)).toBe(vAfter);

    const delsAfter = await env.DB.prepare(
      'SELECT count(*) as cnt FROM personal_sync_deletions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(delsAfter?.cnt).toBe(0);
  });

  it('a rejected write (422) leaves the version unchanged', async () => {
    const userId = 'u-sync-ent-9';
    const sid = await memberSid(userId, 'SyncEnt9');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const createRes = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 50_000,
      categoryId: food.id,
      date: '2026-11-19',
    });
    expect(createRes.status).toBe(201);
    const vBefore = await getVersion(userId);
    expect(vBefore).toBeGreaterThanOrEqual(1);

    const badRes = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: -50_000,
      categoryId: food.id,
      date: '2026-11-19',
    });
    expect(badRes.status).toBe(422);

    const vAfterCreate = await getVersion(userId);
    expect(vAfterCreate).toBe(vBefore);

    const createdTx = (await json<EntriesResponse>(createRes)).entries[0]!;
    const badPatch = await patchEntry(createdTx.id, sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 0,
      categoryId: food.id,
      date: '2026-11-19',
    });
    expect(badPatch.status).toBe(422);

    const vAfterPatch = await getVersion(userId);
    expect(vAfterPatch).toBe(vBefore);

    const badRestore = await restoreEntries(sid, { entries: [] });
    expect(badRestore.status).toBe(422);

    const vAfterRestore = await getVersion(userId);
    expect(vAfterRestore).toBe(vBefore);
  });
});
