import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  ListResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid, PID, seedTrip, seedUser, T, U } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getList = (sid: string | null, query = '') =>
  call(`/api/me/personal/transactions${query}`, sid ? as(sid) : {});

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

interface SeedTxOpts {
  id: string;
  rootId?: string;
  tripId?: string;
  type: 'expense' | 'income' | 'payment';
  description: string;
  amount: number;
  amountConfirmed?: number | null;
  spentOn?: string;
  payerId: string;
  toId?: string | null;
  status: string;
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
    ) VALUES (?, ?, NULL, 1, ?, ?, ?, ?, ?, 'VND', ?, ?, ?, 'equal', ?, ?, NULL, ?, ?)`,
    opts.id,
    rootId,
    tripId,
    opts.type,
    opts.description,
    opts.amount,
    opts.amountConfirmed ?? null,
    spentOn,
    opts.payerId,
    opts.toId ?? null,
    opts.status,
    opts.payerId,
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
  people: { id: string; name: string; userId: string | null; sortOrder: number }[];
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
      `INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, '2026-10-01T00:00:00.000Z')`,
      p.id,
      opts.id,
      p.name,
      p.name.toLowerCase(),
      p.userId,
      p.sortOrder,
    );
  }
}

describe('personal transaction list with group rows', () => {
  it('month list contains group rows with correct totals (spending counts myShare, not total)', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    // Personal entry: 50,000
    const entry = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-10-05',
          note: 'Cà phê cá nhân',
        }),
      )
    ).entries[0]!;

    // Direct group with a quick expense (stays PersonRow in rows) and a direct payment (in groupRows)
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
      id: 'e-direct',
      tripId: 't-direct',
      type: 'expense',
      description: 'Trà sữa với Lan',
      amount: 60_000,
      spentOn: '2026-10-08',
      payerId: 'pd-minh',
      status: 'approved',
      shares: [
        { participantId: 'pd-minh', amount: 30_000 },
        { participantId: 'pd-lan', amount: 30_000 },
      ],
    });
    await seedTx({
      id: 'pay-direct',
      tripId: 't-direct',
      type: 'payment',
      description: 'Lan trả',
      amount: 30_000,
      spentOn: '2026-10-09',
      payerId: 'pd-lan',
      toId: 'pd-minh',
      status: 'confirmed',
    });

    // Regular group: bill I paid (total 300k, myShare 100k), bill An paid (total 200k, myShare 80k),
    // fund contribution (500k), payment received (120k), and out-of-month expense
    await seedTx({
      id: 'e-i-paid',
      type: 'expense',
      description: 'Ăn tối',
      amount: 300_000,
      spentOn: '2026-10-12',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.A, amount: 100_000 },
        { participantId: PID.B, amount: 100_000 },
      ],
    });
    await seedTx({
      id: 'e-an-paid',
      type: 'expense',
      description: 'Taxi',
      amount: 200_000,
      spentOn: '2026-10-10',
      payerId: PID.A,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 80_000 },
        { participantId: PID.A, amount: 120_000 },
      ],
    });
    await seedTx({
      id: 'inc-fund',
      type: 'income',
      description: 'Đóng quỹ',
      amount: 500_000,
      spentOn: '2026-10-11',
      payerId: PID.M,
      status: 'approved',
    });
    await seedTx({
      id: 'pay-group',
      type: 'payment',
      description: 'An chuyển khoản',
      amount: 120_000,
      spentOn: '2026-10-15',
      payerId: PID.A,
      toId: PID.M,
      status: 'confirmed',
    });
    await seedTx({
      id: 'e-sep',
      type: 'expense',
      description: 'Tháng trước',
      amount: 400_000,
      spentOn: '2026-09-28',
      payerId: PID.M,
      status: 'approved',
      shares: [{ participantId: PID.M, amount: 400_000 }],
    });

    const res = await getList(sid, '?month=2026-10&groups=show');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);

    // Part 2 (owner bug report 2026-11-21): with groups=show the direct-group expense comes as a group row, not a PersonRow
    expect(body.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([entry.id]);
    expect(body.groupRows?.find((r) => r.id === 'e-direct')?.isDirect).toBe(true);

    // Group rows are newest first and exclude the out-of-month row
    expect(body.groupRows?.filter((r) => r.id !== 'e-direct').map((r) => r.id)).toEqual([
      'pay-group',
      'e-i-paid',
      'inc-fund',
      'e-an-paid',
      'pay-direct',
    ]);

    // No transaction appears in both rows and groupRows
    const rowIds = new Set(body.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id)));
    for (const gr of body.groupRows ?? []) {
      expect(rowIds.has(gr.id)).toBe(false);
    }

    // Totals: 50k (entry) + 30k (direct PersonRow) + 100k (myShare) + 80k (myShare) + 500k (fund) = 760k
    // Payments add 0 when countLoans is off.
    expect(body.totals).toEqual([{ currency: 'VND', spent: 760_000, income: 0 }]);
  });

  it('pending rows listed but not in totals', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);
    await addWallet(sid, { name: 'Main', startAmount: 0, startDate: '2026-10-01' });

    await seedTx({
      id: 'e-approved',
      type: 'expense',
      description: 'Cơm trưa',
      amount: 120_000,
      spentOn: '2026-10-10',
      payerId: PID.A,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 60_000 },
        { participantId: PID.A, amount: 60_000 },
      ],
    });
    await seedTx({
      id: 'e-pending',
      type: 'expense',
      description: 'Taxi chờ duyệt',
      amount: 200_000,
      spentOn: '2026-10-12',
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
      description: 'Thanh toán chờ xác nhận',
      amount: 80_000,
      spentOn: '2026-10-11',
      payerId: PID.M,
      toId: PID.A,
      status: 'says_paid',
    });

    const res = await getList(sid, '?month=2026-10&groups=show');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);

    expect(body.groupRows?.map((r) => ({ id: r.id, pending: r.pending }))).toEqual([
      { id: 'e-pending', pending: true },
      { id: 'pay-says-paid', pending: true },
      { id: 'e-approved', pending: false },
    ]);
    expect(body.totals).toEqual([{ currency: 'VND', spent: 60_000, income: 0 }]);
  });

  it("without groups=show the response equals today's", async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 500_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 40_000,
      categoryId: food.id,
      date: '2026-10-10',
      note: 'Bánh mì',
    });
    await seedTx({
      id: 'e-group-hidden',
      type: 'expense',
      description: 'Lẩu',
      amount: 300_000,
      spentOn: '2026-10-11',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 150_000 },
        { participantId: PID.A, amount: 150_000 },
      ],
    });

    const defaultRes = await getList(sid, '?month=2026-10');
    expect(defaultRes.status).toBe(200);
    const defaultBody = await json<ListResponse>(defaultRes);
    expect(Object.keys(defaultBody).sort()).toEqual(['rows', 'totals']);
    expect(defaultBody.groupRows).toBeUndefined();
    expect(defaultBody.rows).toHaveLength(1);
    expect(defaultBody.totals).toEqual([{ currency: 'VND', spent: 40_000, income: 0 }]);

    const hideRes = await getList(sid, '?month=2026-10&groups=hide');
    expect(hideRes.status).toBe(200);
    const hideBody = await json<ListResponse>(hideRes);
    expect(hideBody).toEqual(defaultBody);
    expect('groupRows' in hideBody).toBe(false);
  });

  it('tripId filters group rows to that trip and type=group returns only groupRows', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 500_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;
    await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 25_000,
      categoryId: food.id,
      date: '2026-10-10',
      note: 'Trà đá',
    });

    await seedCustomTrip({
      id: 't-2',
      name: 'Phú Quốc',
      preset: 'trip',
      organiserUserId: U.minh,
      people: [
        { id: 'p2-minh', name: 'Minh', userId: U.minh, sortOrder: 0 },
        { id: 'p2-an', name: 'An', userId: null, sortOrder: 1 },
      ],
    });
    await seedTx({
      id: 'e-t1',
      tripId: T.tripId,
      type: 'expense',
      description: 'Khách sạn Đà Lạt',
      amount: 400_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 200_000 },
        { participantId: PID.A, amount: 200_000 },
      ],
    });
    await seedTx({
      id: 'e-t2',
      tripId: 't-2',
      type: 'expense',
      description: 'Vé tàu Phú Quốc',
      amount: 300_000,
      spentOn: '2026-10-12',
      payerId: 'p2-minh',
      status: 'approved',
      shares: [
        { participantId: 'p2-minh', amount: 150_000 },
        { participantId: 'p2-an', amount: 150_000 },
      ],
    });

    const byTrip = await json<ListResponse>(
      await getList(sid, '?month=2026-10&groups=show&tripId=t-2'),
    );
    expect(byTrip.groupRows?.map((r) => r.id)).toEqual(['e-t2']);
    expect(byTrip.totals).toEqual([{ currency: 'VND', spent: 175_000, income: 0 }]);

    const onlyGroup = await json<ListResponse>(
      await getList(sid, '?month=2026-10&groups=show&type=group'),
    );
    expect(onlyGroup.rows).toEqual([]);
    expect(onlyGroup.groupRows?.map((r) => r.id)).toEqual(['e-t2', 'e-t1']);
    expect(onlyGroup.totals).toEqual([{ currency: 'VND', spent: 350_000, income: 0 }]);

    const onlyGroupAndTrip = await json<ListResponse>(
      await getList(sid, '?month=2026-10&groups=show&type=group&tripId=t-2'),
    );
    expect(onlyGroupAndTrip.rows).toEqual([]);
    expect(onlyGroupAndTrip.groupRows?.map((r) => r.id)).toEqual(['e-t2']);
    expect(onlyGroupAndTrip.totals).toEqual([{ currency: 'VND', spent: 150_000, income: 0 }]);
  });

  it('q filters group rows by title, trip name, and link tag name (accent-insensitive)', async () => {
    await seedTrip(); // tripName: 'Đà Lạt · Oct 2026'
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    await seedCustomTrip({
      id: 't-pq',
      name: 'Phú Quốc',
      preset: 'trip',
      organiserUserId: U.minh,
      people: [
        { id: 'ppq-m', name: 'Minh', userId: U.minh, sortOrder: 0 },
        { id: 'ppq-a', name: 'An', userId: null, sortOrder: 1 },
      ],
    });
    await seedTx({
      id: 'e-dl',
      tripId: T.tripId,
      type: 'expense',
      description: 'Lẩu gà lá é',
      amount: 300_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 150_000 },
        { participantId: PID.A, amount: 150_000 },
      ],
    });
    await seedTx({
      id: 'e-pq',
      tripId: 't-pq',
      type: 'expense',
      description: 'Vé tàu cao tốc',
      amount: 200_000,
      spentOn: '2026-10-11',
      payerId: 'ppq-m',
      status: 'approved',
      shares: [
        { participantId: 'ppq-m', amount: 100_000 },
        { participantId: 'ppq-a', amount: 100_000 },
      ],
    });

    // Attach a tag to e-pq via link tables
    await runSql(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-dl', ?, 'Nghỉ dưỡng', '2026-10-01T00:00:00.000Z')",
      U.minh,
    );
    await runSql(
      `INSERT INTO personal_group_links (user_id, root_id, trip_id, wallet_id, category_id, intent, exclude_from_reports, created_at, updated_at, sync_version)
       VALUES (?, 'e-pq', 't-pq', NULL, NULL, NULL, 0, '2026-10-11T10:00:00.000Z', '2026-10-11T10:00:00.000Z', 1)`,
      U.minh,
    );
    await runSql(
      "INSERT INTO personal_group_link_tags (user_id, root_id, tag_id) VALUES (?, 'e-pq', 'tag-dl')",
      U.minh,
    );

    // Search by trip name (accent-insensitive, đ -> d)
    const byTripName = await json<ListResponse>(
      await getList(sid, '?month=2026-10&groups=show&q=da%20lat'),
    );
    expect(byTripName.groupRows?.map((r) => r.id)).toEqual(['e-dl']);

    // Search by title (accent-insensitive)
    const byTitle = await json<ListResponse>(
      await getList(sid, '?month=2026-10&groups=show&q=lau%20ga'),
    );
    expect(byTitle.groupRows?.map((r) => r.id)).toEqual(['e-dl']);

    // Search by link tag name (accent-insensitive)
    const byTag = await json<ListResponse>(
      await getList(sid, '?month=2026-10&groups=show&q=nghi%20duong'),
    );
    expect(byTag.groupRows?.map((r) => r.id)).toEqual(['e-pq']);
  });

  it('no wallet yet: returns group rows with no throw', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    await seedTx({
      id: 'e-no-wallet',
      type: 'expense',
      description: 'Cà phê nhóm',
      amount: 180_000,
      spentOn: '2026-10-10',
      payerId: PID.A,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 90_000 },
        { participantId: PID.A, amount: 90_000 },
      ],
    });

    const res = await getList(sid, '?month=2026-10&groups=show');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);
    expect(body.rows).toEqual([]);
    expect(body.groupRows?.map((r) => r.id)).toEqual(['e-no-wallet']);
    expect(body.totals).toEqual([{ currency: 'VND', spent: 90_000, income: 0 }]);
  });

  it('a second account gets none of my rows', async () => {
    await seedTrip();
    await seedTx({
      id: 'e-minh-only',
      type: 'expense',
      description: 'Bữa tối',
      amount: 200_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.A, amount: 100_000 },
      ],
    });

    await seedUser(U.an, 'An');
    const anSid = await memberSid(U.an, 'An');
    await switchOn(U.an);

    const res = await getList(anSid, '?month=2026-10&groups=show');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);
    expect(body.rows).toEqual([]);
    expect(body.groupRows).toEqual([]);
    expect(body.totals).toEqual([]);
  });

  it('counts direct-group loan and payback when countLoans is enabled', async () => {
    await seedUser(U.minh, 'Minh');
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);
    await addWallet(sid, { name: 'Main', startAmount: 500_000, startDate: '2026-10-01' });

    await seedCustomTrip({
      id: 't-direct-loan',
      name: 'Với người khác',
      preset: 'direct',
      organiserUserId: U.minh,
      people: [
        { id: 'pdl-minh', name: 'Minh', userId: U.minh, sortOrder: 0 },
        { id: 'pdl-lan', name: 'Lan', userId: null, sortOrder: 1 },
      ],
    });

    // Minh lent Lan 50,000
    await seedTx({
      id: 'e-loan',
      tripId: 't-direct-loan',
      type: 'expense',
      description: 'Cho Lan vay',
      amount: 50_000,
      spentOn: '2026-10-05',
      payerId: 'pdl-minh',
      status: 'approved',
      shares: [{ participantId: 'pdl-lan', amount: 50_000 }],
    });
    await runSql(
      `INSERT INTO personal_group_links (user_id, root_id, trip_id, wallet_id, category_id, intent, exclude_from_reports, created_at, updated_at, sync_version)
       VALUES (?, 'e-loan', 't-direct-loan', NULL, NULL, 'loan', 0, '2026-10-05T10:00:00.000Z', '2026-10-05T10:00:00.000Z', 1)`,
      U.minh,
    );

    // Lan pays back 70,000 (50,000 is loan payback, 20,000 is non-loan)
    await seedTx({
      id: 'pay-repay',
      tripId: 't-direct-loan',
      type: 'payment',
      description: 'Lan trả tiền',
      amount: 70_000,
      spentOn: '2026-10-12',
      payerId: 'pdl-lan',
      toId: 'pdl-minh',
      status: 'confirmed',
    });

    await runSql(
      `INSERT INTO personal_group_settings (user_id, default_group_category_id, count_loans, updated_at)
       VALUES (?, NULL, 1, '2026-10-01T00:00:00.000Z')`,
      U.minh,
    );

    const res = await getList(sid, '?month=2026-10&groups=show');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);

    // Part 2: the direct-group loan comes as a group row with groups=show
    expect(body.rows).toEqual([]);
    expect(body.groupRows?.map((r) => r.id).sort()).toEqual(['e-loan', 'pay-repay']);
    expect(body.totals).toEqual([{ currency: 'VND', spent: 50_000, income: 50_000 }]);
  });
});
