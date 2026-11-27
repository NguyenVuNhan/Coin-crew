import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  TravelRowsResponse,
  TravelSavedResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const createTravel = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/travels', sid, body);

const getTravelRows = (sid: string | null, id: string) =>
  call(`/api/me/personal/travels/${encodeURIComponent(id)}/rows`, sid ? as(sid) : {});

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const putGroupLink = (sid: string, rootId: string, body: unknown) =>
  postJson(`/api/me/personal/group-links/${encodeURIComponent(rootId)}`, sid, body, 'PUT');

async function seedGroupExpense(
  tripId: string,
  userId: string,
  exp: { id: string; description: string; amount: number; myShare: number; spentOn: string },
): Promise<void> {
  const now = '2026-10-01T00:00:00.000Z';
  const myPid = `p-me-${tripId}`;
  const otherPid = `p-other-${tripId}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, 'VND', 1, ?, ?, ?, 1, ?)",
  )
    .bind(tripId, `Group ${tripId}`, userId, `gtok-${tripId}`, `vtok-${tripId}`, now)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, 'Me', 'me', ?, 'active', 0, ?)",
  )
    .bind(myPid, tripId, userId, now)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, 'Friend', 'friend', NULL, 'active', 1, ?)",
  )
    .bind(otherPid, tripId, now)
    .run();

  await env.DB.prepare(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, 'VND', ?, ?, 'exact', 'approved', ?, ?, ?)",
  )
    .bind(exp.id, exp.id, tripId, exp.description, exp.amount, exp.spentOn, otherPid, myPid, now, now)
    .run();
  await env.DB.prepare(
    'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
  )
    .bind(exp.id, myPid, exp.myShare, exp.myShare)
    .run();
  await env.DB.prepare(
    'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
  )
    .bind(exp.id, otherPid, exp.amount - exp.myShare, exp.amount - exp.myShare)
    .run();
}

const countQueries = async <T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> => {
  let prepareCount = 0;
  let batchCount = 0;
  const origPrepare = env.DB.prepare.bind(env.DB);
  const origBatch = env.DB.batch.bind(env.DB);
  env.DB.prepare = ((q: string) => {
    prepareCount++;
    return origPrepare(q);
  }) as typeof env.DB.prepare;
  env.DB.batch = ((stmts: D1PreparedStatement[]) => {
    batchCount++;
    return origBatch(stmts);
  }) as typeof env.DB.batch;
  try {
    const result = await fn();
    return { result, queries: prepareCount + batchCount };
  } finally {
    env.DB.prepare = origPrepare;
    env.DB.batch = origBatch;
  }
};

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_travel_share_marks').run();
  await env.DB.prepare('DELETE FROM personal_travel_groups').run();
  await env.DB.prepare('DELETE FROM personal_travels').run();
  await env.DB.prepare('DELETE FROM personal_budget_excluded_wallets').run();
  await env.DB.prepare('DELETE FROM personal_budget_limits').run();
  await env.DB.prepare('DELETE FROM personal_budgets').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_trip_cache').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('GET /me/personal/travels/:id/rows', () => {
  it('guards the route: 401 signed out, 403 switch off, 404 unknown or foreign trip', async () => {
    expect((await getTravelRows(null, 'tr-missing')).status).toBe(401);

    const ownerId = 'u-tr-owner';
    const ownerSid = await memberSid(ownerId, 'Owner');
    expect((await getTravelRows(ownerSid, 'tr-missing')).status).toBe(403);

    await switchOn(ownerId);
    expect((await getTravelRows(ownerSid, 'tr-missing')).status).toBe(404);

    const createRes = await createTravel(ownerSid, {
      name: 'Hội An',
      start: '2026-12-10',
      end: '2026-12-12',
      countsFrom: '2026-12-03',
      groupIds: [],
      today: '2026-12-01',
    });
    expect(createRes.status).toBe(201);
    const created = await json<TravelSavedResponse>(createRes);

    const otherId = 'u-tr-other';
    const otherSid = await memberSid(otherId, 'Other');
    await switchOn(otherId);
    expect((await getTravelRows(otherSid, created.travel.id)).status).toBe(404);
  });

  it('returns tagged own + group rows inside countsFrom..end, keeps THB row, drops untagged/out-of-range, works with zero budgets, <= 50 queries', async () => {
    const userId = 'u-tr-rows';
    const sid = await memberSid(userId, 'Traveler');
    await switchOn(userId);

    const vndRes = await addWallet(sid, { name: 'Cash', currency: 'VND', startAmount: 10_000_000 });
    const vndWallet = (await json<WalletDetailResponse>(vndRes)).wallet;

    const catsRes = await getCategories(sid);
    const { categories } = await json<CategoriesResponse>(catsRes);
    const foodCat = categories.find((c) => c.type === 'expense')!;

    const thbRes = await addWallet(sid, {
      name: 'Baht',
      currency: 'THB',
      startAmount: 50_000_00,
      startCostVnd: 3_600_000,
    });
    const thbWallet = (await json<WalletDetailResponse>(thbRes)).wallet;

    const tripId = 'g-bkk';
    await seedGroupExpense(tripId, userId, {
      id: 'gx-in',
      description: 'Hotel',
      amount: 2_000_000,
      myShare: 1_000_000,
      spentOn: '2026-12-10',
    });
    await seedGroupExpense(tripId, userId, {
      id: 'gx-out-date',
      description: 'Old dinner',
      amount: 600_000,
      myShare: 300_000,
      spentOn: '2026-12-01',
    });
    await seedGroupExpense(tripId, userId, {
      id: 'gx-untagged',
      description: 'Untagged share',
      amount: 400_000,
      myShare: 200_000,
      spentOn: '2026-12-11',
    });

    // Create trip with NO budget (zero budgets in DB)
    const createRes = await createTravel(sid, {
      name: 'Bangkok',
      start: '2026-12-10',
      end: '2026-12-12',
      countsFrom: '2026-12-03',
      groupIds: [tripId],
      today: '2026-12-01',
    });
    expect(createRes.status).toBe(201);
    const { travel } = await json<TravelSavedResponse>(createRes);

    // Tag gx-in and gx-out-date with the trip tag; leave gx-untagged untagged
    expect(
      (await putGroupLink(sid, 'gx-in', { tagIds: [travel.tagId] })).status,
    ).toBe(200);
    expect(
      (await putGroupLink(sid, 'gx-out-date', { tagIds: [travel.tagId] })).status,
    ).toBe(200);

    // Own VND expense inside countsFrom..start (lead-up) with trip tag -> included
    const ownLeadRes = await createEntry(sid, {
      walletId: vndWallet.id,
      type: 'expense',
      amount: 500_000,
      categoryId: foodCat.id,
      date: '2026-12-04',
      time: '09:00',
      note: 'Flight',
      tags: ['Bangkok'],
    });
    expect(ownLeadRes.status).toBe(201);

    // Own THB expense inside trip dates with trip tag -> included
    const ownThbRes = await createEntry(sid, {
      walletId: thbWallet.id,
      type: 'expense',
      amount: 1_500_00,
      categoryId: foodCat.id,
      date: '2026-12-11',
      time: '12:00',
      note: 'Pad Thai',
      tags: ['Bangkok'],
    });
    expect(ownThbRes.status).toBe(201);

    // Own expense before countsFrom with trip tag -> dropped
    expect(
      (
        await createEntry(sid, {
          walletId: vndWallet.id,
          type: 'expense',
          amount: 100_000,
          categoryId: foodCat.id,
          date: '2026-12-02',
          time: '10:00',
          note: 'Too early',
          tags: ['Bangkok'],
        })
      ).status,
    ).toBe(201);

    // Own expense after end with trip tag -> dropped
    expect(
      (
        await createEntry(sid, {
          walletId: vndWallet.id,
          type: 'expense',
          amount: 200_000,
          categoryId: foodCat.id,
          date: '2026-12-13',
          time: '10:00',
          note: 'Too late',
          tags: ['Bangkok'],
        })
      ).status,
    ).toBe(201);

    // Own expense inside dates without trip tag -> dropped
    expect(
      (
        await createEntry(sid, {
          walletId: vndWallet.id,
          type: 'expense',
          amount: 300_000,
          categoryId: foodCat.id,
          date: '2026-12-10',
          time: '14:00',
          note: 'Other',
          tags: ['Other'],
        })
      ).status,
    ).toBe(201);

    const { result: res, queries } = await countQueries(() => getTravelRows(sid, travel.id));
    expect(res.status).toBe(200);
    expect(queries).toBeLessThanOrEqual(50);

    const body = await json<TravelRowsResponse>(res);
    expect(body.rows).toHaveLength(3);

    const byNote = body.rows.map((r) => ({
      kind: r.kind,
      currency: r.currency,
      amount: r.amount,
      date: r.date,
    }));
    expect(byNote).toEqual(
      expect.arrayContaining([
        { kind: 'entry', currency: 'VND', amount: 500_000, date: '2026-12-04' },
        { kind: 'entry', currency: 'THB', amount: 1_500_00, date: '2026-12-11' },
        { kind: 'group', currency: 'VND', amount: 1_000_000, date: '2026-12-10' },
      ]),
    );
    expect(body.rows.every((r) => r.tagIds.includes(travel.tagId))).toBe(true);
  });
});
