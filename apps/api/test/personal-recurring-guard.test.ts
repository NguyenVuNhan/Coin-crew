import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  RecurringRuleResponse,
  RecurringRulesResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, seedLegacyStarters, switchOn } from './personal-helpers';

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

describe('personal recurring guard sweep — auth, switch, and cross-account privacy', () => {
  it('returns 401 signed out, 403 with area off, 404 for account B on A ids, and leaves A untouched', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-05T08:00:00.000Z'));

    // --- Account A (switched on) ---
    const sidA = await memberSid('u-rec-guard-a', 'GuardA');
    await switchOn('u-rec-guard-a', 1);
    await seedLegacyStarters('u-rec-guard-a');

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

    const txARes = await postJson('/api/me/personal/transactions', sidA, {
      type: 'expense',
      walletId: walletA.id,
      amount: 100_000,
      categoryId: catA.id,
      date: '2026-12-01',
      note: 'A manual tx',
    });
    expect(txARes.status).toBe(201);
    const txA = (await json<EntriesResponse>(txARes)).entries[0]!;

    const ruleARes = await postJson('/api/me/personal/recurring/rules', sidA, {
      draft: {
        type: 'expense',
        walletId: walletA.id,
        categoryId: catA.id,
        amount: 250_000,
        tags: ['PrivateA'],
        note: 'A recurring',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    expect(ruleARes.status).toBe(201);
    const ruleA = (await json<RecurringRuleResponse>(ruleARes)).rule;

    // --- Account B (switched on) ---
    const sidB = await memberSid('u-rec-guard-b', 'GuardB');
    await switchOn('u-rec-guard-b', 1);
    await seedLegacyStarters('u-rec-guard-b');

    const walletB = (
      await json<WalletDetailResponse>(
        await addWallet(sidB, {
          name: 'B Wallet',
          currency: 'VND',
          startAmount: 1_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    const catsB = (
      await json<CategoriesResponse>(await call('/api/me/personal/categories', as(sidB)))
    ).categories;
    const catB = catsB.find((c) => c.type === 'expense')!;

    // --- Account C (switch off) ---
    const sidC = await memberSid('u-rec-guard-c', 'GuardC');
    await switchOn('u-rec-guard-c', 0);

    // Snapshot A before sweep
    const rulesBefore = await json<RecurringRulesResponse>(
      await call('/api/me/personal/recurring/rules', as(sidA)),
    );

    const sampleBody = {
      draft: {
        type: 'expense',
        walletId: walletA.id,
        categoryId: catA.id,
        amount: 50_000,
        tags: [],
        note: null,
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2027-01-05',
        end: { kind: 'never' },
      },
    };

    // 1. Every new route returns 401 signed out and 403 with area off
    const guardCases: Array<{
      label: string;
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      body?: unknown;
    }> = [
      { label: 'GET /recurring/rules', method: 'GET', path: '/api/me/personal/recurring/rules' },
      {
        label: 'POST /recurring/rules',
        method: 'POST',
        path: '/api/me/personal/recurring/rules',
        body: sampleBody,
      },
      {
        label: 'POST /recurring/rules/from/:txId',
        method: 'POST',
        path: `/api/me/personal/recurring/rules/from/${txA.id}`,
        body: {},
      },
      {
        label: 'PATCH /recurring/rules/:id',
        method: 'PATCH',
        path: `/api/me/personal/recurring/rules/${ruleA.id}`,
        body: { askMe: true },
      },
      {
        label: 'POST /recurring/rules/:id/pause',
        method: 'POST',
        path: `/api/me/personal/recurring/rules/${ruleA.id}/pause`,
        body: {},
      },
      {
        label: 'POST /recurring/rules/:id/resume',
        method: 'POST',
        path: `/api/me/personal/recurring/rules/${ruleA.id}/resume`,
        body: {},
      },
      {
        label: 'DELETE /recurring/rules/:id',
        method: 'DELETE',
        path: `/api/me/personal/recurring/rules/${ruleA.id}`,
      },
    ];

    for (const tc of guardCases) {
      const resAnon = await request(tc.method, tc.path, null, tc.body);
      expect(resAnon.status, `anon ${tc.label}`).toBe(401);

      const resOff = await request(tc.method, tc.path, sidC, tc.body);
      expect(resOff.status, `switch-off ${tc.label}`).toBe(403);
    }

    // 2. Account B gets 404 on A's rule ids, tx id, wallet id, category id
    const crossAccountCases: Array<{
      label: string;
      method: 'POST' | 'PATCH' | 'DELETE';
      path: string;
      body?: unknown;
    }> = [
      {
        label: 'PATCH A rule',
        method: 'PATCH',
        path: `/api/me/personal/recurring/rules/${ruleA.id}`,
        body: { askMe: true },
      },
      {
        label: 'POST pause A rule',
        method: 'POST',
        path: `/api/me/personal/recurring/rules/${ruleA.id}/pause`,
        body: {},
      },
      {
        label: 'POST resume A rule',
        method: 'POST',
        path: `/api/me/personal/recurring/rules/${ruleA.id}/resume`,
        body: {},
      },
      {
        label: 'DELETE A rule',
        method: 'DELETE',
        path: `/api/me/personal/recurring/rules/${ruleA.id}`,
      },
      {
        label: 'POST from A tx',
        method: 'POST',
        path: `/api/me/personal/recurring/rules/from/${txA.id}`,
        body: {},
      },
      {
        label: 'POST rule with A wallet',
        method: 'POST',
        path: '/api/me/personal/recurring/rules',
        body: {
          ...sampleBody,
          draft: { ...sampleBody.draft, walletId: walletA.id, categoryId: catB.id },
        },
      },
      {
        label: 'POST rule with A category',
        method: 'POST',
        path: '/api/me/personal/recurring/rules',
        body: {
          ...sampleBody,
          draft: { ...sampleBody.draft, walletId: walletB.id, categoryId: catA.id },
        },
      },
    ];

    for (const tc of crossAccountCases) {
      const res = await request(tc.method, tc.path, sidB, tc.body);
      expect(res.status, `B ${tc.label}`).toBe(404);
    }

    // 3. Account B's GET list contains none of A's IDs
    const listBRes = await call('/api/me/personal/recurring/rules', as(sidB));
    expect(listBRes.status).toBe(200);
    const listBText = await listBRes.text();
    expect(listBText).not.toContain(ruleA.id);
    expect(listBText).not.toContain(walletA.id);

    // 4. Account A's data is unchanged
    const rulesAfter = await json<RecurringRulesResponse>(
      await call('/api/me/personal/recurring/rules', as(sidA)),
    );
    expect(rulesAfter).toEqual(rulesBefore);
  });
});
