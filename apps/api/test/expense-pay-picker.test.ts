import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { PickerView } from '@fsl/core';
import { getDb } from '../src/db/client';
import { getFriendGrant } from '../src/expenses/friendGrant';
import { sha256Hex } from '../src/lib/ids';
import { call, json, seedTrip, newDevice, guestHeaders, linkMember, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seedSportExpense(): Promise<void> {
  await linkMember(PID.A, U.an, 'An');
  const metaJson = JSON.stringify({
    sport: {
      court: 120000,
      shuttlecocks: [{ qty: 1, unitPrice: 55000 }],
      extra: 0,
      rule: { mode: 'fixed_female', femalePrice: 40000 },
      entries: [
        { participantId: PID.M, maleSlots: 1, femaleSlots: 0 },
        { participantId: PID.A, maleSlots: 1, femaleSlots: 1 },
        { participantId: PID.B, maleSlots: 1, femaleSlots: 0 },
      ],
      maleSlotRate: 45000,
      femaleSlotRate: 40000,
    },
  });
  await env.DB.prepare(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES ('e-sport', 'e-sport', NULL, 1, ?, 'expense', 'Sân cầu lông', 175000, 'VND', '2026-10-12', ?, 'amounts', 'approved', ?, ?, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')",
  )
    .bind(T.tripId, PID.M, PID.M, metaJson)
    .run();
  await env.DB.prepare(
    "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-sport', ?, 45000, 45000), ('e-sport', ?, 85000, 85000), ('e-sport', ?, 45000, 45000)",
  )
    .bind(PID.M, PID.A, PID.B)
    .run();
}

beforeEach(async () => {
  await seedTrip();
  await seedSportExpense();
});

describe('expense-scoped picker and friend grant', () => {
  it('picker?expense= lists only split people without the payer, with slots', async () => {
    const g = await guestHeaders();
    const picker = await json<PickerView>(call(`${base}/people/picker?expense=e-sport`, { headers: g }));
    expect(picker.people.map((p) => ({ id: p.id, slots: p.slots }))).toEqual([
      { id: PID.A, slots: 2 },
      { id: PID.B, slots: 1 },
    ]);
    expect(picker.expense).toEqual({ id: 'e-sport', payerId: PID.M });
    expect((await call(`${base}/people/picker?expense=e-missing`, { headers: g })).status).toBe(404);
  });

  it('picker without expense is unchanged', async () => {
    const g = await guestHeaders();
    const picker = await json<PickerView>(call(`${base}/people/picker`, { headers: g }));
    expect(picker.people).toHaveLength(4);
    expect(picker.expense).toBeUndefined();
  });

  it('friend grant: member row with 2 slots → 204 and no deviceParticipants row', async () => {
    const dev = await newDevice();
    const headers = { Cookie: dev.cookie, 'X-Link-Token': T.groupToken };
    const res = await post('/expenses/e-sport/friend', headers, { participantId: PID.A });
    expect(res.status).toBe(204);

    const deviceHash = await sha256Hex(dev.deviceId);
    const dp = await env.DB.prepare('SELECT * FROM device_participants WHERE device_hash = ?')
      .bind(deviceHash)
      .first();
    expect(dp).toBeNull();

    const granted = await getFriendGrant(getDb(env), deviceHash, T.tripId, 'e-sport');
    expect(granted).toBe(PID.A);
  });

  it('friend grant: 403 for a guest row, a 1-slot member row, the payer, someone outside the split, and a view-token actor', async () => {
    const g = await guestHeaders();
    // guest row (PID.B)
    expect((await post('/expenses/e-sport/friend', g, { participantId: PID.B })).status).toBe(403);
    // 1-slot member row (link PID.B as member)
    await linkMember(PID.B, 'u-binh', 'Bình');
    expect((await post('/expenses/e-sport/friend', g, { participantId: PID.B })).status).toBe(403);
    // the payer (PID.M)
    expect((await post('/expenses/e-sport/friend', g, { participantId: PID.M })).status).toBe(403);
    // someone outside the split (PID.C)
    expect((await post('/expenses/e-sport/friend', g, { participantId: PID.C })).status).toBe(403);
    // view-token actor
    const v = await guestHeaders(undefined, T.viewToken);
    expect((await post('/expenses/e-sport/friend', v, { participantId: PID.A })).status).toBe(403);
  });

  it('pick still 403s for the member row', async () => {
    const g = await guestHeaders();
    expect((await post('/people/pick', g, { participantId: PID.A })).status).toBe(403);
  });
});
