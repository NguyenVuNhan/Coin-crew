import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  PlannedItemsResponse,
  WalletDetailResponse,
} from '@cc/core';
import { runRecurring } from '../src/personal/recurringJob';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, seedLegacyStarters, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

function request(
  method: 'GET' | 'POST',
  path: string,
  sid: string | null,
  body?: unknown,
): Promise<Response> {
  if (method === 'GET') {
    return call(path, {
      method,
      headers: sid ? { Cookie: `sid=${sid}` } : {},
    });
  }
  return postJson(path, sid, body, method);
}

afterEach(async () => {
  vi.useRealTimers();
  await env.DB.prepare('DELETE FROM personal_planned_items').run();
  await env.DB.prepare('DELETE FROM personal_recurring_rule_tags').run();
  await env.DB.prepare('DELETE FROM personal_recurring_rules').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_balances').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal planned routes guard sweep — auth, switch, and cross-account privacy', () => {
  it('returns 401 signed out, 403 with area off, 404 for account B on A planned item, and leaves A untouched', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T08:00:00.000Z'));

    // --- Account A (switched on) ---
    const sidA = await memberSid('u-plan-guard-a', 'PlanGuardA');
    await switchOn('u-plan-guard-a', 1);
    await seedLegacyStarters('u-plan-guard-a');

    const walletA = (
      await json<WalletDetailResponse>(
        await addWallet(sidA, {
          name: 'A Wallet',
          currency: 'VND',
          startAmount: 5_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    const catsA = (
      await json<CategoriesResponse>(await call('/api/me/personal/categories', as(sidA)))
    ).categories;
    const catA = catsA.find((c) => c.type === 'expense')!;

    const ruleARes = await postJson('/api/me/personal/recurring/rules', sidA, {
      draft: {
        type: 'expense',
        walletId: walletA.id,
        categoryId: catA.id,
        amount: 250_000,
        tags: [],
        note: 'A ask-me',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      askMe: true,
    });
    expect(ruleARes.status).toBe(201);
    vi.useRealTimers();

    await runRecurring(env, new Date('2026-12-05T01:15:00.000Z'));

    const plannedBefore = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sidA)),
    );
    expect(plannedBefore.items).toHaveLength(1);
    const itemA = plannedBefore.items[0]!;

    // --- Account B (switched on) ---
    const sidB = await memberSid('u-plan-guard-b', 'PlanGuardB');
    await switchOn('u-plan-guard-b', 1);

    // --- Account C (switch off) ---
    const sidC = await memberSid('u-plan-guard-c', 'PlanGuardC');
    await switchOn('u-plan-guard-c', 0);

    // 1. Every planned route returns 401 signed out and 403 with area off
    const guardCases: Array<{
      label: string;
      method: 'GET' | 'POST';
      path: string;
      body?: unknown;
    }> = [
      { label: 'GET /planned', method: 'GET', path: '/api/me/personal/planned' },
      {
        label: 'POST /planned/:id/confirm',
        method: 'POST',
        path: `/api/me/personal/planned/${itemA.id}/confirm`,
        body: {},
      },
      {
        label: 'POST /planned/:id/skip',
        method: 'POST',
        path: `/api/me/personal/planned/${itemA.id}/skip`,
        body: {},
      },
    ];

    for (const tc of guardCases) {
      const resAnon = await request(tc.method, tc.path, null, tc.body);
      expect(resAnon.status, `anon ${tc.label}`).toBe(401);

      const resOff = await request(tc.method, tc.path, sidC, tc.body);
      expect(resOff.status, `switch-off ${tc.label}`).toBe(403);
    }

    // 2. Account B gets 404 on A's planned item IDs
    const confirmB = await request('POST', `/api/me/personal/planned/${itemA.id}/confirm`, sidB, {});
    expect(confirmB.status).toBe(404);

    const skipB = await request('POST', `/api/me/personal/planned/${itemA.id}/skip`, sidB, {});
    expect(skipB.status).toBe(404);

    // 3. Account B's GET list contains none of A's IDs
    const listBRes = await call('/api/me/personal/planned', as(sidB));
    expect(listBRes.status).toBe(200);
    const listBText = await listBRes.text();
    expect(listBText).not.toContain(itemA.id);
    expect(listBText).not.toContain(walletA.id);

    // 4. Account A's planned items are unchanged
    const plannedAfter = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sidA)),
    );
    expect(plannedAfter).toEqual(plannedBefore);
  });
});
