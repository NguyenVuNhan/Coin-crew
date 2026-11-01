import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import type { PersonSummary } from '@fsl/core';
import * as schema from '../src/db/schema';
import { loadPeopleSummary } from '../src/me/balances';
import { confirmSettlement, createSettlement } from '../src/me/settle';
import { seedUser, U } from './helpers';

const OWNER = 'u-owner';
const NOW = '2026-10-20T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function addTrip(id: string, name: string) {
  await run(
    "INSERT INTO trips (id, name, preset, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at, archived_at) VALUES (?, ?, 'trip', 'VND', 1, ?, ?, ?, 0, ?, NULL)",
    id, name, OWNER, `g-${id}`, `v-${id}`, NOW,
  );
}

async function addPerson(tripId: string, id: string, name: string, userId: string | null, sort = 0) {
  await run(
    "INSERT INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    id, tripId, name, name.toLowerCase(), userId, sort, NOW,
  );
}

async function addExpense(tripId: string, id: string, payer: string, amount: number, between: string[]) {
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', ?, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)",
    id, id, tripId, amount, payer, payer, NOW, NOW,
  );
  for (const p of between) {
    await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)', id, p, amount / between.length);
  }
}

const db = () => drizzle(env.DB, { schema });

async function minh(): Promise<PersonSummary | undefined> {
  const body = await loadPeopleSummary(db(), OWNER);
  expect(body.incomplete).toBe(false);
  return body.people.find((p) => p.key === `u:${U.minh}`);
}

describe('people summary: waiting settlements and participant ids', () => {
  it('lists a guest-recorded settlement until the owner confirms it', async () => {
    await seedUser(OWNER, 'Owen');
    await seedUser(U.minh, 'Minh');
    // Minh owes the owner 200 in badminton and 60 in dinner.
    await addTrip('t-bad', 'Badminton');
    await addPerson('t-bad', 'bad-o', 'Owen', OWNER, 0);
    await addPerson('t-bad', 'bad-m', 'Minh', U.minh, 1);
    await addExpense('t-bad', 'e-bad', 'bad-o', 400, ['bad-o', 'bad-m']);
    await addTrip('t-din', 'Dinner');
    await addPerson('t-din', 'din-o', 'Owen', OWNER, 0);
    await addPerson('t-din', 'din-m', 'Minh', U.minh, 1);
    await addExpense('t-din', 'e-din', 'din-o', 120, ['din-o', 'din-m']);

    const before = await minh();
    expect(before!.waiting).toEqual([]);
    expect(before!.items.map((i) => [i.tripId, i.ownerPid, i.otherPid]).sort()).toEqual([
      ['t-bad', 'bad-o', 'bad-m'],
      ['t-din', 'din-o', 'din-m'],
    ]);

    // Minh says he paid 230: spread over both groups, waiting for the owner.
    const { settlementId, status } = await createSettlement(db(), {
      ownerUserId: OWNER,
      key: `u:${U.minh}`,
      paid: 230,
      direction: 'toOwner',
      recordedBy: 'guest',
      device: null,
    });
    expect(status).toBe('says_paid');

    const waiting = await minh();
    expect(waiting).toBeDefined();
    expect(waiting!.waiting).toEqual([{ settlementId, amount: 230, direction: 'toOwner' }]);
    for (const item of waiting!.items) {
      expect(item.ownerPid).toBe(item.tripId === 't-bad' ? 'bad-o' : 'din-o');
      expect(item.otherPid).toBe(item.tripId === 't-bad' ? 'bad-m' : 'din-m');
    }

    await confirmSettlement(db(), OWNER, settlementId);
    const after = await minh();
    expect(after?.waiting ?? []).toEqual([]);
    expect(after!.total).toBe(30);
  });
});
