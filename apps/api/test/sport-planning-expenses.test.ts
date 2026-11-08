import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpenseInput, TripView } from '@cc/core';
import { call, json, seedTrip, seedUser, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const anMember = async () => ({ Cookie: `sid=${await memberSid(U.an, 'An')}` });

beforeEach(async () => {
  await seedTrip();
  await seedUser(U.an, 'An');
  await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
  await env.DB.prepare("UPDATE participants SET user_id = ?, gender = 'M' WHERE id = ?").bind(U.an, PID.A).run();
  await env.DB.prepare("UPDATE participants SET gender = 'F' WHERE id = ?").bind(PID.M).run();
});

describe('sport planning expenses lifecycle', () => {
  const planningInput: ExpenseInput = {
    description: 'Cầu lông sáng CN',
    amount: 0,
    spentOn: '2026-11-08',
    payerId: PID.M,
    mode: 'amounts',
    entries: [
      { participantId: PID.M, value: 0 },
      { participantId: PID.A, value: 0 },
    ],
    meta: {
      sport: {
        planning: true,
        location: {
          name: 'Sân Cầu Lông Putin - 158 Phú Diễn',
          address: '158 Phú Diễn, Phường Phú Diễn, Hà Nội',
          phone: '0345747800',
          mapUrl: 'https://maps.app.goo.gl/xyz123',
        },
        courtSlots: [
          { courtName: 'Cầu Lông 6', timeRange: '05:00 - 07:00' },
          { courtName: 'Cầu Lông 5', timeRange: '05:30 - 07:00' },
        ],
        bookingCode: '#4139',
        totalDuration: '3h30p',
        court: 168000,
        shuttlecocks: [],
        extra: 0,
        rule: { kind: 'equal' },
        entries: [
          { participantId: PID.M, maleSlots: 0, femaleSlots: 1 },
          { participantId: PID.A, maleSlots: 1, femaleSlots: 0 },
        ],
        maleSlotRate: 0,
        femaleSlotRate: 0,
      },
    },
  };

  it('creates a planning session with 0 balance impact and hides QR/pay-info', async () => {
    const headers = await minh();
    const res = await call(`${base}/expenses`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(planningInput),
    });
    expect(res.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(res);

    const v = await json<TripView>(call(base, { headers }));
    const exp = v.expenses.find((e) => e.id === expenseId);
    expect(exp?.amount).toBe(0);
    expect(exp?.meta?.sport?.planning).toBe(true);
    expect(exp?.meta?.sport?.court).toBe(168000);
    expect(exp?.meta?.sport?.courtSlots).toHaveLength(2);
    expect(v.balances[PID.M]).toBe(0);
    expect(v.balances[PID.A]).toBe(0);
    expect(v.suggestions).toEqual([]);

    const qrRes = await call(`/j/${T.groupToken}/e/${expenseId}/qr.png`);
    expect(qrRes.status).toBe(404);

    const payRes = await call(`${base}/pay/${PID.M}?bill=1&expense=${expenseId}`, { headers });
    expect(payRes.status).toBe(404);
  });

  it('rejects planning creation from non-admin members and guests', async () => {
    const nonAdmin = await anMember();
    const res1 = await call(`${base}/expenses`, {
      method: 'POST',
      headers: { ...nonAdmin, 'Content-Type': 'application/json' },
      body: JSON.stringify(planningInput),
    });
    expect(res1.status).toBe(403);

    const guest = await guestHeaders(PID.C);
    const res2 = await call(`${base}/expenses`, {
      method: 'POST',
      headers: { ...guest, 'Content-Type': 'application/json' },
      body: JSON.stringify(planningInput),
    });
    expect(res2.status).toBe(403);
  });

  it('allows a co-admin to complete the planning session into a real bill and preserves history', async () => {
    const minhHeaders = await minh();
    const { expenseId } = await json<{ expenseId: string }>(
      call(`${base}/expenses`, {
        method: 'POST',
        headers: { ...minhHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(planningInput),
      }),
    );

    // Promote An to co-admin
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.A).run();
    const anHeaders = await anMember();

    const completedInput: ExpenseInput = {
      description: 'Cầu lông sáng CN',
      amount: 220000,
      spentOn: '2026-11-08',
      payerId: PID.M,
      mode: 'amounts',
      entries: [
        { participantId: PID.M, value: 110000 },
        { participantId: PID.A, value: 110000 },
      ],
      meta: {
        sport: {
          ...planningInput.meta!.sport!,
          planning: false,
          shuttlecocks: [{ qty: 2, unitPrice: 26000 }],
          maleSlotRate: 110000,
          femaleSlotRate: 110000,
        },
      },
    };

    const patchRes = await call(`${base}/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: { ...anHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(completedInput),
    });
    expect(patchRes.status).toBe(200);

    const v = await json<TripView>(call(base, { headers: minhHeaders }));
    const updated = v.expenses.find((e) => e.rootId === expenseId);
    expect(updated?.amount).toBe(220000);
    expect(updated?.meta?.sport?.planning).toBeFalsy();
    expect(updated?.history).toHaveLength(1);
    expect(updated?.history?.[0]?.amount).toBe(0);
    expect(v.balances[PID.M]).toBe(110000);
    expect(v.balances[PID.A]).toBe(-110000);
  });

  it('allows a co-admin to delete a planning session, while rejecting non-admin members and guests', async () => {
    const minhHeaders = await minh();
    const { expenseId } = await json<{ expenseId: string }>(
      call(`${base}/expenses`, {
        method: 'POST',
        headers: { ...minhHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(planningInput),
      }),
    );

    // Non-admin member An attempts to delete Minh's planning session
    const nonAdminHeaders = await anMember();
    const del1 = await call(`${base}/expenses/${expenseId}`, {
      method: 'DELETE',
      headers: nonAdminHeaders,
    });
    expect(del1.status).toBe(403);

    // Guest attempts to delete
    const guest = await guestHeaders(PID.C);
    const delGuest = await call(`${base}/expenses/${expenseId}`, {
      method: 'DELETE',
      headers: guest,
    });
    expect(delGuest.status).toBe(403);

    // Promote An to co-admin
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.A).run();
    const coAdminHeaders = await anMember();
    const del2 = await call(`${base}/expenses/${expenseId}`, {
      method: 'DELETE',
      headers: coAdminHeaders,
    });
    expect(del2.status).toBe(204);

    const v = await json<TripView>(call(base, { headers: minhHeaders }));
    expect(v.expenses.find((e) => e.id === expenseId)).toBeUndefined();
  });

  it('rejects invalid mapUrl scheme in planning session location', async () => {
    const headers = await minh();
    const badInput = {
      ...planningInput,
      meta: {
        ...planningInput.meta,
        sport: {
          ...planningInput.meta?.sport,
          location: {
            name: 'Sân Cầu Lông',
            address: '123 Đường',
            mapUrl: 'javascript:alert(1)',
          },
        },
      },
    };
    const res = await call(`${base}/expenses`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(badInput),
    });
    expect(res.status).toBe(422);
  });

  it('allows an admin to rollback a completed session back to its planning version while blocking non-admins', async () => {
    const minhHeaders = await minh();
    const { expenseId } = await json<{ expenseId: string }>(
      call(`${base}/expenses`, {
        method: 'POST',
        headers: { ...minhHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(planningInput),
      }),
    );

    const completedInput: ExpenseInput = {
      description: 'Cầu lông sáng CN',
      amount: 220000,
      spentOn: '2026-11-08',
      payerId: PID.M,
      mode: 'amounts',
      entries: [
        { participantId: PID.M, value: 110000 },
        { participantId: PID.A, value: 110000 },
      ],
      meta: {
        sport: {
          ...planningInput.meta!.sport!,
          planning: false,
          shuttlecocks: [{ qty: 2, unitPrice: 26000 }],
          maleSlotRate: 110000,
          femaleSlotRate: 110000,
        },
      },
    };

    const patchRes = await call(`${base}/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: { ...minhHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(completedInput),
    });
    expect(patchRes.status).toBe(200);

    // Non-admin cannot rollback to planning version
    const nonAdminHeaders = await anMember();
    const rbDenied = await call(`${base}/expenses/${expenseId}/rollback`, {
      method: 'POST',
      headers: { ...nonAdminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetHistoryId: expenseId }),
    });
    expect(rbDenied.status).toBe(403);

    // Admin can rollback to planning version
    const rbOk = await call(`${base}/expenses/${expenseId}/rollback`, {
      method: 'POST',
      headers: { ...minhHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetHistoryId: expenseId }),
    });
    expect(rbOk.status).toBe(200);

    const v = await json<TripView>(call(base, { headers: minhHeaders }));
    const rolledBack = v.expenses.find((e) => e.rootId === expenseId);
    expect(rolledBack?.amount).toBe(0);
    expect(rolledBack?.meta?.sport?.planning).toBe(true);
    expect(v.balances[PID.M]).toBe(0);
  });
});
