import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  ReportCategoryDrilldown,
  ReportData,
  TagView,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getReport = (sid: string, query = '') =>
  call(`/api/me/personal/report${query}`, as(sid));

const getCategoryDrilldown = (sid: string, categoryId: string, query = '') =>
  call(`/api/me/personal/report/category/${encodeURIComponent(categoryId)}${query}`, as(sid));

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const getTags = (sid: string) => call('/api/me/personal/tags', as(sid));
const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('personal report tagId filter', () => {
  it('server report honours tagId', async () => {
    const sid = await memberSid('u-rep-tag', 'TagReporter');
    await switchOn('u-rep-tag');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 5_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;

    const catsRes = await json<CategoriesResponse>(await getCategories(sid));
    const foodCat = catsRes.categories.find((c) => c.type === 'expense')!;

    await createEntry(sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 250_000,
      categoryId: foodCat.id,
      date: '2026-11-10',
      tags: ['Mua nhà'],
    });

    await createEntry(sid, {
      walletId: wallet.id,
      type: 'expense',
      amount: 100_000,
      categoryId: foodCat.id,
      date: '2026-11-11',
      tags: ['Cà phê'],
    });

    const tagsRes = await json<{ tags: TagView[] }>(await getTags(sid));
    const houseTag = tagsRes.tags.find((t) => t.name === 'Mua nhà')!;

    const unfiltered = await json<ReportData>(
      await getReport(sid, '?mode=month&month=2026-11&today=2026-11-28'),
    );
    expect(unfiltered.totals.spent).toBe(350_000);

    const filteredRes = await getReport(
      sid,
      `?mode=month&month=2026-11&today=2026-11-28&tagId=${encodeURIComponent(houseTag.id)}`,
    );
    expect(filteredRes.status).toBe(200);
    const filtered = await json<ReportData>(filteredRes);
    expect(filtered.totals.spent).toBe(250_000);
    expect(filtered.countedCount).toBe(1);
    expect(filtered.tags.expense.map((t) => t.tagId)).toEqual([houseTag.id]);

    const drillRes = await getCategoryDrilldown(
      sid,
      foodCat.id,
      `?mode=month&month=2026-11&today=2026-11-28&tagId=${encodeURIComponent(houseTag.id)}`,
    );
    expect(drillRes.status).toBe(200);
    const drill = await json<ReportCategoryDrilldown>(drillRes);
    expect(drill.total).toBe(250_000);
    expect(drill.rows).toHaveLength(1);
  });
});
