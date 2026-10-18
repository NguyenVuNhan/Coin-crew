import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  call,
  guestHeaders,
  json,
  linkMember,
  memberSid,
  PID,
  seedExpenses,
  seedTrip,
  T,
  U,
} from './helpers';
import type { ExpenseView, TripView } from '@fsl/core';

async function minhHeaders(): Promise<Record<string, string>> {
  const sid = await memberSid(U.minh, 'Minh');
  return { Cookie: `sid=${sid}` };
}

async function send(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  return call(`/api/trips/${T.tripId}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function getTrip(headers: Record<string, string>): Promise<TripView> {
  const res = await call(`/api/trips/${T.tripId}`, { headers });
  expect(res.status).toBe(200);
  return json<TripView>(res);
}

describe('Task 6: Unified transactions & append-only history/rollback', () => {
  beforeEach(async () => {
    await seedTrip();
    await seedExpenses();
  });

  it('snapshot returns rootId and empty history for unedited seeded expenses', async () => {
    const headers = await minhHeaders();
    const trip = await getTrip(headers);

    expect(trip.expenses.length).toBe(4);
    const e1 = trip.expenses.find((e) => e.id === 'e-1');
    expect(e1).toBeDefined();
    expect(e1?.rootId).toBe('e-1');
    expect(e1?.history).toEqual([]);
  });

  it('append-only edit (PATCH /expenses/:eid) marks old head superseded and creates new head with rootId', async () => {
    const headers = await minhHeaders();
    const beforeTrip = await getTrip(headers);
    const initialVersion = beforeTrip.trip.version;

    // Minh edits e-4 (originally 240,000 paid by Minh for M, A, C)
    const patchRes = await send('PATCH', '/expenses/e-4', headers, {
      description: 'Cà phê Túi Mơ To (updated)',
      amount: 300000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });

    expect(patchRes.status).toBe(200);
    const patchBody = await json<{ expenseId: string; rootId: string }>(patchRes);
    expect(patchBody.rootId).toBe('e-4');
    expect(patchBody.expenseId).not.toBe('e-4');

    // DB inspection: old row e-4 is superseded with is_latest = 0
    const oldRow = await env.DB.prepare(
      'SELECT id, root_id, parent_id, is_latest, status FROM transactions WHERE id = ?',
    )
      .bind('e-4')
      .first<{ id: string; root_id: string; parent_id: string | null; is_latest: number; status: string }>();

    expect(oldRow).toBeDefined();
    expect(oldRow?.status).toBe('superseded');
    expect(oldRow?.is_latest).toBe(0);
    expect(oldRow?.root_id).toBe('e-4');

    // DB inspection: new row has parent_id = e-4, root_id = e-4, is_latest = 1
    const newRow = await env.DB.prepare(
      'SELECT id, root_id, parent_id, is_latest, status, amount, description FROM transactions WHERE id = ?',
    )
      .bind(patchBody.expenseId)
      .first<{ id: string; root_id: string; parent_id: string | null; is_latest: number; status: string; amount: number; description: string }>();

    expect(newRow).toBeDefined();
    expect(newRow?.status).toBe('approved');
    expect(newRow?.is_latest).toBe(1);
    expect(newRow?.root_id).toBe('e-4');
    expect(newRow?.parent_id).toBe('e-4');
    expect(newRow?.amount).toBe(300000);
    expect(newRow?.description).toBe('Cà phê Túi Mơ To (updated)');

    // Snapshot inspection: active expense has id = newHeadId, rootId = e-4, and history contains old row
    const afterTrip = await getTrip(headers);
    expect(afterTrip.trip.version).toBeGreaterThan(initialVersion);

    const activeExp = afterTrip.expenses.find((e) => e.rootId === 'e-4');
    expect(activeExp).toBeDefined();
    expect(activeExp?.id).toBe(patchBody.expenseId);
    expect(activeExp?.amount).toBe(300000);
    expect(activeExp?.description).toBe('Cà phê Túi Mơ To (updated)');
    expect(activeExp?.history).toHaveLength(1);
    expect(activeExp?.history?.[0]).toMatchObject({
      id: 'e-4',
      amount: 240000,
      description: 'Cà phê Túi Mơ To',
    });

    // Activity check
    const activityRow = await env.DB.prepare(
      "SELECT action, details_json FROM activity WHERE trip_id = ? AND action = 'expense_edited' ORDER BY created_at DESC",
    )
      .bind(T.tripId)
      .first<{ action: string; details_json: string }>();
    expect(activityRow).toBeDefined();
    expect(JSON.parse(activityRow!.details_json)).toMatchObject({
      amount: 300000,
    });
  });

  it('multiple edits build newest-first history and can be targeted by rootId or latest head id', async () => {
    const headers = await minhHeaders();

    // First edit e-4 -> 300,000
    const edit1Res = await send('PATCH', '/expenses/e-4', headers, {
      description: 'Cà phê v2',
      amount: 300000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });
    expect(edit1Res.status).toBe(200);
    const { expenseId: v2Id } = await json<{ expenseId: string; rootId: string }>(edit1Res);

    // Second edit targeting the new v2 id -> 360,000
    const edit2Res = await send('PATCH', `/expenses/${v2Id}`, headers, {
      description: 'Cà phê v3',
      amount: 360000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });
    expect(edit2Res.status).toBe(200);
    const { expenseId: v3Id, rootId } = await json<{ expenseId: string; rootId: string }>(edit2Res);
    expect(rootId).toBe('e-4');
    expect(v3Id).not.toBe(v2Id);

    // Third edit targeting by rootId e-4 -> 420,000
    const edit3Res = await send('PATCH', '/expenses/e-4', headers, {
      description: 'Cà phê v4',
      amount: 420000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });
    expect(edit3Res.status).toBe(200);
    const { expenseId: v4Id } = await json<{ expenseId: string; rootId: string }>(edit3Res);

    const trip = await getTrip(headers);
    const exp = trip.expenses.find((e) => e.rootId === 'e-4');
    expect(exp?.id).toBe(v4Id);
    expect(exp?.amount).toBe(420000);
    expect(exp?.history).toHaveLength(3);
    // History is newest-first
    expect(exp?.history?.map((h) => h.amount)).toEqual([360000, 300000, 240000]);
    expect(exp?.history?.map((h) => h.id)).toEqual([v3Id, v2Id, 'e-4']);
  });

  it('append-only rollback (POST /expenses/:eid/rollback) reverts head to historical state as a new head', async () => {
    const headers = await minhHeaders();

    // Edit e-4 from 240k to 300k
    const editRes = await send('PATCH', '/expenses/e-4', headers, {
      description: 'Cà phê 300k',
      amount: 300000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });
    const { expenseId: headId } = await json<{ expenseId: string }>(editRes);

    // Rollback to original e-4 (targetHistoryId = 'e-4')
    const rollbackRes = await send('POST', `/expenses/${headId}/rollback`, headers, {
      targetHistoryId: 'e-4',
    });
    expect(rollbackRes.status).toBe(200);
    const rollbackBody = await json<{ expenseId: string; rootId: string }>(rollbackRes);
    expect(rollbackBody.rootId).toBe('e-4');
    expect(rollbackBody.expenseId).not.toBe(headId);
    expect(rollbackBody.expenseId).not.toBe('e-4');

    // In DB, previous headId is now superseded
    const prevHead = await env.DB.prepare('SELECT is_latest, status FROM transactions WHERE id = ?')
      .bind(headId)
      .first<{ is_latest: number; status: string }>();
    expect(prevHead?.is_latest).toBe(0);
    expect(prevHead?.status).toBe('superseded');

    // Snapshot shows restored values with history containing both headId (300k) and e-4 (240k)
    const trip = await getTrip(headers);
    const rolledBackExp = trip.expenses.find((e) => e.rootId === 'e-4');
    expect(rolledBackExp?.id).toBe(rollbackBody.expenseId);
    expect(rolledBackExp?.amount).toBe(240000);
    expect(rolledBackExp?.description).toBe('Cà phê Túi Mơ To');
    expect(rolledBackExp?.history?.[0]?.id).toBe(headId);
    expect(rolledBackExp?.history?.[0]?.amount).toBe(300000);
    expect(rolledBackExp?.history?.[1]?.id).toBe('e-4');
    expect(rolledBackExp?.history?.[1]?.amount).toBe(240000);

    // Activity records expense_rolled_back
    const activityRow = await env.DB.prepare(
      "SELECT action, details_json FROM activity WHERE trip_id = ? AND action = 'expense_rolled_back' ORDER BY created_at DESC",
    )
      .bind(T.tripId)
      .first<{ action: string; details_json: string }>();
    expect(activityRow).toBeDefined();
    expect(JSON.parse(activityRow!.details_json)).toMatchObject({
      description: 'Cà phê Túi Mơ To',
      amount: 240000,
    });
  });

  it('rollback rejects invalid targetHistoryId or historical row from another expense', async () => {
    const headers = await minhHeaders();

    // Edit e-4
    await send('PATCH', '/expenses/e-4', headers, {
      description: 'Cà phê 300k',
      amount: 300000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });

    // Try to rollback with non-existent history id
    const res1 = await send('POST', '/expenses/e-4/rollback', headers, {
      targetHistoryId: 'non-existent-id',
    });
    expect(res1.status).toBe(404);

    // Try to rollback with an active expense id (e-1) instead of historical row
    const res2 = await send('POST', '/expenses/e-4/rollback', headers, {
      targetHistoryId: 'e-1',
    });
    expect(res2.status).toBe(404);
  });

  it('DELETE /expenses/:eid removes the active head and all history rows sharing rootId', async () => {
    const headers = await minhHeaders();

    // Edit e-4 so it has history
    const editRes = await send('PATCH', '/expenses/e-4', headers, {
      description: 'Cà phê 300k',
      amount: 300000,
      spentOn: '2026-10-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });
    const { expenseId: headId } = await json<{ expenseId: string }>(editRes);

    // Delete using rootId 'e-4'
    const delRes = await send('DELETE', '/expenses/e-4', headers);
    expect(delRes.status).toBe(204);

    // All rows in transactions with root_id = 'e-4' should be deleted
    const countRow = await env.DB.prepare('SELECT count(*) AS n FROM transactions WHERE root_id = ?')
      .bind('e-4')
      .first<{ n: number }>();
    expect(countRow?.n).toBe(0);

    // All transaction_shares for both headId and e-4 should be deleted
    const sharesCount = await env.DB.prepare('SELECT count(*) AS n FROM transaction_shares WHERE transaction_id IN (?, ?)')
      .bind('e-4', headId)
      .first<{ n: number }>();
    expect(sharesCount?.n).toBe(0);

    // Trip snapshot should no longer contain e-4
    const trip = await getTrip(headers);
    expect(trip.expenses.some((e) => e.rootId === 'e-4')).toBe(false);
  });

  it('approving, disabling, and enabling resolve expense head by rootId or id', async () => {
    const minh = await minhHeaders();

    // Add pending expense as guest Chi
    const chi = await guestHeaders(PID.C);
    const addRes = await send('POST', '/expenses', chi, {
      description: 'Bánh mì',
      amount: 90000,
      spentOn: '2026-10-10',
      payerId: PID.C,
      mode: 'equal',
      entries: [
        { participantId: PID.C, value: 1 },
        { participantId: PID.M, value: 1 },
      ],
    });
    expect(addRes.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(addRes);

    // Edit while pending by guest Chi
    const editRes = await send('PATCH', `/expenses/${expenseId}`, chi, {
      description: 'Bánh mì đặc biệt',
      amount: 100000,
      spentOn: '2026-10-10',
      payerId: PID.C,
      mode: 'equal',
      entries: [
        { participantId: PID.C, value: 1 },
        { participantId: PID.M, value: 1 },
      ],
    });
    expect(editRes.status).toBe(200);
    const { expenseId: newHeadId, rootId } = await json<{ expenseId: string; rootId: string }>(editRes);
    expect(rootId).toBe(expenseId);

    // Approve using rootId by Minh
    const approveRes = await send('POST', `/expenses/${rootId}/approve`, minh, {});
    expect(approveRes.status).toBe(204);

    // Disable using rootId (which is original expenseId)
    const disableRes = await send('POST', `/expenses/${rootId}/disable`, minh, {});
    expect(disableRes.status).toBe(204);

    let trip = await getTrip(minh);
    let exp = trip.expenses.find((e) => e.rootId === rootId);
    expect(exp?.status).toBe('disabled');

    // Enable using head id
    const enableRes = await send('POST', `/expenses/${newHeadId}/enable`, minh, {});
    expect(enableRes.status).toBe(204);

    trip = await getTrip(minh);
    exp = trip.expenses.find((e) => e.rootId === rootId);
    expect(exp?.status).toBe('approved');
  });
});
