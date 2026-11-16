import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  CategoryView,
  EntriesResponse,
  ListResponse,
  TagView,
  WalletDetailResponse,
  WalletDetailsResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

function request(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  sid: string | null,
  body?: unknown,
): Promise<Response> {
  if (method === 'GET' || method === 'DELETE') {
    return call(path, {
      method,
      headers: sid ? { Cookie: `sid=${sid}` } : {},
    });
  }
  return postJson(path, sid, body, method);
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal money guard sweep — auth, switch, and cross-account privacy', () => {
  it('enforces 401 signed-out, 403 switch-off, 404/422 cross-account, and leaves A untouched', async () => {
    // --- Setup Account A (switched on) ---
    const sidA = await memberSid('u-sweep-a', 'UserA');
    await switchOn('u-sweep-a', 1);

    const walletVndRes = await postJson('/api/me/personal/wallets', sidA, {
      name: 'A VND',
      currency: 'VND',
      startAmount: 5_000_000,
      startDate: '2026-11-01',
    });
    expect(walletVndRes.status).toBe(201);
    const walletVnd = (await json<WalletDetailResponse>(walletVndRes)).wallet;

    const walletUsdtRes = await addWallet(sidA, {
      name: 'A USDT',
      currency: 'USDT',
      kind: 'investment',
      startAmount: 100_000,
      startCostVnd: 25_000_000,
      startDate: '2026-11-01',
    });
    expect(walletUsdtRes.status).toBe(201);
    const walletUsdt = (await json<WalletDetailResponse>(walletUsdtRes)).wallet;

    // Trigger starter categories + create a custom category for A
    expect((await call('/api/me/personal/categories', as(sidA))).status).toBe(200);
    const catARes = await postJson('/api/me/personal/categories', sidA, {
      type: 'expense',
      name: 'SweepCatA',
      icon: 'utensils',
    });
    expect(catARes.status).toBe(201);
    const catA = (await json<{ category: CategoryView }>(catARes)).category;

    const expenseARes = await postJson('/api/me/personal/transactions', sidA, {
      type: 'expense',
      walletId: walletVnd.id,
      amount: 120_000,
      categoryId: catA.id,
      date: '2026-11-16',
      note: 'SweepExpenseA',
      tags: ['sweep-tag-a'],
    });
    expect(expenseARes.status).toBe(201);
    const expenseA = (await json<EntriesResponse>(expenseARes)).entries[0]!;

    const tagsARes = await call('/api/me/personal/tags', as(sidA));
    expect(tagsARes.status).toBe(200);
    const tagA = (await json<{ tags: TagView[] }>(tagsARes)).tags.find(
      (t) => t.name === 'sweep-tag-a',
    )!;
    expect(tagA).toBeDefined();

    const transferARes = await postJson('/api/me/personal/transactions', sidA, {
      type: 'transfer',
      fromWalletId: walletVnd.id,
      toWalletId: walletUsdt.id,
      amountSent: 2_500_000,
      amountReceived: 10_000,
      date: '2026-11-16',
      note: 'SweepTransferA',
    });
    expect(transferARes.status).toBe(201);
    const transferEntriesA = (await json<EntriesResponse>(transferARes)).entries;
    const transferOutA = transferEntriesA.find((e) => e.type === 'transfer_out')!;
    const transferInA = transferEntriesA.find((e) => e.type === 'transfer_in')!;
    const transferIdA = transferOutA.transferId!;

    // --- Setup Account B (switched on) ---
    const sidB = await memberSid('u-sweep-b', 'UserB');
    await switchOn('u-sweep-b', 1);

    const walletBRes = await postJson('/api/me/personal/wallets', sidB, {
      name: 'B VND',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-11-01',
    });
    expect(walletBRes.status).toBe(201);
    const walletB = (await json<WalletDetailResponse>(walletBRes)).wallet;

    const walletB2Res = await addWallet(sidB, {
      name: 'B VND 2',
      currency: 'VND',
      startAmount: 0,
      startDate: '2026-11-01',
    });
    expect(walletB2Res.status).toBe(201);
    const walletB2 = (await json<WalletDetailResponse>(walletB2Res)).wallet;

    expect((await call('/api/me/personal/categories', as(sidB))).status).toBe(200);
    const catBRes = await postJson('/api/me/personal/categories', sidB, {
      type: 'expense',
      name: 'SweepCatB',
      icon: 'coffee',
    });
    expect(catBRes.status).toBe(201);
    const catB = (await json<{ category: CategoryView }>(catBRes)).category;

    // --- Setup Account C (switch off) ---
    const sidC = await memberSid('u-sweep-c', 'UserC');
    await switchOn('u-sweep-c', 0);

    // --- Snapshot Account A before sweep ---
    const walletsBeforeRes = await call('/api/me/personal/wallets', as(sidA));
    expect(walletsBeforeRes.status).toBe(200);
    const walletsBefore = await json<WalletDetailsResponse>(walletsBeforeRes);

    const txBeforeRes = await call('/api/me/personal/transactions?month=2026-11', as(sidA));
    expect(txBeforeRes.status).toBe(200);
    const txBefore = await json<ListResponse>(txBeforeRes);

    // --- 1. Signed out (401) and Switch off (403) across every route ---
    const authAndSwitchCases: Array<{
      label: string;
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      body?: unknown;
    }> = [
      { label: 'GET /me/personal', method: 'GET', path: '/api/me/personal' },
      { label: 'GET /wallets', method: 'GET', path: '/api/me/personal/wallets' },
      {
        label: 'POST /wallets',
        method: 'POST',
        path: '/api/me/personal/wallets',
        body: { name: 'W', startAmount: 0 },
      },
      {
        label: 'POST /wallets/add',
        method: 'POST',
        path: '/api/me/personal/wallets/add',
        body: { name: 'W2', startAmount: 0 },
      },
      {
        label: 'PATCH /wallets/:id',
        method: 'PATCH',
        path: `/api/me/personal/wallets/${walletVnd.id}`,
        body: { name: 'Renamed' },
      },
      {
        label: 'DELETE /wallets/:id',
        method: 'DELETE',
        path: `/api/me/personal/wallets/${walletVnd.id}`,
      },
      {
        label: 'POST /wallets/reorder',
        method: 'POST',
        path: '/api/me/personal/wallets/reorder',
        body: { ids: [walletVnd.id] },
      },
      { label: 'GET /categories', method: 'GET', path: '/api/me/personal/categories' },
      {
        label: 'POST /categories',
        method: 'POST',
        path: '/api/me/personal/categories',
        body: { type: 'expense', name: 'C', icon: 'tag' },
      },
      {
        label: 'PATCH /categories/:id',
        method: 'PATCH',
        path: `/api/me/personal/categories/${catA.id}`,
        body: { name: 'Renamed' },
      },
      {
        label: 'DELETE /categories/:id',
        method: 'DELETE',
        path: `/api/me/personal/categories/${catA.id}`,
      },
      {
        label: 'DELETE /categories/:id?moveTo=',
        method: 'DELETE',
        path: `/api/me/personal/categories/${catA.id}?moveTo=${catB.id}`,
      },
      { label: 'GET /tags', method: 'GET', path: '/api/me/personal/tags' },
      {
        label: 'PATCH /tags/:id',
        method: 'PATCH',
        path: `/api/me/personal/tags/${tagA.id}`,
        body: { name: 'renamed' },
      },
      {
        label: 'DELETE /tags/:id',
        method: 'DELETE',
        path: `/api/me/personal/tags/${tagA.id}`,
      },
      {
        label: 'POST /transactions',
        method: 'POST',
        path: '/api/me/personal/transactions',
        body: {
          type: 'expense',
          walletId: walletVnd.id,
          amount: 10_000,
          categoryId: catA.id,
          date: '2026-11-16',
        },
      },
      {
        label: 'PATCH /transactions/:id',
        method: 'PATCH',
        path: `/api/me/personal/transactions/${expenseA.id}`,
        body: {
          type: 'expense',
          walletId: walletVnd.id,
          amount: 10_000,
          categoryId: catA.id,
          date: '2026-11-16',
        },
      },
      {
        label: 'DELETE /transactions/:id',
        method: 'DELETE',
        path: `/api/me/personal/transactions/${expenseA.id}`,
      },
      {
        label: 'POST /transactions/restore',
        method: 'POST',
        path: '/api/me/personal/transactions/restore',
        body: {
          entries: [
            {
              id: expenseA.id,
              walletId: walletVnd.id,
              type: 'expense',
              amount: 10_000,
              categoryId: catA.id,
              date: '2026-11-16',
              createdAt: '2026-11-16T00:00:00.000Z',
            },
          ],
        },
      },
      {
        label: 'GET /transactions?month=',
        method: 'GET',
        path: '/api/me/personal/transactions?month=2026-11',
      },
      {
        label: 'GET /summary',
        method: 'GET',
        path: '/api/me/personal/summary?month=2026-11',
      },
    ];

    for (const tc of authAndSwitchCases) {
      const resAnon = await request(tc.method, tc.path, null, tc.body);
      expect(resAnon.status, `anon ${tc.label}`).toBe(401);

      const resC = await request(tc.method, tc.path, sidC, tc.body);
      expect(resC.status, `switch-off C ${tc.label}`).toBe(403);
    }

    // --- 2. Cross-account privacy: B using A's IDs in path, query, or body ---
    const crossAccountMutationCases: Array<{
      label: string;
      method: 'POST' | 'PATCH' | 'DELETE';
      path: string;
      body?: unknown;
      expectedStatus: 404 | 422;
    }> = [
      {
        label: 'PATCH /wallets/:id (A wallet)',
        method: 'PATCH',
        path: `/api/me/personal/wallets/${walletVnd.id}`,
        body: { name: 'Hijacked' },
        expectedStatus: 404,
      },
      {
        label: 'DELETE /wallets/:id (A wallet)',
        method: 'DELETE',
        path: `/api/me/personal/wallets/${walletVnd.id}`,
        expectedStatus: 404,
      },
      {
        label: 'POST /wallets/reorder (only A wallet)',
        method: 'POST',
        path: '/api/me/personal/wallets/reorder',
        body: { ids: [walletVnd.id] },
        expectedStatus: 422,
      },
      {
        label: 'POST /wallets/reorder (B + A wallet)',
        method: 'POST',
        path: '/api/me/personal/wallets/reorder',
        body: { ids: [walletB.id, walletVnd.id] },
        expectedStatus: 422,
      },
      {
        label: 'POST /categories (A parentId)',
        method: 'POST',
        path: '/api/me/personal/categories',
        body: { type: 'expense', name: 'HijackChild', icon: 'tag', parentId: catA.id },
        expectedStatus: 422,
      },
      {
        label: 'PATCH /categories/:id (A category)',
        method: 'PATCH',
        path: `/api/me/personal/categories/${catA.id}`,
        body: { name: 'Hijacked' },
        expectedStatus: 404,
      },
      {
        label: 'DELETE /categories/:id (A category)',
        method: 'DELETE',
        path: `/api/me/personal/categories/${catA.id}`,
        expectedStatus: 404,
      },
      {
        label: 'DELETE /categories/:id?moveTo= (A category -> B category)',
        method: 'DELETE',
        path: `/api/me/personal/categories/${catA.id}?moveTo=${catB.id}`,
        expectedStatus: 404,
      },
      {
        label: 'DELETE /categories/:id?moveTo= (B category -> A category)',
        method: 'DELETE',
        path: `/api/me/personal/categories/${catB.id}?moveTo=${catA.id}`,
        expectedStatus: 404,
      },
      {
        label: 'PATCH /tags/:id (A tag)',
        method: 'PATCH',
        path: `/api/me/personal/tags/${tagA.id}`,
        body: { name: 'hijacked-tag' },
        expectedStatus: 404,
      },
      {
        label: 'DELETE /tags/:id (A tag)',
        method: 'DELETE',
        path: `/api/me/personal/tags/${tagA.id}`,
        expectedStatus: 404,
      },
      {
        label: 'POST /transactions (expense with A walletId)',
        method: 'POST',
        path: '/api/me/personal/transactions',
        body: {
          type: 'expense',
          walletId: walletVnd.id,
          amount: 10_000,
          categoryId: catB.id,
          date: '2026-11-16',
        },
        expectedStatus: 404,
      },
      {
        label: 'POST /transactions (expense with A categoryId)',
        method: 'POST',
        path: '/api/me/personal/transactions',
        body: {
          type: 'expense',
          walletId: walletB.id,
          amount: 10_000,
          categoryId: catA.id,
          date: '2026-11-16',
        },
        expectedStatus: 404,
      },
      {
        label: 'POST /transactions (transfer with A toWalletId)',
        method: 'POST',
        path: '/api/me/personal/transactions',
        body: {
          type: 'transfer',
          fromWalletId: walletB.id,
          toWalletId: walletVnd.id,
          amountSent: 10_000,
          date: '2026-11-16',
        },
        expectedStatus: 404,
      },
      {
        label: 'POST /transactions (transfer with A fromWalletId)',
        method: 'POST',
        path: '/api/me/personal/transactions',
        body: {
          type: 'transfer',
          fromWalletId: walletVnd.id,
          toWalletId: walletB.id,
          amountSent: 10_000,
          date: '2026-11-16',
        },
        expectedStatus: 404,
      },
      {
        label: 'PATCH /transactions/:id (A expense)',
        method: 'PATCH',
        path: `/api/me/personal/transactions/${expenseA.id}`,
        body: {
          type: 'expense',
          walletId: walletB.id,
          amount: 10_000,
          categoryId: catB.id,
          date: '2026-11-16',
        },
        expectedStatus: 404,
      },
      {
        label: 'PATCH /transactions/:id (A transfer)',
        method: 'PATCH',
        path: `/api/me/personal/transactions/${transferOutA.id}`,
        body: {
          type: 'transfer',
          fromWalletId: walletB.id,
          toWalletId: walletB2.id,
          amountSent: 10_000,
          date: '2026-11-16',
        },
        expectedStatus: 404,
      },
      {
        label: 'DELETE /transactions/:id (A expense)',
        method: 'DELETE',
        path: `/api/me/personal/transactions/${expenseA.id}`,
        expectedStatus: 404,
      },
      {
        label: 'DELETE /transactions/:id (A transfer)',
        method: 'DELETE',
        path: `/api/me/personal/transactions/${transferOutA.id}`,
        expectedStatus: 404,
      },
      {
        label: 'POST /transactions/restore (A entry id)',
        method: 'POST',
        path: '/api/me/personal/transactions/restore',
        body: {
          entries: [
            {
              id: expenseA.id,
              walletId: walletB.id,
              type: 'expense',
              amount: 10_000,
              categoryId: catB.id,
              date: '2026-11-16',
              createdAt: '2026-11-16T00:00:00.000Z',
            },
          ],
        },
        expectedStatus: 404,
      },
      {
        label: 'POST /transactions/restore (A walletId)',
        method: 'POST',
        path: '/api/me/personal/transactions/restore',
        body: {
          entries: [
            {
              id: 'b-restore-fresh-1',
              walletId: walletVnd.id,
              type: 'expense',
              amount: 10_000,
              categoryId: catB.id,
              date: '2026-11-16',
              createdAt: '2026-11-16T00:00:00.000Z',
            },
          ],
        },
        expectedStatus: 404,
      },
      {
        label: 'POST /transactions/restore (A categoryId)',
        method: 'POST',
        path: '/api/me/personal/transactions/restore',
        body: {
          entries: [
            {
              id: 'b-restore-fresh-2',
              walletId: walletB.id,
              type: 'expense',
              amount: 10_000,
              categoryId: catA.id,
              date: '2026-11-16',
              createdAt: '2026-11-16T00:00:00.000Z',
            },
          ],
        },
        expectedStatus: 404,
      },
    ];

    for (const tc of crossAccountMutationCases) {
      const res = await request(tc.method, tc.path, sidB, tc.body);
      expect(res.status, `B ${tc.label}`).toBe(tc.expectedStatus);
    }

    // --- 3. B's GET/list/summary routes return 200 with none of A's IDs ---
    const idsOfA = [
      walletVnd.id,
      walletUsdt.id,
      catA.id,
      tagA.id,
      expenseA.id,
      transferOutA.id,
      transferInA.id,
      transferIdA,
    ];

    const getPathsForB = [
      '/api/me/personal/wallets',
      '/api/me/personal/categories',
      '/api/me/personal/tags',
      '/api/me/personal/transactions?month=2026-11',
      `/api/me/personal/transactions?month=2026-11&walletId=${encodeURIComponent(walletVnd.id)}`,
      `/api/me/personal/transactions?month=2026-11&categoryId=${encodeURIComponent(catA.id)}`,
      `/api/me/personal/transactions?month=2026-11&tagId=${encodeURIComponent(tagA.id)}`,
      '/api/me/personal/summary?month=2026-11',
    ];

    for (const path of getPathsForB) {
      const res = await call(path, as(sidB));
      expect(res.status, `B GET ${path}`).toBe(200);
      const bodyText = await res.text();
      for (const aId of idsOfA) {
        expect(bodyText, `B GET ${path} leaked ${aId}`).not.toContain(aId);
      }
    }

    // --- 4. Assert Account A's data is completely unchanged ---
    const walletsAfterRes = await call('/api/me/personal/wallets', as(sidA));
    expect(walletsAfterRes.status).toBe(200);
    const walletsAfter = await json<WalletDetailsResponse>(walletsAfterRes);
    expect(walletsAfter).toEqual(walletsBefore);

    const txAfterRes = await call('/api/me/personal/transactions?month=2026-11', as(sidA));
    expect(txAfterRes.status).toBe(200);
    const txAfter = await json<ListResponse>(txAfterRes);
    expect(txAfter).toEqual(txBefore);
  });
});
