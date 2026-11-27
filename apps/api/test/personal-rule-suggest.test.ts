import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  PlannedItemsResponse,
  WalletDetailResponse,
} from '@cc/core';
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
  const bills = cats.find((c) => c.type === 'expense')!;

  return { sid, wallet, category: bills };
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

describe('rule suggestions on manual entry save', () => {
  it('third monthly entry creates one rule_suggestion with meta.pattern; fourth adds nothing; POST response is unchanged', async () => {
    setVnDate('2026-12-04');
    const { sid, wallet, category } = await setupUser('u-sug-1', 'SugOne');

    const postEntry = (date: string, amount: number) =>
      postJson('/api/me/personal/transactions', sid, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
        amount,
        date,
        note: 'Internet',
      });

    // 1st and 2nd monthly entries -> no suggestion yet
    expect((await postEntry('2026-10-05', 250_000)).status).toBe(201);
    expect((await postEntry('2026-11-06', 255_000)).status).toBe(201);

    const plannedAfter2 = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedAfter2.items).toHaveLength(0);

    // 3rd monthly entry -> creates one rule_suggestion; POST response is unchanged
    const thirdRes = await postEntry('2026-12-04', 250_000);
    expect(thirdRes.status).toBe(201);
    const thirdBody = await json<EntriesResponse>(thirdRes);
    expect(Object.keys(thirdBody)).toEqual(['entries']);
    expect(thirdBody.entries).toHaveLength(1);
    expect(thirdBody.entries[0]).toMatchObject({
      type: 'expense',
      walletId: wallet.id,
      categoryId: category.id,
      amount: 250_000,
      date: '2026-12-04',
      note: 'Internet',
      source: 'manual',
    });

    const plannedAfter3 = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedAfter3.items).toHaveLength(1);
    const suggestion = plannedAfter3.items[0]!;
    expect(suggestion.kind).toBe('rule_suggestion');
    expect(suggestion.status).toBe('waiting');
    expect(suggestion.dueOn).toBe('2026-12-04');
    expect(suggestion.draft).toMatchObject({
      type: 'expense',
      walletId: wallet.id,
      categoryId: category.id,
      amount: 250_000,
      note: 'Internet',
    });
    expect(suggestion.meta).toEqual({
      pattern: {
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 4,
          startDate: '2027-01-04',
          end: { kind: 'never' },
        },
        amount: 250_000,
        categoryId: category.id,
        walletId: wallet.id,
        type: 'expense',
        count: 3,
      },
    });

    // 4th entry -> does not add another suggestion
    setVnDate('2027-01-05');
    expect((await postEntry('2027-01-05', 250_000)).status).toBe(201);

    const plannedAfter4 = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedAfter4.items).toHaveLength(1);
    expect(plannedAfter4.items[0]!.id).toBe(suggestion.id);
  });

  it('after skip (dismiss), a later match adds nothing', async () => {
    setVnDate('2026-12-04');
    const { sid, wallet, category } = await setupUser('u-sug-dismiss', 'SugDismiss');

    const postEntry = (date: string, amount: number) =>
      postJson('/api/me/personal/transactions', sid, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
        amount,
        date,
        note: 'Internet',
      });

    expect((await postEntry('2026-10-05', 250_000)).status).toBe(201);
    expect((await postEntry('2026-11-05', 250_000)).status).toBe(201);
    expect((await postEntry('2026-12-05', 250_000)).status).toBe(201);

    const planned = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(planned.items).toHaveLength(1);
    const sugId = planned.items[0]!.id;

    // Dismiss via /skip
    const skipRes = await postJson(`/api/me/personal/planned/${sugId}/skip`, sid, {});
    expect(skipRes.status).toBe(200);

    // Later match next month -> adds nothing
    setVnDate('2027-01-05');
    expect((await postEntry('2027-01-05', 250_000)).status).toBe(201);

    const plannedAfter = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(plannedAfter.items).toHaveLength(0);
  });

  it('an existing active or paused rule blocks the suggestion', async () => {
    setVnDate('2026-12-04');
    const { sid, wallet, category } = await setupUser('u-sug-existing', 'SugExisting');

    // Create an active rule for the same type, category, wallet and amount within 10%
    const ruleRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
        amount: 260_000,
        tags: [],
        note: 'Internet',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2027-01-05',
        end: { kind: 'never' },
      },
    });
    expect(ruleRes.status).toBe(201);

    const postEntry = (date: string, amount: number) =>
      postJson('/api/me/personal/transactions', sid, {
        type: 'expense',
        walletId: wallet.id,
        categoryId: category.id,
        amount,
        date,
        note: 'Internet',
      });

    expect((await postEntry('2026-10-05', 250_000)).status).toBe(201);
    expect((await postEntry('2026-11-05', 250_000)).status).toBe(201);
    expect((await postEntry('2026-12-05', 250_000)).status).toBe(201);

    const planned = await json<PlannedItemsResponse>(
      await call('/api/me/personal/planned', as(sid)),
    );
    expect(planned.items).toHaveLength(0);
  });
});
