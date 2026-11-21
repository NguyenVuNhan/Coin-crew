import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  ListResponse,
  SyncResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getList = (sid: string, query = '') =>
  call(`/api/me/personal/transactions${query}`, as(sid));

const getSync = (sid: string, query = '') =>
  call(`/api/me/personal/sync${query}`, as(sid));

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function seedDirectGroup(opts: {
  tripId: string;
  ownerUserId: string;
  people: { id: string; name: string; userId: string | null; sortOrder: number }[];
}) {
  await runSql(
    `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at)
     VALUES (?, 'Với người khác', 'direct', 'VND', 1, 0, ?, ?, ?, 1, '2026-10-01T00:00:00.000Z')`,
    opts.tripId,
    opts.ownerUserId,
    `gtok-${opts.tripId}`,
    `vtok-${opts.tripId}`,
  );
  for (const p of opts.people) {
    await runSql(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, '2026-10-01T00:00:00.000Z')`,
      p.id,
      opts.tripId,
      p.name,
      p.name.toLowerCase(),
      p.userId,
      p.sortOrder,
    );
  }
}

async function seedDirectExpense(opts: {
  id: string;
  tripId: string;
  description: string;
  amount: number;
  spentOn: string;
  payerId: string;
  createdByParticipantId: string;
  shares: { participantId: string; amount: number }[];
}) {
  const createdAt = `${opts.spentOn}T10:00:00.000Z`;
  await runSql(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
      currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
      meta_json, created_at, updated_at
    ) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, NULL, 'VND', ?, ?, NULL, 'equal', 'approved', ?, NULL, ?, ?)`,
    opts.id,
    opts.id,
    opts.tripId,
    opts.description,
    opts.amount,
    opts.spentOn,
    opts.payerId,
    opts.createdByParticipantId,
    createdAt,
    createdAt,
  );
  for (const s of opts.shares) {
    await runSql(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)',
      opts.id,
      s.participantId,
      s.amount,
    );
  }
}

afterEach(async () => {
  await runSql('DELETE FROM personal_group_link_tags');
  await runSql('DELETE FROM personal_group_links');
  await runSql('DELETE FROM personal_sync_deletions');
  await runSql('DELETE FROM personal_sync_state');
  await runSql('DELETE FROM personal_transaction_tags');
  await runSql('DELETE FROM personal_transactions');
  await runSql('DELETE FROM personal_wallets');
  await runSql('DELETE FROM transaction_shares');
  await runSql('DELETE FROM transactions');
  await runSql('DELETE FROM participants');
  await runSql('DELETE FROM trips');
});

describe('groups=show sends every group row as GroupRow and drops PersonRow', () => {
  it('direct expense not involving me is not sent', async () => {
    const ownerId = 'u-show-owner-1';
    const sid = await memberSid(ownerId, 'Nhan');
    await switchOn(ownerId);
    await addWallet(sid, { name: 'Techcombank', startAmount: 1_000_000, startDate: '2026-10-01' });

    await seedDirectGroup({
      tripId: 't-direct-1',
      ownerUserId: ownerId,
      people: [
        { id: 'p-nhan-1', name: 'Nhan', userId: ownerId, sortOrder: 0 },
        { id: 'p-minh-1', name: 'Minh', userId: null, sortOrder: 1 },
        { id: 'p-lan-1', name: 'Lan', userId: null, sortOrder: 2 },
      ],
    });

    // Owner creates a quick expense paid by Minh for Minh + Lan only (owner neither paid nor has a share).
    await seedDirectExpense({
      id: 'e-other-only',
      tripId: 't-direct-1',
      description: 'Cà phê Minh và Lan',
      amount: 90_000,
      spentOn: '2026-10-10',
      payerId: 'p-minh-1',
      createdByParticipantId: 'p-nhan-1',
      shares: [
        { participantId: 'p-minh-1', amount: 45_000 },
        { participantId: 'p-lan-1', amount: 45_000 },
      ],
    });

    // With groups=show: absent from both rows and groupRows.
    const showRes = await getList(sid, '?month=2026-10&groups=show');
    expect(showRes.status).toBe(200);
    const showBody = await json<ListResponse>(showRes);
    expect(showBody.rows).toEqual([]);
    expect(showBody.groupRows).toEqual([]);
    expect(showBody.totals).toEqual([]);

    // Without groups=show: old path is unchanged (present as a PersonRow).
    const oldRes = await getList(sid, '?month=2026-10');
    expect(oldRes.status).toBe(200);
    const oldBody = await json<ListResponse>(oldRes);
    expect(oldBody.rows).toHaveLength(1);
    expect(oldBody.rows[0]).toMatchObject({
      kind: 'person',
      id: 'e-other-only',
    });
    expect('groupRows' in oldBody).toBe(false);
  });

  it('direct expense I paid comes as a group row', async () => {
    const ownerId = 'u-show-owner-2';
    const sid = await memberSid(ownerId, 'Nhan');
    await switchOn(ownerId);
    await addWallet(sid, { name: 'Techcombank', startAmount: 1_000_000, startDate: '2026-10-01' });

    await seedDirectGroup({
      tripId: 't-direct-2',
      ownerUserId: ownerId,
      people: [
        { id: 'p-nhan-2', name: 'Nhan', userId: ownerId, sortOrder: 0 },
        { id: 'p-minh-2', name: 'Minh', userId: null, sortOrder: 1 },
      ],
    });

    await seedDirectExpense({
      id: 'e-direct-paid',
      tripId: 't-direct-2',
      description: 'Ăn trưa với Minh',
      amount: 120_000,
      spentOn: '2026-10-12',
      payerId: 'p-nhan-2',
      createdByParticipantId: 'p-nhan-2',
      shares: [
        { participantId: 'p-nhan-2', amount: 60_000 },
        { participantId: 'p-minh-2', amount: 60_000 },
      ],
    });

    const res = await getList(sid, '?month=2026-10&groups=show');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);

    expect(body.rows).toEqual([]);
    expect(body.groupRows).toHaveLength(1);
    expect(body.groupRows![0]).toMatchObject({
      kind: 'group',
      id: 'e-direct-paid',
      tripId: 't-direct-2',
      isDirect: true,
      source: 'expense',
      title: 'Ăn trưa với Minh',
      total: 120_000,
      myShare: 60_000,
      iPaid: true,
    });
    expect(body.totals).toEqual([{ currency: 'VND', spent: 60_000, income: 0 }]);
  });

  it('no person rows with groups=show', async () => {
    const ownerId = 'u-show-owner-3';
    const sid = await memberSid(ownerId, 'Nhan');
    await switchOn(ownerId);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Techcombank', startAmount: 1_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await call('/api/me/personal/categories', as(sid)))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const entry = (
      await json<EntriesResponse>(
        await postJson('/api/me/personal/transactions', sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 40_000,
          categoryId: food.id,
          date: '2026-10-05',
          note: 'Cà phê',
        }),
      )
    ).entries[0]!;

    await seedDirectGroup({
      tripId: 't-direct-3',
      ownerUserId: ownerId,
      people: [
        { id: 'p-nhan-3', name: 'Nhan', userId: ownerId, sortOrder: 0 },
        { id: 'p-minh-3', name: 'Minh', userId: null, sortOrder: 1 },
      ],
    });
    await seedDirectExpense({
      id: 'e-direct-shared',
      tripId: 't-direct-3',
      description: 'Trà sữa',
      amount: 80_000,
      spentOn: '2026-10-08',
      payerId: 'p-minh-3',
      createdByParticipantId: 'p-nhan-3',
      shares: [
        { participantId: 'p-nhan-3', amount: 40_000 },
        { participantId: 'p-minh-3', amount: 40_000 },
      ],
    });

    const res = await getList(sid, '?month=2026-10&groups=show');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);

    expect(body.rows.every((r) => r.kind !== 'person')).toBe(true);
    expect(body.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([entry.id]);
    expect(body.groupRows?.map((r) => r.id)).toEqual(['e-direct-shared']);
    expect(body.totals).toEqual([{ currency: 'VND', spent: 80_000, income: 0 }]);

    const personTypeRes = await getList(sid, '?month=2026-10&groups=show&type=person');
    expect(personTypeRes.status).toBe(200);
    const personTypeBody = await json<ListResponse>(personTypeRes);
    expect(personTypeBody.rows).toEqual([]);
  });

  it('sync groups=show has no ledger and includes direct expenses', async () => {
    const ownerId = 'u-show-owner-4';
    const sid = await memberSid(ownerId, 'Nhan');
    await switchOn(ownerId);

    await seedDirectGroup({
      tripId: 't-direct-4',
      ownerUserId: ownerId,
      people: [
        { id: 'p-nhan-4', name: 'Nhan', userId: ownerId, sortOrder: 0 },
        { id: 'p-minh-4', name: 'Minh', userId: null, sortOrder: 1 },
        { id: 'p-lan-4', name: 'Lan', userId: null, sortOrder: 2 },
      ],
    });
    await seedDirectExpense({
      id: 'e-sync-mine',
      tripId: 't-direct-4',
      description: 'Bún bò',
      amount: 100_000,
      spentOn: '2026-10-10',
      payerId: 'p-nhan-4',
      createdByParticipantId: 'p-nhan-4',
      shares: [
        { participantId: 'p-nhan-4', amount: 50_000 },
        { participantId: 'p-minh-4', amount: 50_000 },
      ],
    });
    await seedDirectExpense({
      id: 'e-sync-others',
      tripId: 't-direct-4',
      description: 'Minh và Lan',
      amount: 70_000,
      spentOn: '2026-10-11',
      payerId: 'p-minh-4',
      createdByParticipantId: 'p-nhan-4',
      shares: [
        { participantId: 'p-minh-4', amount: 35_000 },
        { participantId: 'p-lan-4', amount: 35_000 },
      ],
    });

    const res = await getSync(sid, '?groups=show');
    expect(res.status).toBe(200);
    const data = await json<SyncResponse>(res);

    expect(data.status).toBe('reset');
    expect(data.ledger).toBeNull();
    expect(data.groups).not.toBeNull();
    expect(data.groups!.rows.map((r) => r.id)).toEqual(['e-sync-mine']);
    expect(data.groups!.rows[0]).toMatchObject({
      kind: 'group',
      isDirect: true,
      source: 'expense',
      total: 100_000,
      myShare: 50_000,
      iPaid: true,
    });

    // Subsequent sync with groups=show and matching groupsKey stays current with ledger: null.
    const nextRes = await getSync(
      sid,
      `?groups=show&epoch=${encodeURIComponent(data.epoch)}&since=${data.version}&groupsKey=${encodeURIComponent(data.groups!.key)}`,
    );
    expect(nextRes.status).toBe(200);
    const nextData = await json<SyncResponse>(nextRes);
    expect(nextData.status).toBe('current');
    expect(nextData.ledger).toBeNull();
    expect(nextData.groups).toBeNull();

    // Without groups=show: ledger is still returned as before and groups is absent.
    const oldRes = await getSync(sid);
    expect(oldRes.status).toBe(200);
    const oldData = await json<SyncResponse>(oldRes);
    expect(oldData.ledger).not.toBeNull();
    expect(oldData.ledger!.rows.map((r) => r.id).sort()).toEqual(['e-sync-mine', 'e-sync-others']);
    expect('groups' in oldData).toBe(false);
  });
});
