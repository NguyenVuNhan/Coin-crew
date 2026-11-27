import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  ListResponse,
  RecurringRuleResponse,
  WalletDetailResponse,
} from '@cc/core';
import { getDb } from '@cc/api-db/client';
import { writeEntry } from '../src/personal/entryWrite';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, seedLegacyStarters, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

function setVnDate(ymd: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${ymd}T08:00:00.000Z`));
}

async function setupUser(userId: string, name: string) {
  const sid = await memberSid(userId, name);
  await switchOn(userId, 1);
  await seedLegacyStarters(userId);

  const wallet = (
    await json<WalletDetailResponse>(
      await addWallet(sid, {
        name: 'Ví chính',
        currency: 'VND',
        startAmount: 10_000_000,
        startDate: '2026-01-01',
      }),
    )
  ).wallet;

  const cats = (
    await json<CategoriesResponse>(await call('/api/me/personal/categories', as(sid)))
  ).categories;
  const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

  return { sid, wallet, food };
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
  await env.DB.prepare('DELETE FROM personal_asset_counts').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_wallet_balances').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

describe('personal recurring mark and rule list filter', () => {
  it('sets source and ruleId on recurring entry views and null on manual entries', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-mark-1';
    const { sid, wallet, food } = await setupUser(userId, 'Mark1');

    const db = getDb(env);
    const [writtenRec] = await writeEntry(
      db,
      userId,
      {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 250_000,
        date: '2026-12-05',
        note: 'Internet',
      },
      {
        source: 'recurring',
        externalRef: 'rule-abc:2026-12-05',
        now: '2026-12-05T08:00:00.000Z',
      },
    );
    expect(writtenRec!.source).toBe('recurring');
    expect(writtenRec!.ruleId).toBe('rule-abc');

    const [writtenManual] = await writeEntry(
      db,
      userId,
      {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 50_000,
        date: '2026-12-05',
        note: 'Cà phê',
      },
      {
        source: 'manual',
        externalRef: null,
        now: '2026-12-05T09:00:00.000Z',
      },
    );
    expect(writtenManual!.source).toBe('manual');
    expect(writtenManual!.ruleId).toBeNull();

    const listRes = await call('/api/me/personal/transactions?month=2026-12', as(sid));
    expect(listRes.status).toBe(200);
    const list = await json<ListResponse>(listRes);

    const entryRows = list.rows.filter((r) => r.kind === 'entry').map((r) => r.entry);
    const recRow = entryRows.find((e) => e.id === writtenRec!.id);
    const manRow = entryRows.find((e) => e.id === writtenManual!.id);

    expect(recRow?.source).toBe('recurring');
    expect(recRow?.ruleId).toBe('rule-abc');
    expect(manRow?.source).toBe('manual');
    expect(manRow?.ruleId ?? null).toBeNull();
  });

  it('filters transactions by rule=<ruleId> and returns only that rule rows', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-mark-2';
    const { sid, wallet, food } = await setupUser(userId, 'Mark2');

    const r1Res = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 6_000_000,
        tags: [],
        note: 'Tiền nhà',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-11-05',
        end: { kind: 'never' },
      },
    });
    expect(r1Res.status).toBe(201);
    const { rule: rule1 } = await json<RecurringRuleResponse>(r1Res);

    const r2Res = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 250_000,
        tags: [],
        note: 'Internet',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    expect(r2Res.status).toBe(201);
    const { rule: rule2 } = await json<RecurringRuleResponse>(r2Res);

    // Also add a manual entry
    await postJson('/api/me/personal/transactions', sid, {
      type: 'expense',
      walletId: wallet.id,
      categoryId: food.id,
      amount: 100_000,
      date: '2026-12-05',
      note: 'Manual',
    });

    const filteredRes = await call(
      `/api/me/personal/transactions?rule=${encodeURIComponent(rule1.id)}`,
      as(sid),
    );
    expect(filteredRes.status).toBe(200);
    const filtered = await json<ListResponse>(filteredRes);

    expect(filtered.rows).toHaveLength(2);
    for (const row of filtered.rows) {
      expect(row.kind).toBe('entry');
      if (row.kind === 'entry') {
        expect(row.entry.source).toBe('recurring');
        expect(row.entry.ruleId).toBe(rule1.id);
        expect(row.entry.note).toBe('Tiền nhà');
      }
    }

    const r2Filtered = await json<ListResponse>(
      await call(`/api/me/personal/transactions?rule=${encodeURIComponent(rule2.id)}`, as(sid)),
    );
    expect(r2Filtered.rows).toHaveLength(1);
    expect(r2Filtered.rows[0]?.kind === 'entry' && r2Filtered.rows[0].entry.ruleId).toBe(rule2.id);
  });

  it('returns nothing when filtering by another user rule id', async () => {
    setVnDate('2026-12-05');
    const userA = await setupUser('u-mark-a', 'MarkA');
    const userB = await setupUser('u-mark-b', 'MarkB');

    const rARes = await postJson('/api/me/personal/recurring/rules', userA.sid, {
      draft: {
        type: 'expense',
        walletId: userA.wallet.id,
        categoryId: userA.food.id,
        amount: 500_000,
        tags: [],
        note: 'Private A',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    expect(rARes.status).toBe(201);
    const { rule: ruleA } = await json<RecurringRuleResponse>(rARes);

    const bRes = await call(
      `/api/me/personal/transactions?rule=${encodeURIComponent(ruleA.id)}`,
      as(userB.sid),
    );
    expect(bRes.status).toBe(200);
    const bList = await json<ListResponse>(bRes);
    expect(bList.rows).toEqual([]);
  });
});
