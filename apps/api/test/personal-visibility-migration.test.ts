import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { CategoriesResponse } from '@cc/core';
import { call, json, memberSid, seedUser } from './helpers';
import { switchOn } from './personal-helpers';

const migration0030 = () => env.TEST_MIGRATIONS!.find((m) => m.name.startsWith('0030'))!;

function dataQueries0030(): string[] {
  const m = migration0030();
  expect(m).toBeDefined();
  const queries = m.queries
    .map((q) => q.replace(/^-->\s*statement-breakpoint\s*/i, '').trim())
    .filter((q) => {
      const upper = q.toUpperCase();
      return upper.startsWith('INSERT') || upper.startsWith('UPDATE');
    });
  expect(queries).toHaveLength(4);
  return queries;
}

async function runDataSteps0030(): Promise<void> {
  for (const q of dataQueries0030()) {
    await env.DB.prepare(q).run();
  }
}

describe('personal visibility migration 0030 and starter reshape', () => {
  it('seeds a brand-new user with fees root, re-parented tax/fee, no invest-* subs, and other-income-reward', async () => {
    const uid = 'u-vis-seed';
    const sid = await memberSid(uid, 'VisSeed');
    await switchOn(uid);

    const res = await call('/api/me/personal/categories', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(res.status).toBe(200);
    const body = await json<CategoriesResponse>(res);

    const fees = body.categories.find((c) => c.id === `${uid}:fees`);
    expect(fees).toBeDefined();
    expect(fees?.parentId).toBeNull();
    expect(fees?.type).toBe('expense');
    expect(fees?.name).toBe('Phí & lệ phí');

    const tax = body.categories.find((c) => c.id === `${uid}:tax`);
    const fee = body.categories.find((c) => c.id === `${uid}:fee`);
    expect(tax?.parentId).toBe(`${uid}:fees`);
    expect(fee?.parentId).toBe(`${uid}:fees`);

    const investSubs = body.categories.filter((c) => c.id.startsWith(`${uid}:invest-`));
    expect(investSubs).toEqual([]);

    const reward = body.categories.find((c) => c.id === `${uid}:other-income-reward`);
    expect(reward).toBeDefined();
    expect(reward?.parentId).toBe(`${uid}:other-income`);
    expect(reward?.type).toBe('income');
    expect(reward?.name).toBe('Thưởng / Staking');
  });

  it('migrates old-shape rows, is idempotent, and leaves already-parented tax untouched', async () => {
    const uid1 = 'u-vis-mig-1';
    const uid2 = 'u-vis-mig-2';
    await seedUser(uid1, 'Mig1');
    await seedUser(uid2, 'Mig2');

    const now = '2026-11-15T00:00:00.000Z';
    const insertCat = (
      id: string,
      userId: string,
      parentId: string | null,
      type: 'expense' | 'income',
      name: string,
      icon: string,
      sortOrder: number,
    ) =>
      env.DB.prepare(
        'INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
      )
        .bind(id, userId, parentId, type, name, icon, sortOrder, now, now)
        .run();

    // User 1: old-shape top-level tax/fee, invest with invest-stock, other-income
    await insertCat(`${uid1}:invest`, uid1, null, 'expense', 'Đầu tư', 'trending-up', 5);
    await insertCat(`${uid1}:invest-stock`, uid1, `${uid1}:invest`, 'expense', 'Cổ phiếu', 'candlestick-chart', 0);
    await insertCat(`${uid1}:tax`, uid1, null, 'expense', 'Thuế', 'landmark', 6);
    await insertCat(`${uid1}:fee`, uid1, null, 'expense', 'Phí', 'badge-percent', 7);
    await insertCat(`${uid1}:other-income`, uid1, null, 'income', 'Thu nhập khác', 'gift', 3);

    // User 2: tax already has a custom parent
    await insertCat(`${uid2}:custom-parent`, uid2, null, 'expense', 'Riêng', 'tag', 0);
    await insertCat(`${uid2}:tax`, uid2, `${uid2}:custom-parent`, 'expense', 'Thuế', 'landmark', 6);
    await insertCat(`${uid2}:fee`, uid2, null, 'expense', 'Phí', 'badge-percent', 7);

    // Run 0030 data steps
    await runDataSteps0030();

    const fetchUserCats = async (userId: string) => {
      const res = await env.DB.prepare(
        'SELECT id, parent_id, type, name, sort_order FROM personal_categories WHERE user_id = ? ORDER BY id',
      )
        .bind(userId)
        .all<{ id: string; parent_id: string | null; type: string; name: string; sort_order: number }>();
      return res.results;
    };

    const u1After1 = await fetchUserCats(uid1);
    expect(u1After1.find((r) => r.id === `${uid1}:fees`)).toMatchObject({
      parent_id: null,
      type: 'expense',
      name: 'Phí & lệ phí',
      sort_order: 6,
    });
    expect(u1After1.find((r) => r.id === `${uid1}:tax`)).toMatchObject({
      parent_id: `${uid1}:fees`,
      sort_order: 0,
    });
    expect(u1After1.find((r) => r.id === `${uid1}:fee`)).toMatchObject({
      parent_id: `${uid1}:fees`,
      sort_order: 1,
    });
    expect(u1After1.find((r) => r.id === `${uid1}:invest-stock`)).toMatchObject({
      parent_id: `${uid1}:invest`,
    });
    expect(u1After1.find((r) => r.id === `${uid1}:other-income-reward`)).toMatchObject({
      parent_id: `${uid1}:other-income`,
      type: 'income',
      name: 'Thưởng / Staking',
      sort_order: 0,
    });

    // User 2: tax keeps custom parent; fee is re-parented under fees
    const u2After1 = await fetchUserCats(uid2);
    expect(u2After1.find((r) => r.id === `${uid2}:tax`)?.parent_id).toBe(`${uid2}:custom-parent`);
    expect(u2After1.find((r) => r.id === `${uid2}:fee`)?.parent_id).toBe(`${uid2}:fees`);

    // Idempotence: re-run data steps and assert nothing changes
    await runDataSteps0030();
    const u1After2 = await fetchUserCats(uid1);
    const u2After2 = await fetchUserCats(uid2);
    expect(u1After2).toEqual(u1After1);
    expect(u2After2).toEqual(u2After1);
  });
});
