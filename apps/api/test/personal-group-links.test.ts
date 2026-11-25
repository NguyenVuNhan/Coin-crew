import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { FIXED_CATEGORIES, type GroupLinkView, type GroupSettingsView } from '@cc/core';
import { loadGroupRows } from '../src/personal/groupShares';
import { call, json, linkMember, memberSid, PID, seedTrip, seedUser, T, U } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function seedExpense(opts: {
  id: string;
  rootId?: string;
  parentId?: string | null;
  isLatest?: number;
  tripId?: string;
  description?: string;
  amount?: number;
  payerId?: string;
  status?: string;
  shares?: { participantId: string; amount: number }[];
}) {
  const rootId = opts.rootId ?? opts.id;
  const tripId = opts.tripId ?? T.tripId;
  const payerId = opts.payerId ?? PID.M;
  const amount = opts.amount ?? 200_000;
  await runSql(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
      currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
      meta_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'expense', ?, ?, NULL, 'VND', '2026-10-10', ?, NULL, 'equal', ?, ?, NULL, '2026-10-10T10:00:00.000Z', '2026-10-10T10:00:00.000Z')`,
    opts.id,
    rootId,
    opts.parentId ?? null,
    opts.isLatest ?? 1,
    tripId,
    opts.description ?? 'Bữa tối',
    amount,
    payerId,
    opts.status ?? 'approved',
    payerId,
  );
  const shares = opts.shares ?? [
    { participantId: PID.M, amount: amount / 2 },
    { participantId: PID.A, amount: amount / 2 },
  ];
  for (const s of shares) {
    await runSql(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)',
      opts.id,
      s.participantId,
      s.amount,
    );
  }
}

async function seedCategory(id: string, userId: string, name: string, type: 'expense' | 'income' = 'expense') {
  await runSql(
    `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'tag', 0, 0, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    id,
    userId,
    type,
    name,
  );
}

async function seedTag(id: string, userId: string, name: string) {
  await runSql(
    `INSERT INTO personal_tags (id, user_id, name, created_at) VALUES (?, ?, ?, '2026-10-01T00:00:00.000Z')`,
    id,
    userId,
    name,
  );
}

describe('personal group links and settings routes', () => {
  it('sets and reads back wallet, category, tags, intent and excludeFromReports', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const wRes = await addWallet(sid, {
      name: 'Ví chính',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);
    const { wallet } = await json<{ wallet: { id: string } }>(wRes);

    const usdRes = await addWallet(sid, {
      name: 'USD Wallet',
      currency: 'USD',
      startAmount: 10_000,
      startCostVnd: 2_500_000,
      startDate: '2026-10-01',
    });
    expect(usdRes.status).toBe(201);
    const { wallet: usdWallet } = await json<{ wallet: { id: string } }>(usdRes);

    await seedCategory('cat-food', U.minh, 'Ăn uống');
    await seedTag('tag-b', U.minh, 'Bạn bè');
    await seedTag('tag-a', U.minh, 'Cuối tuần');
    await seedExpense({ id: 'e-link-1' });

    // Non-VND wallet rejected with 422
    const badWalletRes = await postJson(
      '/api/me/personal/group-links/e-link-1',
      sid,
      { walletId: usdWallet.id },
      'PUT',
    );
    expect(badWalletRes.status).toBe(422);

    const putRes = await postJson(
      '/api/me/personal/group-links/e-link-1',
      sid,
      {
        walletId: wallet.id,
        categoryId: 'cat-food',
        tagIds: ['tag-b', 'tag-a'],
        intent: 'loan',
        excludeFromReports: true,
      },
      'PUT',
    );
    expect(putRes.status).toBe(200);
    const { link } = await json<{ link: GroupLinkView }>(putRes);
    expect(link).toEqual({
      walletId: wallet.id,
      categoryId: 'cat-food',
      tagIds: ['tag-a', 'tag-b'],
      intent: 'loan',
      excludeFromReports: true,
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.link).toEqual({
      walletId: wallet.id,
      categoryId: 'cat-food',
      tagIds: ['tag-a', 'tag-b'],
      intent: 'loan',
      excludeFromReports: true,
    });

    // Sync state bumped and sync_version + trip_id stored
    const syncRow = await env.DB.prepare(
      'SELECT version FROM personal_sync_state WHERE user_id = ?',
    )
      .bind(U.minh)
      .first<{ version: number }>();
    expect(syncRow?.version).toBe(1);

    const linkRow = await env.DB.prepare(
      'SELECT trip_id, sync_version FROM personal_group_links WHERE user_id = ? AND root_id = ?',
    )
      .bind(U.minh, 'e-link-1')
      .first<{ trip_id: string; sync_version: number }>();
    expect(linkRow).toEqual({ trip_id: T.tripId, sync_version: 1 });

    // Tags replace the full set
    const replaceTagsRes = await postJson(
      '/api/me/personal/group-links/e-link-1',
      sid,
      { tagIds: ['tag-b'] },
      'PUT',
    );
    expect(replaceTagsRes.status).toBe(200);
    const { link: replaced } = await json<{ link: GroupLinkView }>(replaceTagsRes);
    expect(replaced).toEqual({
      walletId: wallet.id,
      categoryId: 'cat-food',
      tagIds: ['tag-b'],
      intent: 'loan',
      excludeFromReports: true,
    });

    const rowsAfter = await loadGroupRows(getDb(env), U.minh);
    expect(rowsAfter[0]!.link?.tagIds).toEqual(['tag-b']);
  });

  it('survives a new version of the group expense with the same rootId', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);
    await seedCategory('cat-1', U.minh, 'Ăn uống');
    await seedTag('tag-1', U.minh, 'Đà Lạt');

    await seedExpense({ id: 'e-ver-1', rootId: 'e-ver-1', isLatest: 1, amount: 100_000 });

    const putRes = await postJson(
      '/api/me/personal/group-links/e-ver-1',
      sid,
      {
        categoryId: 'cat-1',
        tagIds: ['tag-1'],
        intent: 'shared',
        excludeFromReports: false,
      },
      'PUT',
    );
    expect(putRes.status).toBe(200);

    // Edit group expense: v1 superseded, v2 is latest with same rootId
    await runSql("UPDATE transactions SET is_latest = 0, status = 'superseded' WHERE id = 'e-ver-1'");
    await seedExpense({
      id: 'e-ver-2',
      rootId: 'e-ver-1',
      parentId: 'e-ver-1',
      isLatest: 1,
      description: 'Bữa tối (sửa)',
      amount: 160_000,
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'e-ver-2',
      rootId: 'e-ver-1',
      title: 'Bữa tối (sửa)',
      total: 160_000,
      link: {
        walletId: null,
        categoryId: 'cat-1',
        tagIds: ['tag-1'],
        intent: 'shared',
        excludeFromReports: false,
      },
    });
  });

  it('returns 404 on someone else rootId', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    // Another trip where Minh is NOT a participant
    await seedUser(U.an, 'An');
    await runSql(
      `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at)
       VALUES ('t-other', 'Nhóm khác', 'trip', 'VND', 1, 0, ?, 'gtok-other', 'vtok-other', 1, '2026-10-01T00:00:00.000Z')`,
      U.an,
    );
    await runSql(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at)
       VALUES ('p-other-an', 't-other', 'An', 'an', ?, 'active', 0, '2026-10-01T00:00:00.000Z')`,
      U.an,
    );
    await seedExpense({
      id: 'e-other-trip',
      tripId: 't-other',
      payerId: 'p-other-an',
      shares: [{ participantId: 'p-other-an', amount: 100_000 }],
    });

    const res = await postJson(
      '/api/me/personal/group-links/e-other-trip',
      sid,
      { intent: 'shared' },
      'PUT',
    );
    expect(res.status).toBe(404);

    const missingRes = await postJson(
      '/api/me/personal/group-links/non-existent-root',
      sid,
      { intent: 'shared' },
      'PUT',
    );
    expect(missingRes.status).toBe(404);
  });

  it('returns 403 with switch off on all three routes', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await seedExpense({ id: 'e-off' });
    await switchOn(U.minh, 0);

    const putLink = await postJson(
      '/api/me/personal/group-links/e-off',
      sid,
      { intent: 'shared' },
      'PUT',
    );
    expect(putLink.status).toBe(403);

    const getSettings = await call('/api/me/personal/group-settings', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(getSettings.status).toBe(403);

    const putSettings = await postJson(
      '/api/me/personal/group-settings',
      sid,
      { countLoans: true },
      'PUT',
    );
    expect(putSettings.status).toBe(403);
  });

  it('second account cannot read or change links or settings', async () => {
    await seedTrip();
    const minhSid = await memberSid(U.minh, 'Minh');
    const anSid = await linkMember(PID.A, U.an, 'An');
    await switchOn(U.minh, 1);
    await switchOn(U.an, 1);

    const wRes = await addWallet(minhSid, {
      name: 'Ví Minh',
      currency: 'VND',
      startAmount: 500_000,
      startDate: '2026-10-01',
    });
    const { wallet: minhWallet } = await json<{ wallet: { id: string } }>(wRes);
    await seedCategory('cat-minh', U.minh, 'Nhóm riêng');
    await seedTag('tag-minh', U.minh, 'Riêng tư');
    await seedExpense({ id: 'e-shared' });

    await postJson(
      '/api/me/personal/group-links/e-shared',
      minhSid,
      {
        walletId: minhWallet.id,
        categoryId: 'cat-minh',
        tagIds: ['tag-minh'],
        intent: 'loan',
        excludeFromReports: true,
      },
      'PUT',
    );
    await postJson(
      '/api/me/personal/group-settings',
      minhSid,
      { defaultGroupCategoryId: 'cat-minh', countLoans: true },
      'PUT',
    );

    // An's group settings are independent
    const anSettingsRes = await call('/api/me/personal/group-settings', {
      headers: { Cookie: `sid=${anSid}` },
    });
    expect(anSettingsRes.status).toBe(200);
    const { settings: anSettings } = await json<{ settings: GroupSettingsView }>(anSettingsRes);
    expect(anSettings).toEqual({ defaultGroupCategoryId: null, countLoans: false });

    // An does not see Minh's link on the shared group expense
    const anRows = await loadGroupRows(getDb(env), U.an);
    expect(anRows).toHaveLength(1);
    expect(anRows[0]!.link).toBeNull();

    // An cannot reference Minh's category, wallet, or tag
    expect(
      (
        await postJson(
          '/api/me/personal/group-settings',
          anSid,
          { defaultGroupCategoryId: 'cat-minh' },
          'PUT',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await postJson(
          '/api/me/personal/group-links/e-shared',
          anSid,
          { walletId: minhWallet.id },
          'PUT',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await postJson(
          '/api/me/personal/group-links/e-shared',
          anSid,
          { categoryId: 'cat-minh' },
          'PUT',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await postJson(
          '/api/me/personal/group-links/e-shared',
          anSid,
          { tagIds: ['tag-minh'] },
          'PUT',
        )
      ).status,
    ).toBe(404);
  });

  it('creates starter categories once on first group-settings read and updates settings', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    // First read seeds the fixed danh mục list (incl. Chung, Cho vay, Đi vay) and returns defaults
    const res1 = await call('/api/me/personal/group-settings', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(res1.status).toBe(200);
    const body1 = await json<{ settings: GroupSettingsView }>(res1);
    expect(body1.settings).toEqual({ defaultGroupCategoryId: null, countLoans: false });

    const cats1 = await env.DB.prepare(
      'SELECT id, name, type FROM personal_categories WHERE user_id = ? ORDER BY name',
    )
      .bind(U.minh)
      .all<{ id: string; name: string; type: string }>();
    expect(cats1.results).toHaveLength(FIXED_CATEGORIES.length);
    expect(cats1.results.map((c) => ({ name: c.name, type: c.type }))).toEqual(
      expect.arrayContaining([
        { name: 'Cho vay', type: 'expense' },
        { name: 'Chung', type: 'expense' },
        { name: 'Đi vay', type: 'income' },
      ]),
    );

    // Second read is idempotent (no duplicates)
    const res2 = await call('/api/me/personal/group-settings', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(res2.status).toBe(200);
    const cats2 = await env.DB.prepare(
      'SELECT id FROM personal_categories WHERE user_id = ?',
    )
      .bind(U.minh)
      .all<{ id: string }>();
    expect(cats2.results).toHaveLength(FIXED_CATEGORIES.length);

    // Update settings
    const groupCat = cats1.results.find((c) => c.name === 'Chung')!;
    const putRes = await postJson(
      '/api/me/personal/group-settings',
      sid,
      { defaultGroupCategoryId: groupCat.id, countLoans: true },
      'PUT',
    );
    expect(putRes.status).toBe(200);
    const { settings: updated } = await json<{ settings: GroupSettingsView }>(putRes);
    expect(updated).toEqual({ defaultGroupCategoryId: groupCat.id, countLoans: true });

    // Read back updated settings
    const res3 = await call('/api/me/personal/group-settings', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(res3.status).toBe(200);
    expect((await json<{ settings: GroupSettingsView }>(res3)).settings).toEqual({
      defaultGroupCategoryId: groupCat.id,
      countLoans: true,
    });
  });
});
