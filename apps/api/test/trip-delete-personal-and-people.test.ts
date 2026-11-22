import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  GroupLinkView,
  GroupRow,
  ListResponse,
  PeopleSummaryResponse,
  PersonHistoryView,
  SyncResponse,
  TripView,
  WalletDetailsResponse,
  WalletDetailView,
} from '@cc/core';
import { call, json, linkMember, memberSid, PID, seedTrip, seedUser, T, U } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

type GroupRowsResponse =
  | { status: 'current' }
  | { status: 'rows'; key: string; rows: GroupRow[] };

const auth = (sid: string) => ({ Cookie: `sid=${sid}` });
const post = (path: string, sid: string, body?: unknown) =>
  call(path, {
    method: 'POST',
    headers: body === undefined ? auth(sid) : { ...auth(sid), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function getGroupRows(sid: string, key?: string): Promise<GroupRowsResponse> {
  const path =
    key !== undefined
      ? `/api/me/personal/group-rows?key=${encodeURIComponent(key)}`
      : '/api/me/personal/group-rows';
  const res = await call(path, { headers: auth(sid) });
  expect(res.status).toBe(200);
  return json<GroupRowsResponse>(res);
}

async function getList(sid: string, month = '2026-10'): Promise<ListResponse> {
  const res = await call(`/api/me/personal/transactions?month=${month}&groups=show`, {
    headers: auth(sid),
  });
  expect(res.status).toBe(200);
  return json<ListResponse>(res);
}

async function getWallets(sid: string): Promise<WalletDetailView[]> {
  const res = await call('/api/me/personal/wallets', { headers: auth(sid) });
  expect(res.status).toBe(200);
  return (await json<WalletDetailsResponse>(res)).wallets;
}

async function getSync(
  sid: string,
  prev?: { epoch: string; version: number; ledgerVersion?: number; groupsKey?: string },
): Promise<SyncResponse> {
  const qs = prev
    ? `?epoch=${encodeURIComponent(prev.epoch)}&since=${prev.version}&ledgerVersion=${prev.ledgerVersion ?? 0}&groupsKey=${encodeURIComponent(prev.groupsKey ?? '')}&groups=show`
    : '?groups=show';
  const res = await call(`/api/me/personal/sync${qs}`, { headers: auth(sid) });
  expect(res.status).toBe(200);
  return json<SyncResponse>(res);
}

async function getPeopleSummary(sid: string): Promise<PeopleSummaryResponse> {
  let body: PeopleSummaryResponse | null = null;
  for (let i = 0; i < 10 && (body === null || body.incomplete); i++) {
    const res = await call('/api/me/people/summary', { headers: auth(sid) });
    expect(res.status).toBe(200);
    body = await json<PeopleSummaryResponse>(res);
  }
  expect(body!.incomplete).toBe(false);
  return body!;
}

describe('trip delete: Sổ chi tiêu exclusion and People settlements', () => {
  it('Review Focus 4: scheduling deletion excludes group rows for A and B immediately; cancelling restores custom personal_group_links intact; People stays intact', async () => {
    await seedTrip();
    const sidA = await memberSid(U.minh, 'Minh');
    const sidB = await linkMember(PID.A, U.an, 'An');

    await switchOn(U.minh, 1);
    await switchOn(U.an, 1);

    const wARes = await addWallet(sidA, {
      name: 'Ví Minh',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-10-01',
    });
    expect(wARes.status).toBe(201);
    const { wallet: walletA } = await json<{ wallet: WalletDetailView }>(wARes);

    const wBDefaultRes = await addWallet(sidB, {
      name: 'Ví mặc định An',
      currency: 'VND',
      startAmount: 200_000,
      startDate: '2026-10-01',
    });
    expect(wBDefaultRes.status).toBe(201);
    const wBCustomRes = await addWallet(sidB, {
      name: 'Ví riêng An',
      currency: 'VND',
      startAmount: 500_000,
      startDate: '2026-10-01',
    });
    expect(wBCustomRes.status).toBe(201);
    const { wallet: walletBCustom } = await json<{ wallet: WalletDetailView }>(wBCustomRes);

    await runSql(
      `INSERT INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, created_at, updated_at)
       VALUES ('cat-b', ?, NULL, 'expense', 'Ăn uống nhóm', 'tag', 0, 0, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
      U.an,
    );
    await runSql(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-b1', ?, 'Bạn bè', '2026-10-01T00:00:00.000Z')",
      U.an,
    );
    await runSql(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-b2', ?, 'Đà Lạt', '2026-10-01T00:00:00.000Z')",
      U.an,
    );

    const expRes = await postJson(`/api/trips/${T.tripId}/expenses`, sidA, {
      description: 'Lẩu gà',
      amount: 200_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
      ],
    });
    expect(expRes.status).toBe(201);
    const { expenseId: expId } = await json<{ expenseId: string }>(expRes);

    const expectedBLink: GroupLinkView = {
      walletId: walletBCustom.id,
      categoryId: 'cat-b',
      tagIds: ['tag-b1', 'tag-b2'],
      intent: 'loan',
      excludeFromReports: true,
    };
    const putLinkRes = await postJson(
      `/api/me/personal/group-links/${expId}`,
      sidB,
      {
        walletId: walletBCustom.id,
        categoryId: 'cat-b',
        tagIds: ['tag-b2', 'tag-b1'],
        intent: 'loan',
        excludeFromReports: true,
      },
      'PUT',
    );
    expect(putLinkRes.status).toBe(200);
    expect((await json<{ link: GroupLinkView }>(putLinkRes)).link).toEqual(expectedBLink);

    // Archive the group first (precondition for scheduling deletion)
    expect((await post(`/api/trips/${T.tripId}/archive`, sidA)).status).toBe(204);

    // 2. Before delete: both A and B see the expense in group-rows, list, wallets balance, and sync
    const aRowsBefore = await getGroupRows(sidA);
    const bRowsBefore = await getGroupRows(sidB);
    if (aRowsBefore.status !== 'rows' || bRowsBefore.status !== 'rows') {
      throw new Error('expected initial group-rows');
    }
    expect(aRowsBefore.rows).toHaveLength(1);
    expect(aRowsBefore.rows[0]!.rootId).toBe(expId);
    expect(bRowsBefore.rows).toHaveLength(1);
    expect(bRowsBefore.rows[0]!.rootId).toBe(expId);
    expect(bRowsBefore.rows[0]!.link).toEqual(expectedBLink);

    const aListBefore = await getList(sidA);
    const bListBefore = await getList(sidB);
    expect(aListBefore.groupRows).toHaveLength(1);
    expect(aListBefore.totals).toEqual([{ currency: 'VND', spent: 100_000, income: 0 }]);
    expect(bListBefore.groupRows).toHaveLength(1);
    expect(bListBefore.groupRows![0]!.link).toEqual(expectedBLink);

    const aWalletsBefore = await getWallets(sidA);
    const bWalletsBefore = await getWallets(sidB);
    expect(aWalletsBefore.find((w) => w.id === walletA.id)!.balance).toBe(800_000);
    expect(bWalletsBefore.find((w) => w.id === walletBCustom.id)!.balance).toBe(600_000);

    const aSyncBefore = await getSync(sidA);
    const bSyncBefore = await getSync(sidB);
    expect(aSyncBefore.groups?.rows).toHaveLength(1);
    expect(bSyncBefore.groups?.rows).toHaveLength(1);
    expect(bSyncBefore.groups?.rows[0]!.link).toEqual(expectedBLink);

    // 3. A schedules deletion
    const delRes = await post(`/api/trips/${T.tripId}/delete`, sidA);
    expect(delRes.status).toBe(200);

    // computeGroupsKey changes immediately for both A and B; group-rows returns rows: []
    const aRowsDuring = await getGroupRows(sidA, aRowsBefore.key);
    const bRowsDuring = await getGroupRows(sidB, bRowsBefore.key);
    if (aRowsDuring.status !== 'rows' || bRowsDuring.status !== 'rows') {
      throw new Error('expected rows status when key changed on delete');
    }
    expect(aRowsDuring.key).not.toBe(aRowsBefore.key);
    expect(bRowsDuring.key).not.toBe(bRowsBefore.key);
    expect(aRowsDuring.rows).toEqual([]);
    expect(bRowsDuring.rows).toEqual([]);

    // List, wallets, and sync immediately exclude the group's transactions for both A and B
    const aListDuring = await getList(sidA);
    const bListDuring = await getList(sidB);
    expect(aListDuring.groupRows).toEqual([]);
    expect(aListDuring.totals).toEqual([]);
    expect(bListDuring.groupRows).toEqual([]);

    const aWalletsDuring = await getWallets(sidA);
    const bWalletsDuring = await getWallets(sidB);
    expect(aWalletsDuring.find((w) => w.id === walletA.id)!.balance).toBe(1_000_000);
    expect(bWalletsDuring.find((w) => w.id === walletBCustom.id)!.balance).toBe(500_000);

    const aSyncDuring = await getSync(sidA, {
      epoch: aSyncBefore.epoch,
      version: aSyncBefore.version,
      ledgerVersion: aSyncBefore.ledger?.version ?? 0,
      groupsKey: aSyncBefore.groups!.key,
    });
    const bSyncDuring = await getSync(sidB, {
      epoch: bSyncBefore.epoch,
      version: bSyncBefore.version,
      ledgerVersion: bSyncBefore.ledger?.version ?? 0,
      groupsKey: bSyncBefore.groups!.key,
    });
    expect(aSyncDuring.groups).toBeTruthy();
    expect(aSyncDuring.groups!.key).not.toBe(aSyncBefore.groups!.key);
    expect(aSyncDuring.groups!.rows).toEqual([]);
    expect(bSyncDuring.groups).toBeTruthy();
    expect(bSyncDuring.groups!.key).not.toBe(bSyncBefore.groups!.key);
    expect(bSyncDuring.groups!.rows).toEqual([]);

    // PUT /me/personal/group-links/:rootId returns 404 NOT_FOUND for a pending-delete group
    for (const sid of [sidA, sidB]) {
      const linkEditRes = await postJson(
        `/api/me/personal/group-links/${expId}`,
        sid,
        { excludeFromReports: false },
        'PUT',
      );
      expect(linkEditRes.status).toBe(404);
      expect((await json<{ error: { code: string } }>(linkEditRes)).error.code).toBe('NOT_FOUND');
    }

    // People stays intact during the 30-day wait for both A and B
    const aPeople = await getPeopleSummary(sidA);
    const bPeople = await getPeopleSummary(sidB);
    expect(aPeople.people.find((p) => p.key === `u:${U.an}`)).toMatchObject({ total: 100_000 });
    expect(bPeople.people.find((p) => p.key === `u:${U.minh}`)).toMatchObject({ total: -100_000 });

    const aHistRes = await call(`/api/me/people/${encodeURIComponent(`u:${U.an}`)}/history`, {
      headers: auth(sidA),
    });
    expect(aHistRes.status).toBe(200);
    const aHist = await json<PersonHistoryView>(aHistRes);
    expect(aHist.total).toBe(100_000);
    expect(aHist.places.map((p) => p.tripId)).toContain(T.tripId);

    const bHistRes = await call(`/api/me/people/${encodeURIComponent(`u:${U.minh}`)}/history`, {
      headers: auth(sidB),
    });
    expect(bHistRes.status).toBe(200);
    const bHist = await json<PersonHistoryView>(bHistRes);
    expect(bHist.total).toBe(-100_000);
    expect(bHist.places.map((p) => p.tripId)).toContain(T.tripId);

    // 4. A cancels deletion: group rows and B's custom personal_group_links return intact
    expect((await post(`/api/trips/${T.tripId}/cancel-delete`, sidA)).status).toBe(204);

    const aRowsAfter = await getGroupRows(sidA, aRowsDuring.key);
    const bRowsAfter = await getGroupRows(sidB, bRowsDuring.key);
    if (aRowsAfter.status !== 'rows' || bRowsAfter.status !== 'rows') {
      throw new Error('expected rows status after cancel-delete');
    }
    expect(aRowsAfter.rows).toHaveLength(1);
    expect(aRowsAfter.rows[0]!.rootId).toBe(expId);
    expect(bRowsAfter.rows).toHaveLength(1);
    expect(bRowsAfter.rows[0]!.link).toEqual(expectedBLink);

    const aListAfter = await getList(sidA);
    const bListAfter = await getList(sidB);
    expect(aListAfter.groupRows).toHaveLength(1);
    expect(aListAfter.totals).toEqual([{ currency: 'VND', spent: 100_000, income: 0 }]);
    expect(bListAfter.groupRows).toHaveLength(1);
    expect(bListAfter.groupRows![0]!.link).toEqual(expectedBLink);

    const aWalletsAfter = await getWallets(sidA);
    const bWalletsAfter = await getWallets(sidB);
    expect(aWalletsAfter.find((w) => w.id === walletA.id)!.balance).toBe(800_000);
    expect(bWalletsAfter.find((w) => w.id === walletBCustom.id)!.balance).toBe(600_000);

    const aSyncAfter = await getSync(sidA, {
      epoch: aSyncDuring.epoch,
      version: aSyncDuring.version,
      ledgerVersion: aSyncDuring.ledger?.version ?? 0,
      groupsKey: aSyncDuring.groups!.key,
    });
    const bSyncAfter = await getSync(sidB, {
      epoch: bSyncDuring.epoch,
      version: bSyncDuring.version,
      ledgerVersion: bSyncDuring.ledger?.version ?? 0,
      groupsKey: bSyncDuring.groups!.key,
    });
    expect(aSyncAfter.groups?.rows).toHaveLength(1);
    expect(bSyncAfter.groups?.rows).toHaveLength(1);
    expect(bSyncAfter.groups?.rows[0]!.link).toEqual(expectedBLink);
  }, 30_000);

  async function seedOwenMinhArchivedAndDirect(opts: { pendingDelete?: boolean } = {}) {
    const ownerId = 'u-owner';
    await seedUser(ownerId, 'Owen');
    await seedUser(U.minh, 'Minh');
    const now = '2026-10-20T00:00:00.000Z';

    await runSql(
      "INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES ('t-arch', 'Archived Group', 'trip', 'VND', 1, 0, ?, 'g-arch', 'v-arch', 0, ?, ?)",
      ownerId,
      now,
      now,
    );
    await runSql(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('arch-o', 't-arch', 'Owen', 'owen', ?, 'active', 0, ?)",
      ownerId,
      now,
    );
    await runSql(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('arch-m', 't-arch', 'Minh', 'minh', ?, 'active', 1, ?)",
      U.minh,
      now,
    );
    await runSql(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-arch', 'e-arch', NULL, 1, 't-arch', 'expense', 'Hotel', 400000, 'VND', '2026-10-10', 'arch-o', 'equal', 'approved', 'arch-o', ?, ?)",
      now,
      now,
    );
    await runSql(
      "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-arch', 'arch-o', 1, 200000), ('e-arch', 'arch-m', 1, 200000)",
    );

    await runSql(
      "INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES ('t-led', 'Owen', 'direct', 'VND', 1, 0, ?, 'g-led', 'v-led', 0, ?)",
      ownerId,
      now,
    );
    await runSql(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('led-o', 't-led', 'Owen', 'owen', ?, 'active', 0, ?)",
      ownerId,
      now,
    );
    await runSql(
      "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES ('led-m', 't-led', 'Minh', 'minh', ?, 'active', 1, ?)",
      U.minh,
      now,
    );
    await runSql(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-led', 'e-led', NULL, 1, 't-led', 'expense', 'Coffee', 240000, 'VND', '2026-10-11', 'led-o', 'equal', 'approved', 'led-o', ?, ?)",
      now,
      now,
    );
    await runSql(
      "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-led', 'led-o', 1, 120000), ('e-led', 'led-m', 1, 120000)",
    );

    const ownerSid = await memberSid(ownerId, 'Owen');
    if (opts.pendingDelete) {
      expect((await post('/api/trips/t-arch/delete', ownerSid)).status).toBe(200);
    }
    return { ownerSid };
  }

  it('archived People-tab settlement records directly inside the archived group and leaves 0₫ after deletion', async () => {
    const { ownerSid } = await seedOwenMinhArchivedAndDirect();

    const settleRes = await post('/api/me/people/u%3Au-minh/settle', ownerSid, {
      paid: 320_000,
      direction: 'toOwner',
    });
    expect(settleRes.status).toBe(201);

    const payRows = await env.DB.prepare(
      "SELECT trip_id, payer_id, to_id, amount, status FROM transactions WHERE type = 'payment' ORDER BY trip_id",
    ).all<{ trip_id: string; payer_id: string; to_id: string; amount: number; status: string }>();
    expect(payRows.results).toEqual([
      { trip_id: 't-arch', payer_id: 'arch-m', to_id: 'arch-o', amount: 200_000, status: 'confirmed' },
      { trip_id: 't-led', payer_id: 'led-m', to_id: 'led-o', amount: 120_000, status: 'confirmed' },
    ]);

    const archView = await json<TripView>(
      call('/api/trips/t-arch', { headers: auth(ownerSid) }),
    );
    expect(archView.suggestions).toEqual([]);
    expect(archView.myBalance?.now).toBe(0);

    const ledView = await json<TripView>(
      call('/api/trips/t-led', { headers: auth(ownerSid) }),
    );
    expect(ledView.suggestions).toEqual([]);
    expect(ledView.myBalance?.now).toBe(0);

    expect((await getPeopleSummary(ownerSid)).people.find((p) => p.key === 'u:u-minh')).toBeUndefined();

    // Deleting t-arch later leaves 0₫ in direct instead of a phantom reverse debt
    await runSql("DELETE FROM transaction_shares WHERE transaction_id IN (SELECT id FROM transactions WHERE trip_id = 't-arch')");
    await runSql("DELETE FROM activity WHERE trip_id = 't-arch'");
    await runSql("DELETE FROM trip_views WHERE trip_id = 't-arch'");
    await runSql("DELETE FROM transactions WHERE trip_id = 't-arch'");
    await runSql("DELETE FROM participants WHERE trip_id = 't-arch'");
    await runSql("DELETE FROM trips WHERE id = 't-arch'");

    expect((await getPeopleSummary(ownerSid)).people.find((p) => p.key === 'u:u-minh')).toBeUndefined();
  });

  it('pending-delete People-tab settlement also records directly inside the pending-delete group during the 30-day wait', async () => {
    const { ownerSid } = await seedOwenMinhArchivedAndDirect({ pendingDelete: true });

    const before = await getPeopleSummary(ownerSid);
    expect(before.people.find((p) => p.key === 'u:u-minh')?.total).toBe(320_000);

    const histBefore = await json<PersonHistoryView>(
      call('/api/me/people/u%3Au-minh/history', { headers: auth(ownerSid) }),
    );
    expect(histBefore.total).toBe(320_000);
    expect(histBefore.places.map((p) => p.tripId)).toEqual(['t-arch', 't-led']);

    const settleRes = await post('/api/me/people/u%3Au-minh/settle', ownerSid, {
      paid: 320_000,
      direction: 'toOwner',
    });
    expect(settleRes.status).toBe(201);

    const payRows = await env.DB.prepare(
      "SELECT trip_id, payer_id, to_id, amount, status FROM transactions WHERE type = 'payment' ORDER BY trip_id",
    ).all<{ trip_id: string; payer_id: string; to_id: string; amount: number; status: string }>();
    expect(payRows.results).toEqual([
      { trip_id: 't-arch', payer_id: 'arch-m', to_id: 'arch-o', amount: 200_000, status: 'confirmed' },
      { trip_id: 't-led', payer_id: 'led-m', to_id: 'led-o', amount: 120_000, status: 'confirmed' },
    ]);

    const archView = await json<TripView>(
      call('/api/trips/t-arch', { headers: auth(ownerSid) }),
    );
    expect(archView.suggestions).toEqual([]);
    expect(archView.myBalance?.now).toBe(0);

    expect((await getPeopleSummary(ownerSid)).people.find((p) => p.key === 'u:u-minh')).toBeUndefined();
  });
});
