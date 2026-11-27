import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  AssetView,
  CategoriesResponse,
  EntriesResponse,
  RecurringRuleResponse,
  RecurringRulesResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, seedLegacyStarters, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

function setVnDate(ymd: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 08:00 UTC = 15:00 Vietnam time (same calendar date in UTC+7)
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

describe('personal recurring rule routes', () => {
  it('create with start today records the first occurrence', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-rec-1';
    const { sid, wallet, food } = await setupUser(userId, 'Rec1');

    const res = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 250_000,
        tags: ['Fixed'],
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
    expect(res.status).toBe(201);
    const { rule } = await json<RecurringRuleResponse>(res);

    expect(rule.status).toBe('active');
    expect(rule.askMe).toBe(false);
    expect(rule.nextDueOn).toBe('2027-01-05');
    expect(rule.lastConfirmedOn).toBe('2026-12-05');
    expect(rule.draft.tags).toEqual(['Fixed']);

    const txs = (
      await env.DB.prepare(
        'SELECT id, amount, date, source, external_ref FROM personal_transactions WHERE user_id = ?',
      )
        .bind(userId)
        .all<{
          id: string;
          amount: number;
          date: string;
          source: string;
          external_ref: string | null;
        }>()
    ).results;

    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      amount: 250_000,
      date: '2026-12-05',
      source: 'recurring',
      external_ref: `${rule.id}:2026-12-05`,
    });

    // GET list returns the rule with its tags
    const listRes = await call('/api/me/personal/recurring/rules', as(sid));
    expect(listRes.status).toBe(200);
    const { rules } = await json<RecurringRulesResponse>(listRes);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual(rule);
  });

  it('create a buy rule forces ask me', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-rec-buy';
    const { sid } = await setupUser(userId, 'RecBuy');

    const invWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Đầu tư',
          currency: 'VND',
          kind: 'investment',
          startAmount: 20_000_000,
          startDate: '2026-01-01',
        }),
      )
    ).wallet;

    const asset = (
      await json<{ asset: AssetView }>(
        await postJson('/api/me/personal/assets', sid, {
          name: 'E1VFVN30',
          unit: 'CCQ',
          groupName: 'ETF',
          decimals: 2,
        }),
      )
    ).asset;

    const res = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'buy',
        walletId: invWallet.id,
        assetId: asset.id,
        amount: 5_000_000,
        tags: [],
        note: 'DCA ETF',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      askMe: false,
    });
    expect(res.status).toBe(201);
    const { rule } = await json<RecurringRuleResponse>(res);
    expect(rule.askMe).toBe(true);
    expect(rule.nextDueOn).toBe('2027-01-05');

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(txCount?.cnt).toBe(0);

    const planned = (
      await env.DB.prepare(
        'SELECT kind, ref_key, due_on, status FROM personal_planned_items WHERE user_id = ?',
      )
        .bind(userId)
        .all<{ kind: string; ref_key: string; due_on: string; status: string }>()
    ).results;
    expect(planned).toEqual([
      {
        kind: 'recurring_occurrence',
        ref_key: `${rule.id}:2026-12-05`,
        due_on: '2026-12-05',
        status: 'waiting',
      },
    ]);
  });

  it('edit rule changes future only', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-rec-edit';
    const { sid, wallet, food } = await setupUser(userId, 'RecEdit');

    const createRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 200_000,
        tags: [],
        note: 'Gym',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    expect(createRes.status).toBe(201);
    const { rule } = await json<RecurringRuleResponse>(createRes);

    const patchRes = await postJson(
      `/api/me/personal/recurring/rules/${rule.id}`,
      sid,
      {
        draft: {
          type: 'expense',
          walletId: wallet.id,
          categoryId: food.id,
          amount: 350_000,
          tags: ['Health'],
          note: 'Gym new price',
        },
      },
      'PATCH',
    );
    expect(patchRes.status).toBe(200);
    const patched = (await json<RecurringRuleResponse>(patchRes)).rule;
    expect(patched.draft.amount).toBe(350_000);
    expect(patched.draft.tags).toEqual(['Health']);

    // The already-recorded transaction keeps the old amount
    const tx = await env.DB.prepare(
      'SELECT amount, note FROM personal_transactions WHERE user_id = ? AND external_ref = ?',
    )
      .bind(userId, `${rule.id}:2026-12-05`)
      .first<{ amount: number; note: string | null }>();
    expect(tx).toEqual({ amount: 200_000, note: 'Gym' });
  });

  it('moving the schedule does not back-fill', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-rec-move';
    const { sid, wallet, food } = await setupUser(userId, 'RecMove');

    const createRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 500_000,
        tags: [],
        note: 'Rent',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    expect(createRes.status).toBe(201);
    const { rule } = await json<RecurringRuleResponse>(createRes);

    // Move to 2026-12-10 and PATCH monthDay to 1
    setVnDate('2026-12-10');
    const patch1 = await postJson(
      `/api/me/personal/recurring/rules/${rule.id}`,
      sid,
      {
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 1,
          startDate: '2026-12-05',
          end: { kind: 'never' },
        },
      },
      'PATCH',
    );
    expect(patch1.status).toBe(200);
    expect((await json<RecurringRuleResponse>(patch1)).rule.nextDueOn).toBe('2027-01-01');

    // PATCH startDate back to 2026-10-01
    const patch2 = await postJson(
      `/api/me/personal/recurring/rules/${rule.id}`,
      sid,
      {
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 1,
          startDate: '2026-10-01',
          end: { kind: 'never' },
        },
      },
      'PATCH',
    );
    expect(patch2.status).toBe(200);
    expect((await json<RecurringRuleResponse>(patch2)).rule.nextDueOn).toBe('2027-01-01');

    const txs = (
      await env.DB.prepare(
        'SELECT date, external_ref FROM personal_transactions WHERE user_id = ? ORDER BY date',
      )
        .bind(userId)
        .all<{ date: string; external_ref: string | null }>()
    ).results;
    expect(txs).toEqual([{ date: '2026-12-05', external_ref: `${rule.id}:2026-12-05` }]);
  });

  it('pause then resume skips paused time', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-rec-pause';
    const { sid, wallet, food } = await setupUser(userId, 'RecPause');

    const createRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 100_000,
        tags: [],
        note: 'Sub',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    const { rule } = await json<RecurringRuleResponse>(createRes);

    const pauseRes = await postJson(`/api/me/personal/recurring/rules/${rule.id}/pause`, sid, {});
    expect(pauseRes.status).toBe(200);
    const paused = (await json<RecurringRuleResponse>(pauseRes)).rule;
    expect(paused.status).toBe('paused');
    expect(paused.pausedReason).toBe('manual');

    // Seed a recurring_paused waiting item to verify resume dismisses it
    await env.DB.prepare(
      "INSERT INTO personal_planned_items (id, user_id, kind, ref_key, rule_id, due_on, status, created_on) VALUES ('p-item-1', ?, 'recurring_paused', ?, ?, '2027-01-05', 'waiting', '2027-01-05')",
    )
      .bind(userId, `${rule.id}:paused:2027-01-05`, rule.id)
      .run();

    // Advance past Jan 5 and Feb 5, then resume on 2027-02-10
    setVnDate('2027-02-10');
    const resumeRes = await postJson(
      `/api/me/personal/recurring/rules/${rule.id}/resume`,
      sid,
      {},
    );
    expect(resumeRes.status).toBe(200);
    const resumed = (await json<RecurringRuleResponse>(resumeRes)).rule;
    expect(resumed.status).toBe('active');
    expect(resumed.pausedReason).toBeNull();
    expect(resumed.nextDueOn).toBe('2027-03-05');
    expect(resumed.lastConfirmedOn).toBe('2027-02-10');

    const pausedItem = await env.DB.prepare(
      'SELECT status FROM personal_planned_items WHERE id = ?',
    )
      .bind('p-item-1')
      .first<{ status: string }>();
    expect(pausedItem?.status).toBe('dismissed');

    // Still only the original 2026-12-05 transaction
    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ cnt: number }>();
    expect(txCount?.cnt).toBe(1);
  });

  it('delete keeps transactions and removes waiting items', async () => {
    setVnDate('2026-12-05');
    const userId = 'u-rec-del';
    const { sid, wallet, food } = await setupUser(userId, 'RecDel');

    const createRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 150_000,
        tags: ['KeepTx'],
        note: 'Phone bill',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
    });
    const { rule } = await json<RecurringRuleResponse>(createRes);

    // Add a waiting planned item for this rule
    await env.DB.prepare(
      "INSERT INTO personal_planned_items (id, user_id, kind, ref_key, rule_id, due_on, status, created_on) VALUES ('w-del-1', ?, 'recurring_occurrence', ?, ?, '2027-01-05', 'waiting', '2027-01-05')",
    )
      .bind(userId, `${rule.id}:2027-01-05`, rule.id)
      .run();

    const delRes = await call(`/api/me/personal/recurring/rules/${rule.id}`, {
      method: 'DELETE',
      headers: { Cookie: `sid=${sid}` },
    });
    expect(delRes.status).toBe(200);

    // Rule and waiting item are gone
    const ruleRow = await env.DB.prepare('SELECT id FROM personal_recurring_rules WHERE id = ?')
      .bind(rule.id)
      .first();
    expect(ruleRow).toBeNull();

    const waitingRow = await env.DB.prepare('SELECT id FROM personal_planned_items WHERE id = ?')
      .bind('w-del-1')
      .first();
    expect(waitingRow).toBeNull();

    // Recorded transaction remains untouched
    const txRow = await env.DB.prepare(
      'SELECT amount, source, external_ref FROM personal_transactions WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ amount: number; source: string; external_ref: string | null }>();
    expect(txRow).toEqual({
      amount: 150_000,
      source: 'recurring',
      external_ref: `${rule.id}:2026-12-05`,
    });
  });

  it('from transaction makes a monthly rule starting next month', async () => {
    setVnDate('2026-11-15');
    const userId = 'u-rec-from';
    const { sid, wallet, food } = await setupUser(userId, 'RecFrom');

    const txRes = await postJson('/api/me/personal/transactions', sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 300_000,
      categoryId: food.id,
      date: '2026-11-15',
      note: 'Netflix',
      tags: ['Media'],
    });
    expect(txRes.status).toBe(201);
    const tx = (await json<EntriesResponse>(txRes)).entries[0]!;

    const fromRes = await postJson(`/api/me/personal/recurring/rules/from/${tx.id}`, sid, {});
    expect(fromRes.status).toBe(201);
    const { rule } = await json<RecurringRuleResponse>(fromRes);

    expect(rule.draft).toMatchObject({
      type: 'expense',
      walletId: wallet.id,
      categoryId: food.id,
      amount: 300_000,
      note: 'Netflix',
      tags: ['Media'],
    });
    expect(rule.schedule).toEqual({
      unit: 'month',
      every: 1,
      monthDay: 15,
      startDate: '2026-12-15',
      end: { kind: 'never' },
    });
    expect(rule.nextDueOn).toBe('2026-12-15');

    // Original transaction stays manual and unlinked
    const storedTx = await env.DB.prepare(
      'SELECT source, external_ref FROM personal_transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ source: string; external_ref: string | null }>();
    expect(storedTx).toEqual({ source: 'manual', external_ref: null });
  });

  it('turning the area back on does not catch up', async () => {
    setVnDate('2026-11-01');
    const userId = 'u-rec-r19';
    const { sid, wallet, food } = await setupUser(userId, 'RecR19');

    const createRes = await postJson('/api/me/personal/recurring/rules', sid, {
      draft: {
        type: 'expense',
        walletId: wallet.id,
        categoryId: food.id,
        amount: 400_000,
        tags: [],
        note: 'Electric',
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-11-05',
        end: { kind: 'never' },
      },
    });
    expect(createRes.status).toBe(201);
    const { rule } = await json<RecurringRuleResponse>(createRes);
    expect(rule.nextDueOn).toBe('2026-11-05');

    // Turn personal area off
    const offRes = await postJson('/api/me/personal', sid, { enabled: false }, 'PATCH');
    expect(offRes.status).toBe(200);

    // Jump forward to 2027-02-10 and turn personal area back on
    setVnDate('2027-02-10');
    const onRes = await postJson('/api/me/personal', sid, { enabled: true }, 'PATCH');
    expect(onRes.status).toBe(200);

    const listRes = await call('/api/me/personal/recurring/rules', as(sid));
    expect(listRes.status).toBe(200);
    const { rules } = await json<RecurringRulesResponse>(listRes);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.nextDueOn).toBe('2027-03-05');
    expect(rules[0]!.lastConfirmedOn).toBe('2027-02-10');
  });
});
