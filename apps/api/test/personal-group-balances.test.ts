import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { WalletDetailResponse, WalletDetailsResponse, WalletDetailView } from '@cc/core';
import { call, json, memberSid, PID, seedTrip, T, U } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

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

async function seedLink(opts: {
  userId?: string;
  rootId: string;
  tripId?: string;
  walletId?: string | null;
  intent?: 'shared' | 'loan' | null;
}) {
  await runSql(
    `INSERT INTO personal_group_links (
      user_id, root_id, trip_id, wallet_id, category_id, intent, exclude_from_reports, created_at, updated_at, sync_version
    ) VALUES (?, ?, ?, ?, NULL, ?, 0, '2026-10-10T10:00:00.000Z', '2026-10-10T10:00:00.000Z', 1)`,
    opts.userId ?? U.minh,
    opts.rootId,
    opts.tripId ?? T.tripId,
    opts.walletId ?? null,
    opts.intent ?? null,
  );
}

async function setupMinh(
  startAmount = 1_000_000,
  startDate = '2026-10-05',
): Promise<{ sid: string; wallet: WalletDetailView }> {
  await seedTrip();
  const sid = await memberSid(U.minh, 'Minh');
  await switchOn(U.minh, 1);
  const res = await addWallet(sid, { name: 'Tiền mặt', startAmount, startDate });
  expect(res.status).toBe(201);
  const { wallet } = await json<WalletDetailResponse>(res);
  return { sid, wallet };
}

async function getWallets(sid: string): Promise<WalletDetailView[]> {
  const res = await call('/api/me/personal/wallets', {
    headers: { Cookie: `sid=${sid}` },
  });
  expect(res.status).toBe(200);
  return (await json<WalletDetailsResponse>(res)).wallets;
}

describe('personal wallet balances with group money', () => {
  it('bill I paid after start date lowers balance by full total', async () => {
    const { sid, wallet } = await setupMinh(1_000_000, '2026-10-05');
    await seedTx({
      id: 'e-i-paid',
      type: 'expense',
      description: 'Dinner',
      amount: 300_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.A, amount: 100_000 },
        { participantId: PID.B, amount: 100_000 },
      ],
    });

    const wallets = await getWallets(sid);
    const updated = wallets.find((w) => w.id === wallet.id)!;
    expect(updated.balance).toBe(700_000);
    expect(updated.vndValue).toBe(700_000);
  });

  it('expense someone else paid leaves balance unchanged', async () => {
    const { sid, wallet } = await setupMinh(1_000_000, '2026-10-05');
    await seedTx({
      id: 'e-other-paid',
      type: 'expense',
      description: 'Lẩu gà lá é',
      amount: 300_000,
      spentOn: '2026-10-10',
      payerId: PID.A,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.A, amount: 100_000 },
        { participantId: PID.B, amount: 100_000 },
      ],
    });

    const wallets = await getWallets(sid);
    expect(wallets.find((w) => w.id === wallet.id)!.balance).toBe(1_000_000);
  });

  it('payment received raises balance', async () => {
    const { sid, wallet } = await setupMinh(1_000_000, '2026-10-05');
    await seedTx({
      id: 'pay-recv',
      type: 'payment',
      description: 'An trả Minh',
      amount: 200_000,
      amountConfirmed: 180_000,
      spentOn: '2026-10-10',
      payerId: PID.A,
      toId: PID.M,
      status: 'confirmed',
    });
    // Pending payment must not affect balance
    await seedTx({
      id: 'pay-pending',
      type: 'payment',
      description: 'Bình báo đã trả',
      amount: 90_000,
      spentOn: '2026-10-10',
      payerId: PID.B,
      toId: PID.M,
      status: 'says_paid',
    });

    const wallets = await getWallets(sid);
    expect(wallets.find((w) => w.id === wallet.id)!.balance).toBe(1_180_000);
  });

  it('borrowed loan raises balance by myShare', async () => {
    const { sid, wallet } = await setupMinh(1_000_000, '2026-10-05');
    await seedTx({
      id: 'e-borrow',
      type: 'expense',
      description: 'Đi vay An',
      amount: 50_000,
      spentOn: '2026-10-10',
      payerId: PID.A,
      status: 'approved',
      shares: [{ participantId: PID.M, amount: 50_000 }],
    });
    await seedLink({ rootId: 'e-borrow', intent: 'loan' });

    const wallets = await getWallets(sid);
    expect(wallets.find((w) => w.id === wallet.id)!.balance).toBe(1_050_000);
  });

  it('row before start date leaves balance unchanged', async () => {
    const { sid, wallet } = await setupMinh(1_000_000, '2026-10-10');
    await seedTx({
      id: 'e-before-start',
      type: 'expense',
      description: 'Old bill',
      amount: 300_000,
      spentOn: '2026-10-09',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 100_000 },
        { participantId: PID.A, amount: 200_000 },
      ],
    });

    const wallets = await getWallets(sid);
    expect(wallets.find((w) => w.id === wallet.id)!.balance).toBe(1_000_000);
  });

  it('date moved across start date', async () => {
    const { sid, wallet } = await setupMinh(1_000_000, '2026-10-10');
    await seedTx({
      id: 'e-move-v1',
      rootId: 'e-move-v1',
      isLatest: 1,
      type: 'expense',
      description: 'Bữa tối',
      amount: 250_000,
      spentOn: '2026-10-08',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 125_000 },
        { participantId: PID.A, amount: 125_000 },
      ],
    });

    const before = await getWallets(sid);
    expect(before.find((w) => w.id === wallet.id)!.balance).toBe(1_000_000);

    // New version moves spent_on on/after the wallet's start date
    await runSql("UPDATE transactions SET is_latest = 0, status = 'superseded' WHERE id = 'e-move-v1'");
    await seedTx({
      id: 'e-move-v2',
      rootId: 'e-move-v1',
      parentId: 'e-move-v1',
      isLatest: 1,
      type: 'expense',
      description: 'Bữa tối',
      amount: 250_000,
      spentOn: '2026-10-12',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 125_000 },
        { participantId: PID.A, amount: 125_000 },
      ],
    });

    const after = await getWallets(sid);
    expect(after.find((w) => w.id === wallet.id)!.balance).toBe(750_000);
  });

  it('picks a VND wallet', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    // Default wallet is USD
    const usdRes = await addWallet(sid, {
      name: 'USD Cash',
      currency: 'USD',
      startAmount: 10_000,
      startCostVnd: 2_500_000,
      startDate: '2026-10-05',
    });
    expect(usdRes.status).toBe(201);
    const wUsd = (await json<WalletDetailResponse>(usdRes)).wallet;
    expect(wUsd.isDefault).toBe(true);

    // Archived VND wallet
    const archRes = await addWallet(sid, {
      name: 'VND Archived',
      currency: 'VND',
      startAmount: 500_000,
      startDate: '2026-10-05',
    });
    expect(archRes.status).toBe(201);
    const wArchived = (await json<WalletDetailResponse>(archRes)).wallet;
    const patchArch = await postJson(`/api/me/personal/wallets/${wArchived.id}`, sid, { archived: true }, 'PATCH');
    expect(patchArch.status).toBe(200);

    // Investment VND wallet (should be skipped in favor of active everyday VND wallet)
    const invRes = await addWallet(sid, {
      name: 'VND Invest',
      currency: 'VND',
      kind: 'investment',
      startAmount: 800_000,
      startDate: '2026-10-05',
    });
    expect(invRes.status).toBe(201);
    const wInvest = (await json<WalletDetailResponse>(invRes)).wallet;

    // Active VND everyday wallet
    const activeRes = await addWallet(sid, {
      name: 'VND Active',
      currency: 'VND',
      kind: 'everyday',
      startAmount: 1_000_000,
      startDate: '2026-10-05',
    });
    expect(activeRes.status).toBe(201);
    const wActive = (await json<WalletDetailResponse>(activeRes)).wallet;

    await seedTx({
      id: 'e-vnd-pick',
      type: 'expense',
      description: 'Cà phê nhóm',
      amount: 300_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 150_000 },
        { participantId: PID.A, amount: 150_000 },
      ],
    });

    const wallets = await getWallets(sid);
    expect(wallets.find((w) => w.id === wUsd.id)!.balance).toBe(10_000);
    expect(wallets.find((w) => w.id === wArchived.id)!.balance).toBe(500_000);
    expect(wallets.find((w) => w.id === wInvest.id)!.balance).toBe(800_000);
    expect(wallets.find((w) => w.id === wActive.id)!.balance).toBe(700_000);

    // Archiving the active VND everyday wallet leaves no eligible VND everyday wallet -> no wallet effect
    const archiveActive = await postJson(`/api/me/personal/wallets/${wActive.id}`, sid, { archived: true }, 'PATCH');
    expect(archiveActive.status).toBe(200);

    const walletsNone = await getWallets(sid);
    expect(walletsNone.find((w) => w.id === wUsd.id)!.balance).toBe(10_000);
    expect(walletsNone.find((w) => w.id === wArchived.id)!.balance).toBe(500_000);
    expect(walletsNone.find((w) => w.id === wInvest.id)!.balance).toBe(800_000);
    expect(walletsNone.find((w) => w.id === wActive.id)!.balance).toBe(1_000_000);
  });

  it('link with walletId of another VND wallet moves that wallet', async () => {
    const { sid, wallet: wDefault } = await setupMinh(1_000_000, '2026-10-05');
    const bankRes = await addWallet(sid, {
      name: 'Techcombank',
      currency: 'VND',
      startAmount: 2_000_000,
      startDate: '2026-10-05',
    });
    expect(bankRes.status).toBe(201);
    const wBank = (await json<WalletDetailResponse>(bankRes)).wallet;

    await seedTx({
      id: 'e-linked-wallet',
      type: 'expense',
      description: 'Hotel',
      amount: 300_000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      status: 'approved',
      shares: [
        { participantId: PID.M, amount: 150_000 },
        { participantId: PID.A, amount: 150_000 },
      ],
    });
    await seedLink({ rootId: 'e-linked-wallet', walletId: wBank.id });

    const wallets = await getWallets(sid);
    expect(wallets.find((w) => w.id === wDefault.id)!.balance).toBe(1_000_000);
    expect(wallets.find((w) => w.id === wBank.id)!.balance).toBe(1_700_000);
  });
});
