import { env } from 'cloudflare:test';
import { PID, T } from './helpers';

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

export async function makeSport(tripId: string = T.tripId): Promise<void> {
  await sql("UPDATE trips SET preset = 'sport' WHERE id = ?", tripId);
}

/** Seeded rows don't bump the version, so a cached snapshot needs this to be rebuilt. */
export async function bumpVersion(tripId: string = T.tripId): Promise<void> {
  await sql('UPDATE trips SET version = version + 1 WHERE id = ?', tripId);
}

export async function archive(tripId: string = T.tripId): Promise<void> {
  await sql('UPDATE trips SET archived_at = ? WHERE id = ?', '2026-10-26T00:00:00.000Z', tripId);
}

export async function makeAdmin(participantId: string, on = true): Promise<void> {
  await sql('UPDATE participants SET is_admin = ? WHERE id = ?', on ? 1 : 0, participantId);
}

export async function seedIncome(r: {
  id: string;
  amount: number;
  payerId?: string;
  createdById?: string;
  status?: 'approved' | 'disabled' | 'superseded';
  rootId?: string;
  parentId?: string | null;
  isLatest?: 0 | 1;
  description?: string;
  createdAt?: string;
  disabledByUserId?: string | null;
}): Promise<void> {
  const createdAt = r.createdAt ?? '2026-10-26T00:00:00.000Z';
  await sql(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, disabled_by_user_id, created_by_participant_id, meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'income', ?, ?, 'VND', '2026-10-26', ?, 'equal', ?, ?, ?, '{\"category\":null}', ?, ?)",
    r.id, r.rootId ?? r.id, r.parentId ?? null, r.isLatest ?? 1, T.tripId, r.description ?? 'Đóng quỹ', r.amount,
    r.payerId ?? PID.M, r.status ?? 'approved', r.disabledByUserId ?? null, r.createdById ?? PID.M, createdAt, createdAt,
  );
}

export async function seedFundExpense(r: {
  id: string;
  amount: number;
  status?: string;
  createdAt?: string;
  description?: string;
}): Promise<void> {
  const createdAt = r.createdAt ?? '2026-10-26T00:00:00.000Z';
  await sql(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, 'VND', '2026-10-26', ?, 'equal', ?, ?, '{\"paidFromFund\":true}', ?, ?)",
    r.id, r.id, T.tripId, r.description ?? 'Thuê sân', r.amount, PID.M, r.status ?? 'approved', PID.M, createdAt, createdAt,
  );
}
