import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  ListResponse,
  TagView,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const patchCategory = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/categories/${encodeURIComponent(id)}`, sid, body, 'PATCH');
const getTags = (sid: string) => call('/api/me/personal/tags', as(sid));
const patchTag = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/tags/${encodeURIComponent(id)}`, sid, body, 'PATCH');
const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);
const patchEntry = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/transactions/${encodeURIComponent(id)}`, sid, body, 'PATCH');
const listTransactions = (sid: string, query: string) =>
  call(`/api/me/personal/transactions?${query}`, as(sid));

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal entries and list fixes', () => {
  it('PATCH allows a hidden category when it is the entry current category, and rejects another hidden category', async () => {
    const sid = await memberSid('u-fix-1', 'Fix1');
    await switchOn('u-fix-1');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví chính', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
    const transport = cats.find((c) => c.type === 'expense' && c.name === 'Di chuyển')!;

    const created = await json<EntriesResponse>(
      await createEntry(sid, {
        walletId: wallet.id,
        type: 'expense',
        amount: 45_000,
        categoryId: food.id,
        date: '2026-11-16',
        note: 'Bữa trưa',
      }),
    );
    const entryId = created.entries[0]!.id;

    // Hide both categories
    expect((await patchCategory(food.id, sid, { hidden: true })).status).toBe(200);
    expect((await patchCategory(transport.id, sid, { hidden: true })).status).toBe(200);

    // Editing the entry while keeping its stored hidden category succeeds
    const keepRes = await patchEntry(entryId, sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 55_000,
      categoryId: food.id,
      date: '2026-11-16',
      note: 'Bữa trưa (sửa)',
    });
    expect(keepRes.status).toBe(200);
    const updated = await json<EntriesResponse>(keepRes);
    expect(updated.entries[0]!.amount).toBe(55_000);
    expect(updated.entries[0]!.categoryId).toBe(food.id);

    // Switching to a different hidden category is still rejected with 422
    const switchRes = await patchEntry(entryId, sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 55_000,
      categoryId: transport.id,
      date: '2026-11-16',
    });
    expect(switchRes.status).toBe(422);
  });

  it('PATCH /me/personal/tags/:id caps tag rename at 30 chars (422 above, 200 at 30)', async () => {
    const sid = await memberSid('u-fix-2', 'Fix2');
    await switchOn('u-fix-2');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví chính', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    await createEntry(sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 10_000,
      categoryId: food.id,
      date: '2026-11-16',
      tags: ['old-tag'],
    });

    const { tags } = await json<{ tags: TagView[] }>(await getTags(sid));
    const tagId = tags[0]!.id;

    const tooLong = 'a'.repeat(31);
    const badRes = await patchTag(tagId, sid, { name: tooLong });
    expect(badRes.status).toBe(422);

    const exact30 = 'b'.repeat(30);
    const okRes = await patchTag(tagId, sid, { name: exact30 });
    expect(okRes.status).toBe(200);
    const okData = await json<{ tag: TagView }>(okRes);
    expect(okData.tag.name).toBe(exact30);
  });

  it('GET /me/personal/transactions folds Vietnamese case in note search and computes totals after filtering', async () => {
    const sid = await memberSid('u-fix-3', 'Fix3');
    await switchOn('u-fix-3');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví chính', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    await createEntry(sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 45_000,
      categoryId: food.id,
      date: '2026-11-16',
      note: 'Ăn trưa',
    });
    await createEntry(sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 30_000,
      categoryId: food.id,
      date: '2026-11-16',
      note: 'Cà phê',
    });

    const res = await listTransactions(sid, `month=2026-11&q=${encodeURIComponent('ăn')}`);
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]!.kind).toBe('entry');
    if (body.rows[0]!.kind === 'entry') {
      expect(body.rows[0]!.entry.note).toBe('Ăn trưa');
    }
    expect(body.totals).toEqual([{ currency: 'VND', spent: 45_000, income: 0 }]);
  });

  it('GET /me/personal/transactions with parent categoryId includes subcategory entries', async () => {
    const sid = await memberSid('u-fix-4', 'Fix4');
    await switchOn('u-fix-4');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví chính', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const invest = cats.find((c) => c.name === 'Phí & lệ phí' && c.parentId === null)!;
    const stock = cats.find((c) => c.name === 'Thuế' && c.parentId === invest.id)!;

    await createEntry(sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 100_000,
      categoryId: stock.id,
      date: '2026-11-16',
      note: 'Thuế TNCN',
    });

    const res = await listTransactions(sid, `month=2026-11&categoryId=${encodeURIComponent(invest.id)}`);
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);
    expect(body.rows).toHaveLength(1);
    if (body.rows[0]!.kind === 'entry') {
      expect(body.rows[0]!.entry.categoryId).toBe(stock.id);
    }
  });
});
