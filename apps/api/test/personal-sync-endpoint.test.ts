import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  SyncResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getSync = (sid: string | null, query = '') =>
  call(`/api/me/personal/sync${query}`, sid ? as(sid) : {});

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const patchEntry = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/transactions/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteEntry = (sid: string, id: string) =>
  postJson(`/api/me/personal/transactions/${encodeURIComponent(id)}`, sid, {}, 'DELETE');

/** The entry routes stamp rows themselves (commitPersonalWrite), so these only call the API. */
async function stampEntry(_userId: string, _txId: string): Promise<void> {}

async function editAndStamp(sid: string, _userId: string, id: string, body: unknown) {
  const res = await patchEntry(sid, id, body);
  expect(res.status).toBe(200);
  return res;
}

async function deleteAndRecord(sid: string, _userId: string, id: string) {
  const res = await deleteEntry(sid, id);
  expect(res.status).toBe(200);
  return res;
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal saved-copy sync endpoint GET /me/personal/sync', () => {
  it('no since -> reset with every row and the ledger', async () => {
    const userId = 'u-sync-1';
    const sid = await memberSid(userId, 'Sync1');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const e1 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Pho',
          tags: ['Food'],
        }),
      )
    ).entries[0]!;
    await stampEntry(userId, e1.id);

    const e2 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 30_000,
          categoryId: food.id,
          date: '2026-11-11',
          note: 'Coffee',
        }),
      )
    ).entries[0]!;
    await stampEntry(userId, e2.id);

    // Ledger quick expense
    const ledger = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sid)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sid, { name: 'Lan' }),
    );
    await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
      description: 'Lunch',
      amount: 100_000,
      spentOn: '2026-11-12',
      payerId: ledger.ownerPid,
      mode: 'equal',
      entries: [
        { participantId: ledger.ownerPid, value: 1 },
        { participantId: lanPid, value: 1 },
      ],
    });

    const res = await getSync(sid, '');
    expect(res.status).toBe(200);
    const data = await json<SyncResponse>(res);

    expect(data.status).toBe('reset');
    expect(data.epoch).toBe('1.0');
    expect(data.version).toBe(2);
    expect(data.entries).toHaveLength(2);
    expect(data.entries.map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(data.entries[0]!.note).toBe('Pho');
    expect(data.entries[0]!.tagIds).toHaveLength(1);
    expect(data.entries[0]!.excludeFromReports).toBe(false);
    expect(data.removedIds).toEqual([]);
    expect(data.cursor).toBeNull();
    expect(data.ledger).not.toBeNull();
    expect(data.ledger?.rows).toHaveLength(1);
    expect(data.ledger?.rows[0]!.note).toBe('Lunch');
    expect(data.ledger?.rows[0]!.share).toBe(50_000);
    expect(data.ledger?.rows[0]!.total).toBe(100_000);
    expect(data.ledger?.rows[0]!.people).toEqual(['Lan']);
  });

  it('same version and ledger -> current with no entries', async () => {
    const userId = 'u-sync-2';
    const sid = await memberSid(userId, 'Sync2');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const e1 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Pho',
        }),
      )
    ).entries[0]!;
    await stampEntry(userId, e1.id);

    // Initial reset
    const resetRes = await json<SyncResponse>(await getSync(sid, ''));
    expect(resetRes.status).toBe('reset');

    // Query with same version and ledger version
    const ledgerVer = resetRes.ledger?.version ?? 0;
    const currentRes = await getSync(
      sid,
      `?epoch=${resetRes.epoch}&since=${resetRes.version}&ledgerVersion=${ledgerVer}`,
    );
    expect(currentRes.status).toBe(200);
    const data = await json<SyncResponse>(currentRes);

    expect(data.status).toBe('current');
    expect(data.epoch).toBe(resetRes.epoch);
    expect(data.version).toBe(resetRes.version);
    expect(data.entries).toEqual([]);
    expect(data.removedIds).toEqual([]);
    expect(data.cursor).toBeNull();
    expect(data.ledger).toBeNull();
  });

  it('after an edit -> delta with just that row', async () => {
    const userId = 'u-sync-3';
    const sid = await memberSid(userId, 'Sync3');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const e1 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Pho',
        }),
      )
    ).entries[0]!;
    await stampEntry(userId, e1.id);

    const e2 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 20_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Tea',
        }),
      )
    ).entries[0]!;
    await stampEntry(userId, e2.id);

    const resetRes = await json<SyncResponse>(await getSync(sid, ''));
    const initialVersion = resetRes.version;
    const ledgerVer = resetRes.ledger?.version ?? 0;

    // Edit e1
    await editAndStamp(sid, userId, e1.id, {
      type: 'expense',
      walletId: wallet.id,
      amount: 55_000,
      categoryId: food.id,
      date: '2026-11-10',
      note: 'Pho Dac Biet',
    });

    const deltaRes = await getSync(
      sid,
      `?epoch=${resetRes.epoch}&since=${initialVersion}&ledgerVersion=${ledgerVer}`,
    );
    expect(deltaRes.status).toBe(200);
    const data = await json<SyncResponse>(deltaRes);

    expect(data.status).toBe('delta');
    expect(data.epoch).toBe(resetRes.epoch);
    expect(data.version).toBe(initialVersion + 1);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]!.id).toBe(e1.id);
    expect(data.entries[0]!.amount).toBe(55_000);
    expect(data.entries[0]!.note).toBe('Pho Dac Biet');
    expect(data.entries[0]!.syncVersion).toBe(initialVersion + 1);
    expect(data.removedIds).toEqual([]);
    expect(data.cursor).toBeNull();
    expect(data.ledger).toBeNull();
  });

  it('after a delete -> delta with removedIds', async () => {
    const userId = 'u-sync-4';
    const sid = await memberSid(userId, 'Sync4');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const e1 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Pho',
        }),
      )
    ).entries[0]!;
    await stampEntry(userId, e1.id);

    const resetRes = await json<SyncResponse>(await getSync(sid, ''));
    const initialVersion = resetRes.version;
    const ledgerVer = resetRes.ledger?.version ?? 0;

    // Delete e1
    await deleteAndRecord(sid, userId, e1.id);

    const deltaRes = await getSync(
      sid,
      `?epoch=${resetRes.epoch}&since=${initialVersion}&ledgerVersion=${ledgerVer}`,
    );
    expect(deltaRes.status).toBe(200);
    const data = await json<SyncResponse>(deltaRes);

    expect(data.status).toBe('delta');
    expect(data.epoch).toBe(resetRes.epoch);
    expect(data.version).toBe(initialVersion + 1);
    expect(data.entries).toEqual([]);
    expect(data.removedIds).toEqual([e1.id]);
    expect(data.cursor).toBeNull();
    expect(data.ledger).toBeNull();
  });

  it('a full page of tagged rows returns every tag (more than 100 ids in one page)', async () => {
    const userId = 'u-sync-tags-150';
    const sid = await memberSid(userId, 'SyncTags');
    await switchOn(userId);
    const now = '2026-11-19T00:00:00.000Z';
    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES ('w-sync-tags', ?, 'Cash', 'VND', 0, '2026-01-01', 1, ?, ?)",
    )
      .bind(userId, now, now)
      .run();
    await env.DB.prepare("INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-sync-150', ?, 'an', ?)")
      .bind(userId, now)
      .run();
    const stmts = [];
    for (let j = 0; j < 150; j++) {
      const id = `txt-${String(j).padStart(4, '0')}`;
      stmts.push(
        env.DB.prepare(
          "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES (?, ?, 'w-sync-tags', 'expense', 1000, '2026-11-19', ?, ?)",
        ).bind(id, userId, now, now),
        env.DB.prepare("INSERT INTO personal_transaction_tags (transaction_id, tag_id) VALUES (?, 'tag-sync-150')").bind(id),
      );
    }
    await env.DB.batch(stmts);

    const data = await json<SyncResponse>(await getSync(sid, ''));
    expect(data.entries).toHaveLength(150);
    expect(data.entries.every((e) => e.tagIds.length === 1 && e.tagIds[0] === 'tag-sync-150')).toBe(true);
  });

  it('1,201 rows page as 500/500/201 with cursors, no duplicates or gaps', async () => {
    const userId = 'u-sync-5';
    const sid = await memberSid(userId, 'Sync5');
    await switchOn(userId);

    const walletId = 'w-sync-5';
    await env.DB.prepare(
      "INSERT INTO personal_wallets (id, user_id, name, currency, start_amount, start_date, is_default, created_at, updated_at) VALUES (?, ?, 'Cash', 'VND', 0, '2026-01-01', 1, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z')",
    )
      .bind(walletId, userId)
      .run();

    // Seed 1,201 rows straight into personal_transactions with env.DB batches for speed, sync_version 0
    const total = 1201;
    const batchSize = 100;
    for (let i = 0; i < total; i += batchSize) {
      const stmts = [];
      const end = Math.min(i + batchSize, total);
      for (let j = i; j < end; j++) {
        const id = `tx-${String(j + 1).padStart(5, '0')}`;
        stmts.push(
          env.DB.prepare(
            "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at, sync_version) VALUES (?, ?, ?, 'expense', 1000, '2026-11-19', '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z', 0)",
          ).bind(id, userId, walletId),
        );
      }
      await env.DB.batch(stmts);
    }

    // Page 1
    const p1Res = await getSync(sid, '');
    expect(p1Res.status).toBe(200);
    const p1 = await json<SyncResponse>(p1Res);
    expect(p1.status).toBe('reset');
    expect(p1.entries).toHaveLength(500);
    expect(p1.cursor).not.toBeNull();
    expect(p1.cursor?.v).toBe(0);
    expect(p1.cursor?.id).toBe('tx-00500');

    // Page 2
    const p2Res = await getSync(sid, `?cursorV=${p1.cursor!.v}&cursorId=${p1.cursor!.id}`);
    expect(p2Res.status).toBe(200);
    const p2 = await json<SyncResponse>(p2Res);
    expect(p2.status).toBe('reset');
    expect(p2.entries).toHaveLength(500);
    expect(p2.cursor).not.toBeNull();
    expect(p2.cursor?.v).toBe(0);
    expect(p2.cursor?.id).toBe('tx-01000');
    expect(p2.ledger).toBeNull();
    expect(p2.removedIds).toEqual([]);

    // Page 3
    const p3Res = await getSync(sid, `?cursorV=${p2.cursor!.v}&cursorId=${p2.cursor!.id}`);
    expect(p3Res.status).toBe(200);
    const p3 = await json<SyncResponse>(p3Res);
    expect(p3.status).toBe('reset');
    expect(p3.entries).toHaveLength(201);
    expect(p3.cursor).toBeNull();

    // Verify all 1,201 rows: no duplicates, no gaps
    const allIds = [
      ...p1.entries.map((e) => e.id),
      ...p2.entries.map((e) => e.id),
      ...p3.entries.map((e) => e.id),
    ];
    expect(allIds).toHaveLength(1201);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(1201);
    for (let k = 0; k < 1201; k++) {
      expect(allIds[k]).toBe(`tx-${String(k + 1).padStart(5, '0')}`);
    }
  });

  it('wrong epoch -> reset', async () => {
    const userId = 'u-sync-6';
    const sid = await memberSid(userId, 'Sync6');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const e1 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Pho',
        }),
      )
    ).entries[0]!;
    await stampEntry(userId, e1.id);

    // Call with wrong epoch
    const res = await getSync(sid, '?epoch=wrong-epoch.0&since=1');
    expect(res.status).toBe(200);
    const data = await json<SyncResponse>(res);

    expect(data.status).toBe('reset');
    expect(data.epoch).toBe('1.0');
    expect(data.version).toBe(1);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]!.id).toBe(e1.id);
  });

  it('since below purgedVersion -> reset', async () => {
    const userId = 'u-sync-7';
    const sid = await memberSid(userId, 'Sync7');
    await switchOn(userId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const e1 = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Pho',
        }),
      )
    ).entries[0]!;

    // Set purged_version directly
    await env.DB.prepare(
      "INSERT INTO personal_sync_state (user_id, version, epoch, purged_version, updated_at) VALUES (?, 10, 0, 5, '2026-11-19T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET version = excluded.version, purged_version = excluded.purged_version",
    )
      .bind(userId)
      .run();

    // Call with since < purged_version (since = 3, purged_version = 5)
    const res = await getSync(sid, '?epoch=1.0&since=3');
    expect(res.status).toBe(200);
    const data = await json<SyncResponse>(res);

    expect(data.status).toBe('reset');
    expect(data.epoch).toBe('1.0');
    expect(data.version).toBe(10);
    expect(data.entries).toHaveLength(1);
  });

  it('a quick expense added -> ledger rows resent with the new trip version', async () => {
    const userId = 'u-sync-8';
    const sid = await memberSid(userId, 'Sync8');
    await switchOn(userId);

    // Initial ledger setup
    const ledger = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sid)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sid, { name: 'Lan' }),
    );
    await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
      description: 'First meal',
      amount: 100_000,
      spentOn: '2026-11-12',
      payerId: ledger.ownerPid,
      mode: 'equal',
      entries: [
        { participantId: ledger.ownerPid, value: 1 },
        { participantId: lanPid, value: 1 },
      ],
    });

    // Initial sync to capture version and ledgerVersion
    const res1 = await json<SyncResponse>(await getSync(sid, ''));
    expect(res1.status).toBe('reset');
    expect(res1.ledger).not.toBeNull();
    const initialLedgerVersion = res1.ledger!.version;
    expect(res1.ledger!.rows).toHaveLength(1);

    // Add a second quick expense to the ledger
    await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
      description: 'Second meal',
      amount: 200_000,
      spentOn: '2026-11-13',
      payerId: ledger.ownerPid,
      mode: 'equal',
      entries: [
        { participantId: ledger.ownerPid, value: 1 },
        { participantId: lanPid, value: 1 },
      ],
    });

    // Sync with previous since and previous ledgerVersion
    const res2 = await getSync(
      sid,
      `?epoch=${res1.epoch}&since=${res1.version}&ledgerVersion=${initialLedgerVersion}`,
    );
    expect(res2.status).toBe(200);
    const data = await json<SyncResponse>(res2);

    expect(data.status).toBe('delta');
    expect(data.entries).toEqual([]);
    expect(data.removedIds).toEqual([]);
    expect(data.ledger).not.toBeNull();
    expect(data.ledger!.version).toBeGreaterThan(initialLedgerVersion);
    expect(data.ledger!.rows).toHaveLength(2);
    const notes = data.ledger!.rows.map((r) => r.note);
    expect(notes).toContain('First meal');
    expect(notes).toContain('Second meal');
  });

  it('personal area off -> 403', async () => {
    const userId = 'u-sync-9';
    const sid = await memberSid(userId, 'Sync9');
    // Note: switchOn is NOT called, so personal area is off

    const res = await getSync(sid, '');
    expect(res.status).toBe(403);
  });

  it('invalid numbers in the query -> 422', async () => {
    const userId = 'u-sync-10';
    const sid = await memberSid(userId, 'Sync10');
    await switchOn(userId);

    expect((await getSync(sid, '?since=bad')).status).toBe(422);
    expect((await getSync(sid, '?ledgerVersion=bad')).status).toBe(422);
    expect((await getSync(sid, '?cursorV=bad')).status).toBe(422);
    expect((await getSync(sid, '?cursorV=0')).status).toBe(422);
    expect((await getSync(sid, '?cursorId=tx1')).status).toBe(422);
  });
});
