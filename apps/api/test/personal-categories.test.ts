import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { CategoriesResponse, CategoryView, TagView, WalletDetailResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getCategories = (sid: string | null) =>
  call('/api/me/personal/categories', sid ? as(sid) : {});

const createCategory = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/categories', sid, body);

const patchCategory = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/categories/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteCategory = (id: string, sid: string | null, moveTo?: string) => {
  const qs = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : '';
  return call(`/api/me/personal/categories/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });
};

const getTags = (sid: string | null) =>
  call('/api/me/personal/tags', sid ? as(sid) : {});

const patchTag = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/tags/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteTag = (id: string, sid: string | null) =>
  call(`/api/me/personal/tags/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });

function utcDaysAgo(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))
    .toISOString()
    .slice(0, 10);
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
});

describe('personal categories and tags', () => {
  it('first GET seeds the starter set once, even when called twice in parallel', async () => {
    const sid = await memberSid('u-cat-seed', 'CatSeed');
    await switchOn('u-cat-seed');

    const [r1, r2] = await Promise.all([getCategories(sid), getCategories(sid)]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const b1 = await json<CategoriesResponse>(r1);
    const b2 = await json<CategoriesResponse>(r2);

    expect(b1.categories).toHaveLength(16);
    expect(b2.categories).toHaveLength(16);
    expect(b1.recentIds).toEqual([]);

    const invest = b1.categories.find((c) => c.name === 'Đầu tư');
    expect(invest).toBeDefined();
    expect(invest?.type).toBe('expense');
    expect(invest?.parentId).toBeNull();

    const investSubs = b1.categories
      .filter((c) => c.parentId === invest!.id)
      .map((c) => c.name)
      .sort();
    expect(investSubs).toEqual(['Crypto', 'Cổ phiếu', 'ETF', 'Vàng']);

    const incomeNames = b1.categories
      .filter((c) => c.type === 'income')
      .map((c) => c.name)
      .sort();
    expect(incomeNames).toEqual(['Cổ tức', 'Lãi', 'Lương', 'Thu nhập khác']);

    const r3 = await getCategories(sid);
    expect((await json<CategoriesResponse>(r3)).categories).toHaveLength(16);
  });

  it("a sub-category must share its parent's type and cannot nest two deep", async () => {
    const sid = await memberSid('u-cat-sub', 'CatSub');
    await switchOn('u-cat-sub');

    const seedRes = await json<CategoriesResponse>(await getCategories(sid));
    const food = seedRes.categories.find((c) => c.name === 'Ăn uống')!;
    const invest = seedRes.categories.find((c) => c.name === 'Đầu tư')!;
    const investSub = seedRes.categories.find((c) => c.parentId === invest.id)!;

    // Wrong type under expense parent
    const wrongType = await createCategory(sid, {
      type: 'income',
      name: 'Sub sai loại',
      icon: 'tag',
      parentId: food.id,
    });
    expect(wrongType.status).toBe(422);

    // Nesting two deep under a sub-category
    const tooDeep = await createCategory(sid, {
      type: 'expense',
      name: 'Quá sâu',
      icon: 'tag',
      parentId: investSub.id,
    });
    expect(tooDeep.status).toBe(422);

    // Valid sub-category
    const okRes = await createCategory(sid, {
      type: 'expense',
      name: 'Cà phê',
      icon: 'coffee',
      parentId: food.id,
    });
    expect(okRes.status).toBe(201);
    const created = (await json<{ category: CategoryView }>(okRes)).category;
    expect(created.parentId).toBe(food.id);
    expect(created.type).toBe('expense');
  });

  it('deleting an unused category works; one in use is 409 with the count; with moveTo the entries move', async () => {
    const sid = await memberSid('u-cat-del', 'CatDel');
    await switchOn('u-cat-del');

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 1_000_000 }))
    ).wallet;

    const seeded = await json<CategoriesResponse>(await getCategories(sid));
    const invest = seeded.categories.find((c) => c.name === 'Đầu tư')!;
    const food = seeded.categories.find((c) => c.name === 'Ăn uống')!;
    const transport = seeded.categories.find((c) => c.name === 'Di chuyển')!;
    const shopping = seeded.categories.find((c) => c.name === 'Mua sắm')!;

    // Parent with children -> 409 IN_USE with reason HAS_CHILDREN
    const hasKids = await deleteCategory(invest.id, sid);
    expect(hasKids.status).toBe(409);
    expect(await json<{ error: { code: string; reason: string } }>(hasKids)).toMatchObject({
      error: { code: 'IN_USE', reason: 'HAS_CHILDREN' },
    });

    // Unused category -> 200
    const unusedDel = await deleteCategory(shopping.id, sid);
    expect(unusedDel.status).toBe(200);

    // Insert 2 entries in food
    const today = utcDaysAgo(0);
    await env.DB.prepare(
      'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'tx-del-1',
        'u-cat-del',
        wallet.id,
        'expense',
        50_000,
        food.id,
        today,
        `${today}T01:00:00.000Z`,
        `${today}T01:00:00.000Z`,
        'tx-del-2',
        'u-cat-del',
        wallet.id,
        'expense',
        30_000,
        food.id,
        today,
        `${today}T02:00:00.000Z`,
        `${today}T02:00:00.000Z`,
      )
      .run();

    // In use without moveTo -> 409 IN_USE with count
    const inUse = await deleteCategory(food.id, sid);
    expect(inUse.status).toBe(409);
    expect(await json<{ error: { code: string; count: number } }>(inUse)).toMatchObject({
      error: { code: 'IN_USE', count: 2 },
    });

    // With moveTo -> 200 and entries move
    const movedDel = await deleteCategory(food.id, sid, transport.id);
    expect(movedDel.status).toBe(200);

    const movedRows = await env.DB.prepare(
      'SELECT category_id FROM personal_transactions WHERE id IN (?, ?)',
    )
      .bind('tx-del-1', 'tx-del-2')
      .all<{ category_id: string }>();
    expect(movedRows.results.map((r) => r.category_id)).toEqual([transport.id, transport.id]);

    const afterCats = await json<CategoriesResponse>(await getCategories(sid));
    expect(afterCats.categories.some((c) => c.id === food.id)).toBe(false);
  });

  it('moveTo of the other type is 422', async () => {
    const sid = await memberSid('u-cat-movetype', 'CatMoveType');
    await switchOn('u-cat-movetype');

    const seeded = await json<CategoriesResponse>(await getCategories(sid));
    const food = seeded.categories.find((c) => c.name === 'Ăn uống')!;
    const salary = seeded.categories.find((c) => c.name === 'Lương')!;

    const res = await deleteCategory(food.id, sid, salary.id);
    expect(res.status).toBe(422);

    const selfRes = await deleteCategory(food.id, sid, food.id);
    expect(selfRes.status).toBe(422);
  });

  it('hiding keeps entries pointing at it', async () => {
    const sid = await memberSid('u-cat-hide', 'CatHide');
    await switchOn('u-cat-hide');

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 500_000 }))
    ).wallet;
    const seeded = await json<CategoriesResponse>(await getCategories(sid));
    const food = seeded.categories.find((c) => c.name === 'Ăn uống')!;

    const today = utcDaysAgo(0);
    await env.DB.prepare(
      'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind('tx-hide-1', 'u-cat-hide', wallet.id, 'expense', 25_000, food.id, today, `${today}T01:00:00.000Z`, `${today}T01:00:00.000Z`)
      .run();

    const patchRes = await patchCategory(food.id, sid, { hidden: true });
    expect(patchRes.status).toBe(200);
    const patched = (await json<{ category: CategoryView }>(patchRes)).category;
    expect(patched.hidden).toBe(true);

    const tx = await env.DB.prepare('SELECT category_id FROM personal_transactions WHERE id = ?')
      .bind('tx-hide-1')
      .first<{ category_id: string }>();
    expect(tx?.category_id).toBe(food.id);

    const list = await json<CategoriesResponse>(await getCategories(sid));
    expect(list.categories.find((c) => c.id === food.id)?.hidden).toBe(true);
  });

  it('recentIds orders by use in the last 30 days and ignores older entries', async () => {
    const sid = await memberSid('u-cat-recent', 'CatRecent');
    await switchOn('u-cat-recent');

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 2_000_000 }))
    ).wallet;
    const seeded = await json<CategoriesResponse>(await getCategories(sid));
    const cats = seeded.categories.filter((c) => c.type === 'expense');
    const c0 = cats[0]!;
    const c1 = cats[1]!;
    const c2 = cats[2]!;
    const c3 = cats[3]!;
    const c4 = cats[4]!;
    const c5 = cats[5]!;
    const c6 = cats[6]!;
    const c7 = cats[7]!;

    const dToday = utcDaysAgo(0);
    const d5 = utcDaysAgo(5);
    const d10 = utcDaysAgo(10);
    const d40 = utcDaysAgo(40);

    const insertTx = async (id: string, categoryId: string, date: string, source = 'manual') => {
      await env.DB.prepare(
        'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, category_id, date, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind(id, 'u-cat-recent', wallet.id, 'expense', 10_000, categoryId, date, source, `${date}T00:00:00.000Z`, `${date}T00:00:00.000Z`)
        .run();
    };

    // c1: 3 recent uses
    await insertTx('r-1', c1.id, d10);
    await insertTx('r-2', c1.id, d10);
    await insertTx('r-3', c1.id, d10);

    // c2: 2 recent uses (latest dToday)
    await insertTx('r-4', c2.id, d10);
    await insertTx('r-5', c2.id, dToday);

    // c0: 2 recent uses (latest d5 -> behind c2)
    await insertTx('r-6', c0.id, d10);
    await insertTx('r-7', c0.id, d5);

    // c3, c4, c5: 1 recent use each (c3 dToday, c4 d5, c5 d10)
    await insertTx('r-8', c3.id, dToday);
    await insertTx('r-9', c4.id, d5);
    await insertTx('r-10', c5.id, d10);

    // c6: 1 recent use older than c5? same d10, actually let's give c6 an older-than-30d entry only + 1 non-manual
    await insertTx('r-11', c6.id, d40);
    await insertTx('r-12', c6.id, d40);
    await insertTx('r-13', c6.id, dToday, 'import');

    // c7: 1 use at d40 (ignored) + 1 use at d10? No, leave c7 at d40 so we have exactly 6 recent
    await insertTx('r-14', c7.id, d40);

    const res = await json<CategoriesResponse>(await getCategories(sid));
    expect(res.recentIds).toEqual([c1.id, c2.id, c0.id, c3.id, c4.id, c5.id]);
  });

  it('tags: rename clash is 409, delete removes links', async () => {
    const sid = await memberSid('u-tags', 'TagsUser');
    await switchOn('u-tags');

    const wallet = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 500_000 }))
    ).wallet;

    const today = utcDaysAgo(0);
    await env.DB.prepare(
      'INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        'tx-t-1',
        'u-tags',
        wallet.id,
        'expense',
        10_000,
        today,
        `${today}T01:00:00.000Z`,
        `${today}T01:00:00.000Z`,
        'tx-t-2',
        'u-tags',
        wallet.id,
        'expense',
        20_000,
        today,
        `${today}T02:00:00.000Z`,
        `${today}T02:00:00.000Z`,
      )
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
    )
      .bind(
        'tag-binance',
        'u-tags',
        'Binance',
        `${today}T01:00:00.000Z`,
        'tag-okx',
        'u-tags',
        'okx',
        `${today}T01:00:00.000Z`,
      )
      .run();

    await env.DB.prepare(
      'INSERT INTO personal_transaction_tags (transaction_id, tag_id) VALUES (?, ?), (?, ?), (?, ?)',
    )
      .bind('tx-t-1', 'tag-binance', 'tx-t-2', 'tag-binance', 'tx-t-1', 'tag-okx')
      .run();

    const list1 = await json<{ tags: TagView[] }>(await getTags(sid));
    expect(list1.tags).toEqual([
      { id: 'tag-binance', name: 'Binance', useCount: 2 },
      { id: 'tag-okx', name: 'okx', useCount: 1 },
    ]);

    // Case-insensitive clash -> 409 CONFLICT
    const clashRes = await patchTag('tag-okx', sid, { name: 'BINANCE' });
    expect(clashRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(clashRes)).error.code).toBe('CONFLICT');

    // Self-casing rename -> 200
    const okRename = await patchTag('tag-okx', sid, { name: 'OKX' });
    expect(okRename.status).toBe(200);
    expect((await json<{ tag: TagView }>(okRename)).tag).toEqual({
      id: 'tag-okx',
      name: 'OKX',
      useCount: 1,
    });

    // Delete removes tag and its links
    const delRes = await deleteTag('tag-binance', sid);
    expect(delRes.status).toBe(200);

    const links = await env.DB.prepare(
      'SELECT * FROM personal_transaction_tags WHERE tag_id = ?',
    )
      .bind('tag-binance')
      .all();
    expect(links.results).toHaveLength(0);

    const list2 = await json<{ tags: TagView[] }>(await getTags(sid));
    expect(list2.tags).toEqual([{ id: 'tag-okx', name: 'OKX', useCount: 1 }]);
  });

  it('another account gets 404 for every :id route, and its GET never shows these rows', async () => {
    const sid1 = await memberSid('u-own-1', 'Owner1');
    const sid2 = await memberSid('u-own-2', 'Owner2');
    await switchOn('u-own-1');
    await switchOn('u-own-2');

    const c1Res = await createCategory(sid1, {
      type: 'expense',
      name: 'Riêng tư',
      icon: 'lock',
    });
    expect(c1Res.status).toBe(201);
    const cat1 = (await json<{ category: CategoryView }>(c1Res)).category;

    const c2List = await json<CategoriesResponse>(await getCategories(sid2));
    expect(c2List.categories.some((c) => c.id === cat1.id)).toBe(false);
    const cat2 = c2List.categories.find((c) => c.type === 'expense')!;

    await env.DB.prepare(
      'INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind('tag-priv-1', 'u-own-1', 'PrivateTag', '2026-11-15T00:00:00.000Z')
      .run();

    const t2List = await json<{ tags: TagView[] }>(await getTags(sid2));
    expect(t2List.tags).toEqual([]);

    expect((await patchCategory(cat1.id, sid2, { name: 'Hack' })).status).toBe(404);
    expect((await deleteCategory(cat1.id, sid2)).status).toBe(404);
    expect((await deleteCategory(cat2.id, sid2, cat1.id)).status).toBe(404);
    expect((await patchTag('tag-priv-1', sid2, { name: 'Hack' })).status).toBe(404);
    expect((await deleteTag('tag-priv-1', sid2)).status).toBe(404);
  });

  it('switch off: 403 on all routes', async () => {
    const sid = await memberSid('u-cat-off', 'CatOff');
    await switchOn('u-cat-off', 0);

    expect((await getCategories(sid)).status).toBe(403);
    expect((await createCategory(sid, { type: 'expense', name: 'Test', icon: 'tag' })).status).toBe(403);
    expect((await patchCategory('any-id', sid, { name: 'Test' })).status).toBe(403);
    expect((await deleteCategory('any-id', sid)).status).toBe(403);
    expect((await getTags(sid)).status).toBe(403);
    expect((await patchTag('any-id', sid, { name: 'Test' })).status).toBe(403);
    expect((await deleteTag('any-id', sid)).status).toBe(403);
  });
});
