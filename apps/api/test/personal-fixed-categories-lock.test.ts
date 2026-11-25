import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { CategoriesResponse, CategoryView, WalletDetailResponse } from '@cc/core';
import { fixedCategoryId } from '../src/personal/fixedCategories';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, seedLegacyStarters, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createCategory = (sid: string, body: unknown) =>
  postJson('/api/me/personal/categories', sid, body);

const patchCategory = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/categories/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteCategory = (id: string, sid: string, moveTo?: string) => {
  const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
  return call(`/api/me/personal/categories/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
    headers: { Cookie: `sid=${sid}` },
  });
};

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM personal_category_visibility').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal fixed categories lock and merge', () => {
  it('rename fixed → 422 FIXED_CATEGORY', async () => {
    const uid = 'u-lock-rename';
    const sid = await memberSid(uid, 'LockRename');
    await switchOn(uid);
    await getCategories(sid);

    const res = await patchCategory(fixedCategoryId(uid, 'food'), sid, { name: 'Đồ ăn' });
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ error: { code: 'FIXED_CATEGORY' } });
  });

  it('change icon fixed → 422', async () => {
    const uid = 'u-lock-icon';
    const sid = await memberSid(uid, 'LockIcon');
    await switchOn(uid);
    await getCategories(sid);

    const iconRes = await patchCategory(fixedCategoryId(uid, 'food'), sid, { icon: 'beer' });
    expect(iconRes.status).toBe(422);
    expect(await json(iconRes)).toMatchObject({ error: { code: 'FIXED_CATEGORY' } });

    const parentRes = await patchCategory(fixedCategoryId(uid, 'food-dining'), sid, {
      parentId: null,
    });
    expect(parentRes.status).toBe(422);
    expect(await json(parentRes)).toMatchObject({ error: { code: 'FIXED_CATEGORY' } });
  });

  it('delete fixed → 422', async () => {
    const uid = 'u-lock-del';
    const sid = await memberSid(uid, 'LockDel');
    await switchOn(uid);
    await getCategories(sid);

    const res = await deleteCategory(fixedCategoryId(uid, 'food'), sid);
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ error: { code: 'FIXED_CATEGORY' } });
  });

  it('hide fixed → 200 hidden true and it still resolves on old transactions', async () => {
    const uid = 'u-lock-hide';
    const sid = await memberSid(uid, 'LockHide');
    await switchOn(uid);
    await getCategories(sid);

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 500_000 }))
    ).wallet;
    const foodId = fixedCategoryId(uid, 'food');

    const txRes = await postJson('/api/me/personal/transactions', sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 50_000,
      categoryId: foodId,
      date: '2026-11-20',
    });
    expect(txRes.status).toBe(201);

    const hideRes = await patchCategory(foodId, sid, { hidden: true });
    expect(hideRes.status).toBe(200);
    const hideBody = await json<{ category: CategoryView }>(hideRes);
    expect(hideBody.category.hidden).toBe(true);
    expect(hideBody.category.systemKey).toBe('food');

    const listRes = await getCategories(sid);
    expect(listRes.status).toBe(200);
    const listBody = await json<CategoriesResponse>(listRes);
    const food = listBody.categories.find((c) => c.id === foodId);
    expect(food?.hidden).toBe(true);

    const txRow = await env.DB.prepare(
      'SELECT category_id FROM personal_transactions WHERE user_id = ?',
    )
      .bind(uid)
      .first<{ category_id: string }>();
    expect(txRow?.category_id).toBe(foodId);
  });

  it('custom child under fixed parent → 201', async () => {
    const uid = 'u-lock-child';
    const sid = await memberSid(uid, 'LockChild');
    await switchOn(uid);
    await getCategories(sid);

    const foodId = fixedCategoryId(uid, 'food');
    const res = await createCategory(sid, {
      type: 'expense',
      name: 'Trà sữa',
      icon: 'cup-soda',
      parentId: foodId,
    });
    expect(res.status).toBe(201);
    const body = await json<{ category: CategoryView }>(res);
    expect(body.category).toMatchObject({
      parentId: foodId,
      type: 'expense',
      name: 'Trà sữa',
      icon: 'cup-soda',
      systemKey: null,
    });
  });

  it('merge into fixed moves links and default', async () => {
    const uid = 'u-lock-merge';
    const sid = await memberSid(uid, 'LockMerge');
    await switchOn(uid);
    await seedLegacyStarters(uid);
    await getCategories(sid);

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 500_000 }))
    ).wallet;

    const customId = `${uid}:health`;
    const targetId = fixedCategoryId(uid, 'life-medical');
    const now = '2026-11-20T00:00:00.000Z';

    await env.DB.prepare(
      `INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, date, created_at, updated_at)
       VALUES (?, ?, ?, 'expense', 120000, ?, '2026-11-20', ?, ?)`,
    )
      .bind('tx-merge-1', uid, wallet.id, customId, now, now)
      .run();

    await env.DB.prepare(
      `INSERT INTO personal_group_links (user_id, root_id, trip_id, wallet_id, category_id, intent, exclude_from_reports, created_at, updated_at, sync_version)
       VALUES (?, 'root-1', 'trip-1', ?, ?, 'shared', 0, ?, ?, 1)`,
    )
      .bind(uid, wallet.id, customId, now, now)
      .run();

    await env.DB.prepare(
      `INSERT INTO personal_group_settings (user_id, default_group_category_id, count_loans, updated_at)
       VALUES (?, ?, 0, ?)`,
    )
      .bind(uid, customId, now)
      .run();

    const delRes = await deleteCategory(customId, sid, targetId);
    expect(delRes.status).toBe(200);
    expect(await json(delRes)).toEqual({ ok: true });

    const gone = await env.DB.prepare('SELECT id FROM personal_categories WHERE id = ?')
      .bind(customId)
      .first<{ id: string }>();
    expect(gone).toBeNull();

    const txRow = await env.DB.prepare('SELECT category_id FROM personal_transactions WHERE id = ?')
      .bind('tx-merge-1')
      .first<{ category_id: string }>();
    expect(txRow?.category_id).toBe(targetId);

    const linkRow = await env.DB.prepare(
      'SELECT category_id FROM personal_group_links WHERE user_id = ? AND root_id = ?',
    )
      .bind(uid, 'root-1')
      .first<{ category_id: string }>();
    expect(linkRow?.category_id).toBe(targetId);

    const settingsRow = await env.DB.prepare(
      'SELECT default_group_category_id FROM personal_group_settings WHERE user_id = ?',
    )
      .bind(uid)
      .first<{ default_group_category_id: string }>();
    expect(settingsRow?.default_group_category_id).toBe(targetId);
  });
});
