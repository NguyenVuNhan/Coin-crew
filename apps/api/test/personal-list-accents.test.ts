import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  ListResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getList = (sid: string | null, query = '') =>
  call(`/api/me/personal/transactions${query}`, sid ? as(sid) : {});

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal list accent-insensitive note search', () => {
  it('matches notes ignoring accents and returns matching rows', async () => {
    const sid = await memberSid('u-accents-1', 'AccentsUser');
    await switchOn('u-accents-1');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const entry = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 35_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Cà phê sữa',
        }),
      )
    ).entries[0]!;

    const resMatch = await getList(sid, '?month=2026-11&q=ca%20phe');
    expect(resMatch.status).toBe(200);
    const bodyMatch = await json<ListResponse>(resMatch);
    expect(bodyMatch.rows).toHaveLength(1);
    expect(bodyMatch.rows[0]!.kind).toBe('entry');
    if (bodyMatch.rows[0]!.kind === 'entry') {
      expect(bodyMatch.rows[0]!.entry.id).toBe(entry.id);
      expect(bodyMatch.rows[0]!.entry.note).toBe('Cà phê sữa');
    }

    const resNoMatch = await getList(sid, '?month=2026-11&q=tra');
    expect(resNoMatch.status).toBe(200);
    const bodyNoMatch = await json<ListResponse>(resNoMatch);
    expect(bodyNoMatch.rows).toHaveLength(0);
  });
});
