import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, memberSid } from './helpers';
import { postJson, switchOn } from './personal-helpers';

const NOW = '2026-11-19T00:00:00.000Z';

const deleteCategory = (id: string, sid: string | null, moveTo?: string) => {
  const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
  return call(`/api/me/personal/categories/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });
};

const deleteAsset = (id: string, sid: string | null, moveTo?: string) => {
  const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
  return call(`/api/me/personal/assets/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });
};

const patchTag = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/tags/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteTag = (id: string, sid: string | null) =>
  call(`/api/me/personal/tags/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });

async function seedWallet(walletId: string, userId: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(walletId, userId, 'Ví chính', 'VND', 0, '2026-01-01', 1, NOW, NOW)
    .run();
}

async function getSyncVersion(userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT version FROM personal_sync_state WHERE user_id = ?')
    .bind(userId)
    .first<{ version: number }>();
  return row?.version ?? 0;
}

async function getTxSyncVersion(txId: string): Promise<number | null> {
  const row = await env.DB.prepare('SELECT sync_version FROM personal_transactions WHERE id = ?')
    .bind(txId)
    .first<{ sync_version: number }>();
  return row?.sync_version ?? null;
}

async function getTx(
  txId: string,
): Promise<{ sync_version: number; category_id: string | null; asset_id: string | null } | null> {
  return await env.DB.prepare('SELECT sync_version, category_id, asset_id FROM personal_transactions WHERE id = ?')
    .bind(txId)
    .first<{ sync_version: number; category_id: string | null; asset_id: string | null }>();
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
});

describe('personal sync bulk writes', () => {
  it('category delete with moveTo stamps moved rows', async () => {
    const userId = 'u-bulk-cat-1';
    const sid = await memberSid(userId, 'BulkCatUser');
    await switchOn(userId);
    await seedWallet('w-cat-1', userId);

    const catOld = 'cat-old-1';
    const catNew = 'cat-new-1';
    await env.DB.prepare(
      'INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?), (?, ?, NULL, ?, ?, ?, ?, ?)',
    )
      .bind(
        catOld,
        userId,
        'expense',
        'Ăn uống',
        'food',
        NOW,
        NOW,
        catNew,
        userId,
        'expense',
        'Mua sắm',
        'cart',
        NOW,
        NOW,
      )
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, date, created_at, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'tx-cat-1',
        userId,
        'w-cat-1',
        'expense',
        10000,
        catOld,
        '2026-11-19',
        NOW,
        NOW,
        0,
        'tx-cat-2',
        userId,
        'w-cat-1',
        'expense',
        20000,
        catOld,
        '2026-11-19',
        NOW,
        NOW,
        0,
        'tx-cat-other',
        userId,
        'w-cat-1',
        'expense',
        30000,
        catNew,
        '2026-11-19',
        NOW,
        NOW,
        0,
      )
      .run();

    expect(await getSyncVersion(userId)).toBe(0);

    const res = await deleteCategory(catOld, sid, catNew);
    expect(res.status).toBe(200);

    const version = await getSyncVersion(userId);
    expect(version).toBe(1);

    const tx1 = await getTx('tx-cat-1');
    expect(tx1?.category_id).toBe(catNew);
    expect(tx1?.sync_version).toBe(version);

    const tx2 = await getTx('tx-cat-2');
    expect(tx2?.category_id).toBe(catNew);
    expect(tx2?.sync_version).toBe(version);

    const txOther = await getTx('tx-cat-other');
    expect(txOther?.category_id).toBe(catNew);
    expect(txOther?.sync_version).toBe(0);

    const oldCatRow = await env.DB.prepare('SELECT id FROM personal_categories WHERE id = ?')
      .bind(catOld)
      .first();
    expect(oldCatRow).toBeNull();
  });

  it('asset delete with moveTo stamps moved rows', async () => {
    const userId = 'u-bulk-ast-1';
    const sid = await memberSid(userId, 'BulkAssetUser');
    await switchOn(userId);
    await seedWallet('w-ast-1', userId);

    const astOld = 'ast-old-1';
    const astNew = 'ast-new-1';
    await env.DB.prepare(
      'INSERT INTO personal_assets (id, user_id, name, unit, group_name, decimals, hidden, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?), (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)',
    )
      .bind(
        astOld,
        userId,
        'Bitcoin',
        'BTC',
        'Crypto',
        8,
        NOW,
        NOW,
        astNew,
        userId,
        'Ethereum',
        'ETH',
        'Crypto',
        8,
        NOW,
        NOW,
      )
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, asset_id, quantity, date, created_at, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'tx-ast-1',
        userId,
        'w-ast-1',
        'buy',
        1000000,
        astOld,
        10000000,
        '2026-11-19',
        NOW,
        NOW,
        0,
        'tx-ast-other',
        userId,
        'w-ast-1',
        'buy',
        2000000,
        astNew,
        20000000,
        '2026-11-19',
        NOW,
        NOW,
        0,
      )
      .run();

    expect(await getSyncVersion(userId)).toBe(0);

    const res = await deleteAsset(astOld, sid, astNew);
    expect(res.status).toBe(200);

    const version = await getSyncVersion(userId);
    expect(version).toBe(1);

    const tx1 = await getTx('tx-ast-1');
    expect(tx1?.asset_id).toBe(astNew);
    expect(tx1?.sync_version).toBe(version);

    const txOther = await getTx('tx-ast-other');
    expect(txOther?.asset_id).toBe(astNew);
    expect(txOther?.sync_version).toBe(0);

    const oldAstRow = await env.DB.prepare('SELECT id FROM personal_assets WHERE id = ?')
      .bind(astOld)
      .first();
    expect(oldAstRow).toBeNull();
  });

  it('tag delete stamps tagged transactions', async () => {
    const userId = 'u-bulk-tag-1';
    const sid = await memberSid(userId, 'BulkTagUser');
    await switchOn(userId);
    await seedWallet('w-tag-1', userId);

    await env.DB.prepare(
      'INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
    )
      .bind('tag-1', userId, 'Trip', NOW, 'tag-2', userId, 'Food', NOW)
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'tx-tag-1',
        userId,
        'w-tag-1',
        'expense',
        10000,
        '2026-11-19',
        NOW,
        NOW,
        0,
        'tx-tag-2',
        userId,
        'w-tag-1',
        'expense',
        20000,
        '2026-11-19',
        NOW,
        NOW,
        0,
        'tx-untagged',
        userId,
        'w-tag-1',
        'expense',
        30000,
        '2026-11-19',
        NOW,
        NOW,
        0,
      )
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_transaction_tags (transaction_id, tag_id) VALUES (?, ?), (?, ?), (?, ?)',
    )
      .bind(
        'tx-tag-1',
        'tag-1',
        'tx-tag-2',
        'tag-1',
        'tx-untagged',
        'tag-2',
      )
      .run();

    expect(await getSyncVersion(userId)).toBe(0);

    const res = await deleteTag('tag-1', sid);
    expect(res.status).toBe(200);

    const version = await getSyncVersion(userId);
    expect(version).toBe(1);

    expect(await getTxSyncVersion('tx-tag-1')).toBe(version);
    expect(await getTxSyncVersion('tx-tag-2')).toBe(version);
    expect(await getTxSyncVersion('tx-untagged')).toBe(0);

    const tag1Links = await env.DB.prepare(
      'SELECT * FROM personal_transaction_tags WHERE tag_id = ?',
    )
      .bind('tag-1')
      .all();
    expect(tag1Links.results).toHaveLength(0);

    const tag2Links = await env.DB.prepare(
      'SELECT * FROM personal_transaction_tags WHERE tag_id = ?',
    )
      .bind('tag-2')
      .all();
    expect(tag2Links.results).toHaveLength(1);

    const oldTagRow = await env.DB.prepare('SELECT id FROM personal_tags WHERE id = ?')
      .bind('tag-1')
      .first();
    expect(oldTagRow).toBeNull();
  });

  it('renaming a tag does not bump the version', async () => {
    const userId = 'u-bulk-rename-1';
    const sid = await memberSid(userId, 'BulkRenameUser');
    await switchOn(userId);
    await seedWallet('w-rename-1', userId);

    await env.DB.prepare(
      'INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind('tag-rename-1', userId, 'OldName', NOW)
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('tx-rename-1', userId, 'w-rename-1', 'expense', 10000, '2026-11-19', NOW, NOW, 0)
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
    )
      .bind('tx-rename-1', 'tag-rename-1')
      .run();

    expect(await getSyncVersion(userId)).toBe(0);

    const res = await patchTag('tag-rename-1', sid, { name: 'NewName' });
    expect(res.status).toBe(200);

    expect(await getSyncVersion(userId)).toBe(0);
    expect(await getTxSyncVersion('tx-rename-1')).toBe(0);

    const tagRow = await env.DB.prepare('SELECT name FROM personal_tags WHERE id = ?')
      .bind('tag-rename-1')
      .first<{ name: string }>();
    expect(tagRow?.name).toBe('NewName');
  });
});
