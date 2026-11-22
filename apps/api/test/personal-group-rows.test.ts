import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { getDb } from '@cc/api-db/client';
import { trips } from '@cc/api-db/schema';
import { groupNetFor } from '@cc/core';
import { loadGroupRows } from '../src/personal/groupShares';
import { getSnapshot, myBalanceIn } from '../src/trips/snapshot';
import { linkMember, PID, seedTrip, seedUser, T, U } from './helpers';

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

interface SeedTxOpts {
  id: string;
  rootId?: string;
  parentId?: string | null;
  isLatest?: number;
  tripId?: string;
  type: 'expense' | 'income' | 'payment';
  description: string;
  amount: number;
  amountConfirmed?: number | null;
  spentOn?: string;
  payerId: string;
  toId?: string | null;
  status: string;
  createdByParticipantId?: string;
  metaJson?: string | null;
  createdAt?: string;
  shares?: { participantId: string; amount: number }[];
}

async function seedTx(opts: SeedTxOpts) {
  const rootId = opts.rootId ?? opts.id;
  const tripId = opts.tripId ?? T.tripId;
  const spentOn = opts.spentOn ?? '2026-10-10';
  const createdAt = opts.createdAt ?? '2026-10-10T10:00:00.000Z';
  await runSql(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
      currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
      meta_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VND', ?, ?, ?, 'equal', ?, ?, ?, ?, ?)`,
    opts.id,
    rootId,
    opts.parentId ?? null,
    opts.isLatest ?? 1,
    tripId,
    opts.type,
    opts.description,
    opts.amount,
    opts.amountConfirmed ?? null,
    spentOn,
    opts.payerId,
    opts.toId ?? null,
    opts.status,
    opts.createdByParticipantId ?? opts.payerId,
    opts.metaJson ?? null,
    createdAt,
    createdAt,
  );
  for (const s of opts.shares ?? []) {
    await runSql(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)',
      opts.id,
      s.participantId,
      s.amount,
    );
  }
}

async function seedCustomTrip(opts: {
  id: string;
  name: string;
  preset: 'trip' | 'sport' | 'direct';
  organiserUserId: string;
  people: { id: string; name: string; userId: string | null; sortOrder: number; status?: string; mergedInto?: string | null }[];
}) {
  await runSql(
    `INSERT INTO trips (id, name, preset, currency, fewest_transfers, round_transfers, organiser_user_id, group_token, view_token, version, created_at)
     VALUES (?, ?, ?, 'VND', 1, 0, ?, ?, ?, 1, '2026-10-01T00:00:00.000Z')`,
    opts.id,
    opts.name,
    opts.preset,
    opts.organiserUserId,
    `gtok-${opts.id}`,
    `vtok-${opts.id}`,
  );
  for (const p of opts.people) {
    await runSql(
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, merged_into, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-01T00:00:00.000Z')`,
      p.id,
      opts.id,
      p.name,
      p.name.toLowerCase(),
      p.userId,
      p.status ?? 'active',
      p.mergedInto ?? null,
      p.sortOrder,
    );
  }
}

describe('loadGroupRows', () => {
  it('shows my share of an expense someone else paid', async () => {
    await seedTrip();
    await seedTx({
      id: 'e-other-paid',
      type: 'expense',
      description: 'Lẩu gà lá é',
      amount: 300_000,
      payerId: PID.A,
      status: 'approved',
      shares: [
        { participantId: PID.C, amount: 100_000 },
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.A, amount: 100_000 },
      ],
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      kind: 'group',
      id: 'e-other-paid',
      rootId: 'e-other-paid',
      tripId: T.tripId,
      tripName: 'Đà Lạt · Oct 2026',
      isDirect: false,
      source: 'expense',
      date: '2026-10-10',
      title: 'Lẩu gà lá é',
      total: 300_000,
      myShare: 100_000,
      iPaid: false,
      payerName: 'An',
      counterpartName: null,
      people: ['An', 'Chi'],
      pending: false,
      link: null,
      createdAt: '2026-10-10T10:00:00.000Z',
      activityAt: expect.any(String),
    });
  });

  it('shows a bill I paid with myShare and total', async () => {
    await seedTrip();
    await seedTx({
      id: 'e-i-paid',
      type: 'expense',
      description: 'Dinner',
      amount: 300_000,
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.B, amount: 100_000 },
        { participantId: PID.A, amount: 100_000 },
      ],
    });
    // Also a bill I paid where I have no share
    await seedTx({
      id: 'e-i-paid-no-share',
      type: 'expense',
      description: 'Coffee for An',
      amount: 50_000,
      spentOn: '2026-10-09',
      payerId: PID.M,
      status: 'approved',
      shares: [{ participantId: PID.A, amount: 50_000 }],
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'e-i-paid',
      source: 'expense',
      total: 300_000,
      myShare: 100_000,
      iPaid: true,
      payerName: 'Minh',
      people: ['An', 'Bình'],
      pending: false,
    });
    expect(rows[1]).toMatchObject({
      id: 'e-i-paid-no-share',
      source: 'expense',
      total: 50_000,
      myShare: 0,
      iPaid: true,
      payerName: 'Minh',
      people: ['An'],
      pending: false,
    });
  });

  it('shows a fund contribution as source fund', async () => {
    await seedTrip();
    await seedTx({
      id: 'inc-mine',
      type: 'income',
      description: 'Đóng quỹ tháng 10',
      amount: 500_000,
      payerId: PID.M,
      status: 'approved',
    });
    // Someone else's fund contribution must not appear for me
    await seedTx({
      id: 'inc-other',
      type: 'income',
      description: 'An đóng quỹ',
      amount: 500_000,
      payerId: PID.A,
      status: 'approved',
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      kind: 'group',
      id: 'inc-mine',
      rootId: 'inc-mine',
      tripId: T.tripId,
      tripName: 'Đà Lạt · Oct 2026',
      isDirect: false,
      source: 'fund',
      date: '2026-10-10',
      title: 'Đóng quỹ tháng 10',
      total: 500_000,
      myShare: 0,
      iPaid: true,
      payerName: 'Minh',
      counterpartName: null,
      people: [],
      pending: false,
      link: null,
      createdAt: '2026-10-10T10:00:00.000Z',
      activityAt: expect.any(String),
    });
  });

  it('hides fund-paid and planning expenses', async () => {
    await seedTrip();
    await seedTx({
      id: 'e-fund-paid',
      type: 'expense',
      description: 'Sân cầu lông (từ quỹ)',
      amount: 400_000,
      payerId: PID.M,
      status: 'approved',
      metaJson: JSON.stringify({ paidFromFund: true }),
      shares: [
        { participantId: PID.M, amount: 200_000 },
        { participantId: PID.A, amount: 200_000 },
      ],
    });
    await seedTx({
      id: 'e-planning',
      type: 'expense',
      description: 'Buổi thứ 7 (dự kiến)',
      amount: 300_000,
      payerId: PID.M,
      status: 'approved',
      metaJson: JSON.stringify({ sport: { planning: true } }),
      shares: [
        { participantId: PID.M, amount: 150_000 },
        { participantId: PID.A, amount: 150_000 },
      ],
    });
    await seedTx({
      id: 'e-normal',
      type: 'expense',
      description: 'Nước uống',
      amount: 100_000,
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 50_000 },
        { participantId: PID.A, amount: 50_000 },
      ],
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows.map((r) => r.id)).toEqual(['e-normal']);
  });

  it('shows pending and says_paid as pending', async () => {
    await seedTrip();
    await seedTx({
      id: 'e-pending',
      type: 'expense',
      description: 'Taxi chờ duyệt',
      amount: 200_000,
      spentOn: '2026-10-11',
      payerId: PID.A,
      status: 'pending',
      shares: [
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.A, amount: 100_000 },
      ],
    });
    await seedTx({
      id: 'pay-says-paid',
      type: 'payment',
      description: 'Thanh toán',
      amount: 100_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      toId: PID.A,
      status: 'says_paid',
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'e-pending',
      source: 'expense',
      pending: true,
      myShare: 100_000,
      total: 200_000,
    });
    expect(rows[1]).toMatchObject({
      id: 'pay-says-paid',
      source: 'payment',
      pending: true,
      iPaid: true,
      total: 100_000,
      counterpartName: 'An',
    });
  });

  it('hides disabled, rejected and superseded', async () => {
    await seedTrip();
    await seedTx({
      id: 'e-disabled',
      type: 'expense',
      description: 'Disabled',
      amount: 100_000,
      payerId: PID.M,
      status: 'disabled',
      shares: [{ participantId: PID.M, amount: 100_000 }],
    });
    await seedTx({
      id: 'e-rejected',
      type: 'expense',
      description: 'Rejected',
      amount: 100_000,
      payerId: PID.M,
      status: 'rejected',
      shares: [{ participantId: PID.M, amount: 100_000 }],
    });
    await seedTx({
      id: 'e-superseded',
      type: 'expense',
      description: 'Superseded',
      amount: 100_000,
      payerId: PID.M,
      status: 'superseded',
      shares: [{ participantId: PID.M, amount: 100_000 }],
    });
    await seedTx({
      id: 'e-old-ver',
      rootId: 'e-latest-ver',
      isLatest: 0,
      type: 'expense',
      description: 'Old version',
      amount: 100_000,
      payerId: PID.M,
      status: 'approved',
      shares: [{ participantId: PID.M, amount: 100_000 }],
    });
    await seedTx({
      id: 'inc-disabled',
      type: 'income',
      description: 'Disabled fund',
      amount: 200_000,
      payerId: PID.M,
      status: 'disabled',
    });
    await seedTx({
      id: 'pay-disabled',
      type: 'payment',
      description: 'Disabled payment',
      amount: 50_000,
      payerId: PID.M,
      toId: PID.A,
      status: 'disabled',
    });
    await seedTx({
      id: 'pay-rejected',
      type: 'payment',
      description: 'Rejected payment',
      amount: 50_000,
      payerId: PID.M,
      toId: PID.A,
      status: 'rejected',
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toEqual([]);
  });

  it('ignores payments that do not involve me', async () => {
    await seedTrip();
    // Payment between An and Bình — Minh is not involved
    await seedTx({
      id: 'pay-others',
      type: 'payment',
      description: 'An trả Bình',
      amount: 150_000,
      payerId: PID.A,
      toId: PID.B,
      status: 'confirmed',
    });
    // Payment from An to Minh — Minh is receiver
    await seedTx({
      id: 'pay-to-me',
      type: 'payment',
      description: 'An trả Minh',
      amount: 80_000,
      payerId: PID.A,
      toId: PID.M,
      status: 'confirmed',
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'pay-to-me',
      source: 'payment',
      iPaid: false,
      total: 80_000,
      myShare: 0,
      payerName: 'An',
      counterpartName: 'An',
      pending: false,
    });
  });

  it('uses the confirmed amount of a payment', async () => {
    await seedTrip();
    await seedTx({
      id: 'pay-confirmed-diff',
      type: 'payment',
      description: 'Chuyển khoản',
      amount: 200_000,
      amountConfirmed: 175_000,
      payerId: PID.M,
      toId: PID.A,
      status: 'confirmed',
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'pay-confirmed-diff',
      source: 'payment',
      iPaid: true,
      total: 175_000,
      myShare: 0,
      payerName: 'Minh',
      counterpartName: 'An',
      pending: false,
    });
  });

  it('unlinked name contributes nothing until linked', async () => {
    await seedTrip();
    await seedUser(U.an, 'An');
    await seedTx({
      id: 'e-an-share',
      type: 'expense',
      description: 'Cà phê',
      amount: 120_000,
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 60_000 },
        { participantId: PID.A, amount: 60_000 },
      ],
    });

    // Before linking PID.A to U.an
    const before = await loadGroupRows(getDb(env), U.an);
    expect(before).toEqual([]);

    // Link PID.A to U.an and reload
    await linkMember(PID.A, U.an, 'An');
    const after = await loadGroupRows(getDb(env), U.an);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: 'e-an-share',
      myShare: 60_000,
      total: 120_000,
      iPaid: false,
      payerName: 'Minh',
    });
  });

  it('merged participant rows follow the survivor', async () => {
    await seedUser(U.minh, 'Minh');
    await seedCustomTrip({
      id: 't-merge',
      name: 'Nhóm gộp tên',
      preset: 'trip',
      organiserUserId: U.minh,
      people: [
        { id: 'pm-survivor', name: 'Minh', userId: U.minh, sortOrder: 0, status: 'active' },
        { id: 'pm-mid', name: 'Minh (old 1)', userId: null, sortOrder: 1, status: 'merged', mergedInto: 'pm-survivor' },
        { id: 'pm-leaf', name: 'Minh (old 2)', userId: null, sortOrder: 2, status: 'merged', mergedInto: 'pm-mid' },
        { id: 'pm-an', name: 'An', userId: null, sortOrder: 3, status: 'active' },
      ],
    });

    // Expense where the chained merged participant paid and had a share
    await seedTx({
      id: 'e-merged-payer',
      tripId: 't-merge',
      type: 'expense',
      description: 'Bữa tối',
      amount: 200_000,
      spentOn: '2026-10-12',
      payerId: 'pm-leaf',
      status: 'approved',
      shares: [
        { participantId: 'pm-leaf', amount: 100_000 },
        { participantId: 'pm-an', amount: 100_000 },
      ],
    });
    // Payment received by the merged participant
    await seedTx({
      id: 'pay-merged-recv',
      tripId: 't-merge',
      type: 'payment',
      description: 'An trả',
      amount: 100_000,
      spentOn: '2026-10-11',
      payerId: 'pm-an',
      toId: 'pm-mid',
      status: 'confirmed',
    });

    const rows = await loadGroupRows(getDb(env), U.minh);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'e-merged-payer',
      source: 'expense',
      iPaid: true,
      total: 200_000,
      myShare: 100_000,
      payerName: 'Minh',
      people: ['An'],
    });
    expect(rows[1]).toMatchObject({
      id: 'pay-merged-recv',
      source: 'payment',
      iPaid: false,
      total: 100_000,
      counterpartName: 'An',
    });
  });

  it('edit, disable and rollback change the rows on next load', async () => {
    await seedTrip();
    // Seed a tag and a personal link on the rootId to verify links survive edits
    await runSql(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-1', ?, 'Ăn uống', '2026-10-01T00:00:00.000Z')",
      U.minh,
    );
    await runSql(
      `INSERT INTO personal_group_links (user_id, root_id, trip_id, wallet_id, category_id, intent, exclude_from_reports, created_at, updated_at, sync_version)
       VALUES (?, 'e-edit-1', ?, NULL, NULL, 'shared', 1, '2026-10-10T10:00:00.000Z', '2026-10-10T10:00:00.000Z', 1)`,
      U.minh,
      T.tripId,
    );
    await runSql(
      "INSERT INTO personal_group_link_tags (user_id, root_id, tag_id) VALUES (?, 'e-edit-1', 'tag-1')",
      U.minh,
    );

    // v1
    await seedTx({
      id: 'e-edit-1',
      rootId: 'e-edit-1',
      isLatest: 1,
      type: 'expense',
      description: 'Bún bò v1',
      amount: 100_000,
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 50_000 },
        { participantId: PID.A, amount: 50_000 },
      ],
    });

    const v1Rows = await loadGroupRows(getDb(env), U.minh);
    expect(v1Rows).toHaveLength(1);
    expect(v1Rows[0]).toMatchObject({
      id: 'e-edit-1',
      rootId: 'e-edit-1',
      title: 'Bún bò v1',
      total: 100_000,
      myShare: 50_000,
      link: {
        walletId: null,
        categoryId: null,
        tagIds: ['tag-1'],
        intent: 'shared',
        excludeFromReports: true,
      },
    });

    // Edit: mark v1 as not latest, insert v2 with isLatest = 1
    await runSql("UPDATE transactions SET is_latest = 0, status = 'superseded' WHERE id = 'e-edit-1'");
    await seedTx({
      id: 'e-edit-2',
      rootId: 'e-edit-1',
      parentId: 'e-edit-1',
      isLatest: 1,
      type: 'expense',
      description: 'Bún bò v2',
      amount: 160_000,
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 80_000 },
        { participantId: PID.A, amount: 80_000 },
      ],
    });

    const v2Rows = await loadGroupRows(getDb(env), U.minh);
    expect(v2Rows).toHaveLength(1);
    expect(v2Rows[0]).toMatchObject({
      id: 'e-edit-2',
      rootId: 'e-edit-1',
      title: 'Bún bò v2',
      total: 160_000,
      myShare: 80_000,
      link: {
        walletId: null,
        categoryId: null,
        tagIds: ['tag-1'],
        intent: 'shared',
        excludeFromReports: true,
      },
    });

    // Disable v2
    await runSql("UPDATE transactions SET status = 'disabled' WHERE id = 'e-edit-2'");
    const disabledRows = await loadGroupRows(getDb(env), U.minh);
    expect(disabledRows).toEqual([]);

    // Rollback to v1
    await runSql("UPDATE transactions SET is_latest = 0 WHERE id = 'e-edit-2'");
    await runSql("UPDATE transactions SET is_latest = 1, status = 'approved' WHERE id = 'e-edit-1'");
    const rolledBackRows = await loadGroupRows(getDb(env), U.minh);
    expect(rolledBackRows).toHaveLength(1);
    expect(rolledBackRows[0]).toMatchObject({
      id: 'e-edit-1',
      rootId: 'e-edit-1',
      title: 'Bún bò v1',
      total: 100_000,
      myShare: 50_000,
    });
  });

  it('includes quick expenses from the direct group with isDirect true', async () => {
    await seedUser(U.minh, 'Minh');
    await seedCustomTrip({
      id: 't-direct',
      name: 'Với người khác',
      preset: 'direct',
      organiserUserId: U.minh,
      people: [
        { id: 'pd-minh', name: 'Minh', userId: U.minh, sortOrder: 0 },
        { id: 'pd-lan', name: 'Lan', userId: null, sortOrder: 1 },
      ],
    });
    await seedTx({
      id: 'e-quick',
      tripId: 't-direct',
      type: 'expense',
      description: 'Cà phê sáng',
      amount: 60_000,
      spentOn: '2026-10-15',
      payerId: 'pd-minh',
      status: 'approved',
      shares: [
        { participantId: 'pd-minh', amount: 30_000 },
        { participantId: 'pd-lan', amount: 30_000 },
      ],
    });
    await seedTx({
      id: 'e-out-of-range',
      tripId: 't-direct',
      type: 'expense',
      description: 'Tháng trước',
      amount: 40_000,
      spentOn: '2026-09-20',
      payerId: 'pd-minh',
      status: 'approved',
      shares: [
        { participantId: 'pd-minh', amount: 20_000 },
        { participantId: 'pd-lan', amount: 20_000 },
      ],
    });

    const allRows = await loadGroupRows(getDb(env), U.minh);
    expect(allRows).toHaveLength(2);
    expect(allRows[0]).toMatchObject({
      id: 'e-quick',
      tripId: 't-direct',
      tripName: 'Với người khác',
      isDirect: true,
      source: 'expense',
      total: 60_000,
      myShare: 30_000,
      iPaid: true,
      people: ['Lan'],
    });

    const octRows = await loadGroupRows(getDb(env), U.minh, { from: '2026-10-01', to: '2026-10-31' });
    expect(octRows.map((r) => r.id)).toEqual(['e-quick']);
  });

  it('net matches myBalanceIn for an ordinary group, a sport group and a group with a fund', async () => {
    const db = getDb(env);
    await seedUser(U.minh, 'Minh');

    // 1. Ordinary group (preset 'trip', round_transfers = 0)
    await seedCustomTrip({
      id: 't-ordinary',
      name: 'Vũng Tàu',
      preset: 'trip',
      organiserUserId: U.minh,
      people: [
        { id: 'po-m', name: 'Minh', userId: U.minh, sortOrder: 0 },
        { id: 'po-a', name: 'An', userId: null, sortOrder: 1 },
        { id: 'po-b', name: 'Bình', userId: null, sortOrder: 2 },
      ],
    });
    await seedTx({
      id: 'eo-1',
      tripId: 't-ordinary',
      type: 'expense',
      description: 'Hotel',
      amount: 300_000,
      payerId: 'po-m',
      status: 'approved',
      shares: [
        { participantId: 'po-m', amount: 100_000 },
        { participantId: 'po-a', amount: 100_000 },
        { participantId: 'po-b', amount: 100_000 },
      ],
    });
    await seedTx({
      id: 'eo-2',
      tripId: 't-ordinary',
      type: 'expense',
      description: 'Taxi',
      amount: 160_000,
      payerId: 'po-a',
      status: 'approved',
      shares: [
        { participantId: 'po-m', amount: 80_000 },
        { participantId: 'po-a', amount: 80_000 },
      ],
    });
    await seedTx({
      id: 'eo-pending',
      tripId: 't-ordinary',
      type: 'expense',
      description: 'Pending snack',
      amount: 90_000,
      payerId: 'po-b',
      status: 'pending',
      shares: [
        { participantId: 'po-m', amount: 45_000 },
        { participantId: 'po-b', amount: 45_000 },
      ],
    });
    await seedTx({
      id: 'po-pay-1',
      tripId: 't-ordinary',
      type: 'payment',
      description: 'Pay An',
      amount: 50_000,
      payerId: 'po-m',
      toId: 'po-a',
      status: 'confirmed',
    });
    await seedTx({
      id: 'po-pay-2',
      tripId: 't-ordinary',
      type: 'payment',
      description: 'Bình pays Minh',
      amount: 130_000,
      amountConfirmed: 120_000,
      payerId: 'po-b',
      toId: 'po-m',
      status: 'confirmed',
    });
    await seedTx({
      id: 'po-pay-says',
      tripId: 't-ordinary',
      type: 'payment',
      description: 'Unconfirmed payment',
      amount: 30_000,
      payerId: 'po-a',
      toId: 'po-m',
      status: 'says_paid',
    });

    // 2. Sport group (preset 'sport', round_transfers = 0)
    await seedCustomTrip({
      id: 't-sport',
      name: 'Cầu lông T5',
      preset: 'sport',
      organiserUserId: U.minh,
      people: [
        { id: 'ps-m', name: 'Minh', userId: U.minh, sortOrder: 0 },
        { id: 'ps-a', name: 'An', userId: null, sortOrder: 1 },
      ],
    });
    await seedTx({
      id: 'es-1',
      tripId: 't-sport',
      type: 'expense',
      description: 'Tiền sân',
      amount: 240_000,
      payerId: 'ps-m',
      status: 'approved',
      shares: [
        { participantId: 'ps-m', amount: 120_000 },
        { participantId: 'ps-a', amount: 120_000 },
      ],
    });
    await seedTx({
      id: 'es-plan',
      tripId: 't-sport',
      type: 'expense',
      description: 'Tuần sau (planning)',
      amount: 200_000,
      payerId: 'ps-a',
      status: 'approved',
      metaJson: JSON.stringify({ sport: { planning: true } }),
      shares: [
        { participantId: 'ps-m', amount: 100_000 },
        { participantId: 'ps-a', amount: 100_000 },
      ],
    });

    // 3. Group with a fund (preset 'sport', round_transfers = 0)
    await seedCustomTrip({
      id: 't-fund',
      name: 'Bóng đá + Quỹ',
      preset: 'sport',
      organiserUserId: U.minh,
      people: [
        { id: 'pf-m', name: 'Minh', userId: U.minh, sortOrder: 0 },
        { id: 'pf-a', name: 'An', userId: null, sortOrder: 1 },
        { id: 'pf-b', name: 'Bình', userId: null, sortOrder: 2 },
      ],
    });
    await seedTx({
      id: 'ef-inc-m',
      tripId: 't-fund',
      type: 'income',
      description: 'Minh đóng quỹ',
      amount: 500_000,
      payerId: 'pf-m',
      status: 'approved',
    });
    await seedTx({
      id: 'ef-from-fund',
      tripId: 't-fund',
      type: 'expense',
      description: 'Thuê sân từ quỹ',
      amount: 300_000,
      payerId: 'pf-m',
      status: 'approved',
      metaJson: JSON.stringify({ paidFromFund: true }),
      shares: [
        { participantId: 'pf-m', amount: 100_000 },
        { participantId: 'pf-a', amount: 100_000 },
        { participantId: 'pf-b', amount: 100_000 },
      ],
    });
    await seedTx({
      id: 'ef-water',
      tripId: 't-fund',
      type: 'expense',
      description: 'Nước ngoài quỹ',
      amount: 150_000,
      payerId: 'pf-a',
      status: 'approved',
      shares: [
        { participantId: 'pf-m', amount: 50_000 },
        { participantId: 'pf-a', amount: 50_000 },
        { participantId: 'pf-b', amount: 50_000 },
      ],
    });
    await seedTx({
      id: 'pf-pay',
      tripId: 't-fund',
      type: 'payment',
      description: 'Minh trả An',
      amount: 20_000,
      payerId: 'pf-m',
      toId: 'pf-a',
      status: 'confirmed',
    });

    const rows = await loadGroupRows(db, U.minh);

    const cases: [string, string][] = [
      ['t-ordinary', 'po-m'],
      ['t-sport', 'ps-m'],
      ['t-fund', 'pf-m'],
    ];

    for (const [tripId, pid] of cases) {
      const trip = (await db.select().from(trips).where(eq(trips.id, tripId)).get())!;
      const snapshot = await getSnapshot(db, trip);
      expect(groupNetFor(rows, tripId)).toBe(myBalanceIn(trip, snapshot, pid));
    }
  });
});
