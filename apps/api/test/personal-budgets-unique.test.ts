import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { BudgetResponse, CategoriesResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const createBudget = (sid: string, body: unknown) =>
  postJson('/api/me/personal/budgets', sid, body);

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_budget_excluded_wallets').run();
  await env.DB.prepare('DELETE FROM personal_budget_limits').run();
  await env.DB.prepare('DELETE FROM personal_budgets').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal budgets uniqueness rules', () => {
  it('allows two one-off (once) budgets on the same tag', async () => {
    const userId = 'u-bgt-uq-once';
    const sid = await memberSid(userId, 'OnceUser');
    await switchOn(userId);

    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-trips', ?, 'Du lịch', '2026-11-01T00:00:00.000Z')",
    )
      .bind(userId)
      .run();

    const first = await createBudget(sid, {
      name: 'Đà Lạt',
      target: { kind: 'tag', tagId: 'tag-trips' },
      currency: 'VND',
      amount: 5_000_000,
      periodKind: 'once',
      from: '2026-11-01',
      to: '2026-11-05',
      excludedWalletIds: [],
      today: '2026-11-01',
    });
    expect(first.status).toBe(201);

    const second = await createBudget(sid, {
      name: 'Phú Quốc',
      target: { kind: 'tag', tagId: 'tag-trips' },
      currency: 'VND',
      amount: 8_000_000,
      periodKind: 'once',
      from: '2026-12-10',
      to: '2026-12-15',
      excludedWalletIds: [],
      today: '2026-11-01',
    });
    expect(second.status).toBe(201);

    const b1 = (await json<BudgetResponse>(first)).budget;
    const b2 = (await json<BudgetResponse>(second)).budget;
    expect(b1.id).not.toBe(b2.id);
  });

  it('allows same category monthly in VND and USD, and rejects duplicate monthly VND with 409', async () => {
    const userId = 'u-bgt-uq-cur';
    const sid = await memberSid(userId, 'CurrencyUser');
    await switchOn(userId);

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const vndRes = await createBudget(sid, {
      name: 'Food VND',
      target: { kind: 'category', categoryId: food.id },
      currency: 'VND',
      amount: 3_000_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: [],
      today: '2026-11-26',
    });
    expect(vndRes.status).toBe(201);

    const usdRes = await createBudget(sid, {
      name: 'Food USD',
      target: { kind: 'category', categoryId: food.id },
      currency: 'USD',
      amount: 20_000,
      periodKind: 'month',
      monthStartDay: 1,
      excludedWalletIds: [],
      today: '2026-11-26',
    });
    expect(usdRes.status).toBe(201);

    const dupVndRes = await createBudget(sid, {
      name: 'Food VND 2',
      target: { kind: 'category', categoryId: food.id },
      currency: 'VND',
      amount: 4_000_000,
      periodKind: 'month',
      monthStartDay: 15,
      excludedWalletIds: [],
      today: '2026-11-26',
    });
    expect(dupVndRes.status).toBe(409);
    const dupBody = await json<{ error: { code: string } }>(dupVndRes);
    expect(dupBody.error.code).toBe('DUPLICATE');
  });
});
