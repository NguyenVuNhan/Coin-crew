import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  listFromCopy,
  type AssetView,
  type CategoriesResponse,
  type CategoryView,
  type ListResponse,
  type SyncResponse,
  type TagView,
  type WalletDetailResponse,
  type WalletDetailsResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

/**
 * The browser's saved copy (sync rows + listFromCopy) must give exactly the rows the list endpoint gives,
 * so /transactions doesn't jump when it switches from the server to the copy (#133).
 */
const TODAY = '2026-11-19';
const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

afterEach(async () => {
  for (const t of [
    'personal_sync_deletions',
    'personal_sync_state',
    'personal_transaction_tags',
    'personal_transactions',
    'personal_tags',
    'personal_assets',
    'personal_categories',
    'personal_wallet_settings',
    'personal_wallets',
  ]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
});

async function fullSync(sid: string): Promise<SyncResponse> {
  const first = await json<SyncResponse>(await call('/api/me/personal/sync', as(sid)));
  let cursor = first.cursor;
  while (cursor) {
    const next = await json<SyncResponse>(
      await call(`/api/me/personal/sync?cursorV=${cursor.v}&cursorId=${encodeURIComponent(cursor.id)}`, as(sid)),
    );
    first.entries.push(...next.entries);
    cursor = next.cursor;
  }
  return first;
}

describe('saved copy parity with the list endpoint', () => {
  it('gives the same rows for months, ranges and every filter', async () => {
    const userId = 'u-sync-parity';
    const sid = await memberSid(userId, 'Parity');
    await switchOn(userId);

    const main = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Tiền mặt', startAmount: 1_000_000, startDate: '2026-10-01' }))
    ).wallet;
    const late = (
      await json<WalletDetailResponse>(await addWallet(sid, { name: 'Thẻ', startAmount: 0, startDate: '2026-11-15' }))
    ).wallet;
    const inv = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Đầu tư', currency: 'VND', kind: 'investment', startAmount: 50_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const btc = (
      await json<{ asset: AssetView }>(
        await postJson('/api/me/personal/assets', sid, { name: 'Bitcoin', unit: 'BTC', groupName: 'Crypto', decimals: 8 }),
      )
    ).asset;

    const cats = (await json<CategoriesResponse>(await call('/api/me/personal/categories', as(sid)))).categories;
    const parent = cats.find((c) => c.type === 'expense' && c.parentId === null && cats.some((s) => s.parentId === c.id))!;
    const child = cats.find((c) => c.parentId === parent.id)!;
    const other = cats.find((c) => c.type === 'expense' && c.id !== parent.id && c.parentId !== parent.id)!;

    const entry = (body: Record<string, unknown>) => postJson('/api/me/personal/transactions', sid, body);
    expect((await entry({ type: 'expense', walletId: main.id, amount: 45_000, categoryId: parent.id, date: '2026-11-10', time: '08:00', note: 'Cà phê sữa', tags: ['an', 'sang'] })).status).toBe(201);
    expect((await entry({ type: 'expense', walletId: main.id, amount: 60_000, categoryId: child.id, date: '2026-11-10', note: 'Phở bò', tags: ['an'] })).status).toBe(201);
    expect((await entry({ type: 'expense', walletId: late.id, amount: 20_000, categoryId: other.id, date: '2026-11-03', note: 'Trước ngày bắt đầu' })).status).toBe(201);
    expect((await entry({ type: 'income', walletId: main.id, amount: 5_000_000, categoryId: cats.find((c) => c.type === 'income')!.id, date: '2026-10-28', note: 'Lương' })).status).toBe(201);
    expect((await entry({ type: 'transfer', fromWalletId: main.id, toWalletId: late.id, amountSent: 200_000, date: '2026-11-12', note: 'Nạp thẻ' })).status).toBe(201);
    expect((await entry({ type: 'buy', walletId: inv.id, assetId: btc.id, quantity: 1_000_000, amount: 10_000_000, date: '2026-11-11', note: 'DCA' })).status).toBe(201);

    const ledger = await json<{ tripId: string; ownerPid: string }>(await call('/api/me/ledger', as(sid)));
    const { participantId: lanPid } = await json<{ participantId: string }>(await postJson('/api/me/ledger/people', sid, { name: 'Lan' }));
    for (const [description, spentOn] of [['Bún chả', '2026-11-12'], ['Cà phê với Lan', '2026-11-14'], ['Xem phim', '2026-10-20']] as const) {
      const res = await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
        description,
        amount: 100_000,
        spentOn,
        payerId: ledger.ownerPid,
        mode: 'amounts',
        entries: [
          { participantId: ledger.ownerPid, value: 40_000 },
          { participantId: lanPid, value: 60_000 },
        ],
      });
      expect(res.status).toBe(201);
    }

    const sync = await fullSync(sid);
    const wallets = (await json<WalletDetailsResponse>(await call('/api/me/personal/wallets', as(sid)))).wallets;
    const categories: CategoryView[] = (await json<CategoriesResponse>(await call('/api/me/personal/categories', as(sid)))).categories;
    const tags = (await json<{ tags: TagView[] }>(await call('/api/me/personal/tags', as(sid)))).tags;
    const anTag = tags.find((t) => t.name === 'an')!;
    const rows = { entries: sync.entries, ledger: sync.ledger?.rows ?? [] };

    const queries: Record<string, string>[] = [
      { month: '2026-11' },
      { month: '2026-10' },
      { from: '2026-10-25', to: '2026-11-12' },
      { month: '2026-11', type: 'transfer' },
      { month: '2026-11', type: 'trade' },
      { month: '2026-11', type: 'person' },
      { month: '2026-11', type: 'expense' },
      { month: '2026-11', categoryId: parent.id },
      { month: '2026-11', tagId: anTag.id },
      { month: '2026-11', walletId: main.id },
      { month: '2026-11', walletId: late.id },
      { month: '2026-11', q: 'ca phe' },
      { from: '2026-10-01', to: '2026-11-19', q: 'CÀ PHÊ' },
    ];
    for (const q of queries) {
      const server = await json<ListResponse>(
        await call(`/api/me/personal/transactions?${new URLSearchParams(q).toString()}`, as(sid)),
      );
      const copy = listFromCopy(rows, q, { wallets, categories, tags }, TODAY);
      expect(server.rows.length, JSON.stringify(q)).toBeGreaterThan(0);
      expect(copy, JSON.stringify(q)).toEqual(server.rows);
    }
  });
});
