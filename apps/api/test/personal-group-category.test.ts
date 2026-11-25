import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { fixedCategoryId } from '../src/personal/fixedCategories';
import { loadGroupRows } from '../src/personal/groupShares';
import { PID, seedTrip, T, U } from './helpers';

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function seedTx(opts: {
  id: string;
  type: 'expense' | 'income' | 'payment';
  description: string;
  amount: number;
  payerId: string;
  toId?: string | null;
  status: string;
  shares?: { participantId: string; amount: number }[];
}) {
  await runSql(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description, amount, amount_confirmed,
      currency, spent_on, payer_id, to_id, split_mode, status, created_by_participant_id,
      meta_json, created_at, updated_at
    ) VALUES (?, ?, NULL, 1, ?, ?, ?, ?, NULL, 'VND', '2026-10-10', ?, ?, 'equal', ?, ?, NULL, '2026-10-10T10:00:00.000Z', '2026-10-10T10:00:00.000Z')`,
    opts.id,
    opts.id,
    T.tripId,
    opts.type,
    opts.description,
    opts.amount,
    opts.payerId,
    opts.toId ?? null,
    opts.status,
    opts.payerId,
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

describe('loadGroupRows groupCategoryId', () => {
  it('group rows expose groupCategoryId for an expense with category_key', async () => {
    await seedTrip();
    await seedTx({
      id: 'e-with-cat',
      type: 'expense',
      description: 'Lẩu gà lá é',
      amount: 200_000,
      payerId: PID.A,
      status: 'approved',
      shares: [
        { participantId: PID.A, amount: 100_000 },
        { participantId: PID.M, amount: 100_000 },
      ],
    });
    await seedTx({
      id: 'e-no-cat',
      type: 'expense',
      description: 'Chi khác',
      amount: 100_000,
      payerId: PID.A,
      status: 'approved',
      shares: [
        { participantId: PID.A, amount: 50_000 },
        { participantId: PID.M, amount: 50_000 },
      ],
    });
    await runSql('UPDATE transactions SET category_key = ? WHERE id = ?', 'food-dining', 'e-with-cat');

    const rows = await loadGroupRows(getDb(env), U.minh);
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(byId.get('e-with-cat')?.groupCategoryId).toBe(fixedCategoryId(U.minh, 'food-dining'));
    expect(byId.get('e-no-cat')?.groupCategoryId).toBeNull();
  });

  it('null for payments and fund rows', async () => {
    await seedTrip();
    await seedTx({
      id: 'tx-fund',
      type: 'income',
      description: 'Đóng quỹ',
      amount: 500_000,
      payerId: PID.M,
      status: 'approved',
    });
    await seedTx({
      id: 'tx-payment',
      type: 'payment',
      description: 'Trả tiền',
      amount: 150_000,
      payerId: PID.M,
      toId: PID.A,
      status: 'confirmed',
    });
    await runSql('UPDATE transactions SET category_key = ? WHERE id IN (?, ?)', 'food-dining', 'tx-fund', 'tx-payment');

    const rows = await loadGroupRows(getDb(env), U.minh);
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(byId.get('tx-fund')?.source).toBe('fund');
    expect(byId.get('tx-fund')?.groupCategoryId).toBeNull();
    expect(byId.get('tx-payment')?.source).toBe('payment');
    expect(byId.get('tx-payment')?.groupCategoryId).toBeNull();
  });
});
