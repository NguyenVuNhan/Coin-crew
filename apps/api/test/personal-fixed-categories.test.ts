import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { FIXED_CATEGORIES, type CategoriesResponse, type WalletDetailResponse } from '@cc/core';
import { ensureFixedCategories, fixedCategoryId } from '../src/personal/fixedCategories';
import { call, json, memberSid, seedUser } from './helpers';
import { addWallet, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const OLD_TS = '2026-01-01T00:00:00.000Z';

afterEach(async () => {
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

describe('personal fixed categories seeding and adoption', () => {
  it('new user GET /me/personal/categories returns exactly the fixed list with systemKey set', async () => {
    const uid = 'u-fix-new';
    const sid = await memberSid(uid, 'FixNew');
    await switchOn(uid);

    const res = await getCategories(sid);
    expect(res.status).toBe(200);
    const body = await json<CategoriesResponse>(res);

    expect(body.categories).toHaveLength(FIXED_CATEGORIES.length);

    const byKey = new Map(body.categories.map((c) => [c.systemKey, c]));
    for (const fixed of FIXED_CATEGORIES) {
      const row = byKey.get(fixed.key);
      expect(row).toBeDefined();
      expect(row).toMatchObject({
        id: fixedCategoryId(uid, fixed.key),
        parentId: fixed.parentKey ? fixedCategoryId(uid, fixed.parentKey) : null,
        type: fixed.type,
        name: fixed.name,
        icon: fixed.icon,
        hidden: false,
        sortOrder: fixed.sortOrder,
        systemKey: fixed.key,
      });
    }
  });

  it('adopts starter rows by id, keeps hidden and transactions', async () => {
    const uid = 'u-fix-adopt';
    const sid = await memberSid(uid, 'FixAdopt');
    await switchOn(uid);

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 1_000_000 }))
    ).wallet;

    // Seed old starter rows: hidden food, renamed transport, non-adopted fees -> tax
    await env.DB.prepare(
      `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, system_key, created_at, updated_at)
       VALUES (?, ?, NULL, 'expense', 'Ăn uống', 'utensils', 1, 7, NULL, ?, ?),
              (?, ?, NULL, 'expense', 'Đi lại', 'bus', 0, 1, NULL, ?, ?),
              (?, ?, NULL, 'expense', 'Phí & lệ phí', 'receipt-text', 0, 6, NULL, ?, ?),
              (?, ?, ?, 'expense', 'Thuế', 'landmark', 0, 0, NULL, ?, ?)`,
    )
      .bind(
        `${uid}:food`,
        uid,
        OLD_TS,
        OLD_TS,
        `${uid}:transport`,
        uid,
        OLD_TS,
        OLD_TS,
        `${uid}:fees`,
        uid,
        OLD_TS,
        OLD_TS,
        `${uid}:tax`,
        uid,
        `${uid}:fees`,
        OLD_TS,
        OLD_TS,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, date, created_at, updated_at)
       VALUES (?, ?, ?, 'expense', 75000, ?, '2026-11-20', ?, ?)`,
    )
      .bind('tx-adopt-food', uid, wallet.id, `${uid}:food`, OLD_TS, OLD_TS)
      .run();

    const res = await getCategories(sid);
    expect(res.status).toBe(200);
    const body = await json<CategoriesResponse>(res);

    // 49 fixed + 2 non-adopted old starters (fees, tax)
    expect(body.categories).toHaveLength(FIXED_CATEGORIES.length + 2);

    const food = body.categories.find((c) => c.id === `${uid}:food`);
    expect(food).toMatchObject({
      id: `${uid}:food`,
      systemKey: 'food',
      hidden: true,
      name: 'Ăn uống',
      icon: 'utensils',
      sortOrder: 7,
      parentId: null,
    });

    const transport = body.categories.find((c) => c.id === `${uid}:transport`);
    expect(transport).toMatchObject({
      id: `${uid}:transport`,
      systemKey: 'transport',
      name: 'Di chuyển',
      icon: 'car',
      hidden: false,
      parentId: null,
    });

    const fees = body.categories.find((c) => c.id === `${uid}:fees`);
    expect(fees).toMatchObject({
      id: `${uid}:fees`,
      systemKey: null,
      parentId: null,
    });

    const tax = body.categories.find((c) => c.id === `${uid}:tax`);
    expect(tax).toMatchObject({
      id: `${uid}:tax`,
      systemKey: null,
      parentId: `${uid}:fees`,
    });

    const tx = await env.DB.prepare('SELECT category_id FROM personal_transactions WHERE id = ?')
      .bind('tx-adopt-food')
      .first<{ category_id: string }>();
    expect(tx?.category_id).toBe(`${uid}:food`);
  });

  it('custom category named "Ăn uống" is never adopted', async () => {
    const uid = 'u-fix-custom';
    const sid = await memberSid(uid, 'FixCustom');
    await switchOn(uid);

    await env.DB.prepare(
      `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, system_key, created_at, updated_at)
       VALUES (?, ?, NULL, 'expense', 'Ăn uống', 'utensils', 0, 99, NULL, ?, ?)`,
    )
      .bind('custom-an-uong', uid, OLD_TS, OLD_TS)
      .run();

    const res = await getCategories(sid);
    expect(res.status).toBe(200);
    const body = await json<CategoriesResponse>(res);

    const custom = body.categories.find((c) => c.id === 'custom-an-uong');
    expect(custom).toBeDefined();
    expect(custom?.systemKey).toBeNull();
    expect(custom?.name).toBe('Ăn uống');

    const fixedFood = body.categories.find((c) => c.id === fixedCategoryId(uid, 'food'));
    expect(fixedFood).toBeDefined();
    expect(fixedFood?.systemKey).toBe('food');
  });

  it('ensureFixedCategories is idempotent under concurrent calls', async () => {
    const uid = 'u-fix-race';
    await seedUser(uid, 'FixRace');
    const db = getDb(env);

    await Promise.all([ensureFixedCategories(db, uid), ensureFixedCategories(db, uid)]);

    const rows = await env.DB.prepare(
      'SELECT id, system_key FROM personal_categories WHERE user_id = ?',
    )
      .bind(uid)
      .all<{ id: string; system_key: string | null }>();

    expect(rows.results).toHaveLength(FIXED_CATEGORIES.length);
  });

  it('second GET does no writes', async () => {
    const uid = 'u-fix-noop';
    const sid = await memberSid(uid, 'FixNoop');
    await switchOn(uid);

    const r1 = await getCategories(sid);
    expect(r1.status).toBe(200);

    const sentinel = '2020-01-01T00:00:00.000Z';
    await env.DB.prepare('UPDATE personal_categories SET updated_at = ? WHERE user_id = ?')
      .bind(sentinel, uid)
      .run();

    const r2 = await getCategories(sid);
    expect(r2.status).toBe(200);

    const rows = await env.DB.prepare(
      'SELECT id, updated_at FROM personal_categories WHERE user_id = ?',
    )
      .bind(uid)
      .all<{ id: string; updated_at: string }>();

    expect(rows.results).toHaveLength(FIXED_CATEGORIES.length);
    for (const row of rows.results) {
      expect(row.updated_at).toBe(sentinel);
    }
  });
});
