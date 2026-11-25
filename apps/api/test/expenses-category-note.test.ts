import { describe, it, expect, beforeEach } from 'vitest';
import type { ExpenseInput, TripView } from '@cc/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';
import { makeSport } from './fund-helpers';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const err = async (res: Response) => (await json<{ error: { code: string; reason?: string; message: string } }>(res)).error;
const equalAll = (
  amount: number,
  payerId: string,
  description = 'Ăn tối quán nướng',
  extra: Partial<ExpenseInput> = {},
): ExpenseInput => ({
  description,
  amount,
  spentOn: '2026-10-11',
  payerId,
  mode: 'equal',
  entries: [PID.M, PID.A, PID.B, PID.C].map((participantId) => ({ participantId, value: 1 })),
  ...extra,
});

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
});

describe('expense categoryKey and note', () => {
  it('create with categoryKey food-dining and note round-trips in the trip view', async () => {
    const headers = await minh();
    const res = await send(
      'POST',
      '/expenses',
      headers,
      equalAll(400000, PID.M, 'Ăn tối', { categoryKey: 'food-dining', note: '  Quán nướng gần hồ  ' }),
    );
    expect(res.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(res);
    const created = (await view(headers)).expenses.find((e) => e.id === expenseId);
    expect(created).toMatchObject({
      description: 'Ăn tối',
      categoryKey: 'food-dining',
      note: 'Quán nướng gần hồ',
    });
  });

  it('create without them stores nulls', async () => {
    const headers = await minh();
    const res = await send('POST', '/expenses', headers, equalAll(200000, PID.M, 'Cà phê'));
    expect(res.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(res);
    const created = (await view(headers)).expenses.find((e) => e.id === expenseId);
    expect(created?.categoryKey).toBeNull();
    expect(created?.note).toBeNull();
  });

  it('income key or unknown key returns 422, note of 501 chars returns 422, and blank note stores null', async () => {
    const headers = await minh();

    const incomeKeyRes = await send(
      'POST',
      '/expenses',
      headers,
      equalAll(100000, PID.M, 'Test', { categoryKey: 'salary' }),
    );
    expect(incomeKeyRes.status).toBe(422);
    expect(await err(incomeKeyRes)).toMatchObject({ code: 'VALIDATION', reason: 'categoryKey' });

    const unknownKeyRes = await send(
      'POST',
      '/expenses',
      headers,
      equalAll(100000, PID.M, 'Test', { categoryKey: 'not-a-category' }),
    );
    expect(unknownKeyRes.status).toBe(422);
    expect(await err(unknownKeyRes)).toMatchObject({ code: 'VALIDATION', reason: 'categoryKey' });

    const longNoteRes = await send(
      'POST',
      '/expenses',
      headers,
      equalAll(100000, PID.M, 'Test', { note: 'a'.repeat(501) }),
    );
    expect(longNoteRes.status).toBe(422);
    expect(await err(longNoteRes)).toMatchObject({ code: 'VALIDATION', reason: 'noteLength' });

    const blankNoteRes = await send(
      'POST',
      '/expenses',
      headers,
      equalAll(100000, PID.M, 'Blank note', { note: '   ' }),
    );
    expect(blankNoteRes.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(blankNoteRes);
    expect((await view(headers)).expenses.find((e) => e.id === expenseId)?.note).toBeNull();
  });

  it('edit keeps category_key and note across versions, preserves nulls on old expenses, and null clears', async () => {
    const headers = await minh();
    const { expenseId } = await json<{ expenseId: string }>(
      send(
        'POST',
        '/expenses',
        headers,
        equalAll(300000, PID.M, 'Bữa tối', { categoryKey: 'food-dining', note: 'Có thêm nước ngọt' }),
      ),
    );

    // Edit only the amount (omit categoryKey and note): both carry forward.
    const editRes = await send('PATCH', `/expenses/${expenseId}`, headers, equalAll(360000, PID.M, 'Bữa tối'));
    expect(editRes.status).toBe(200);
    const edited = (await view(headers)).expenses.find((e) => e.rootId === expenseId);
    expect(edited).toMatchObject({
      amount: 360000,
      categoryKey: 'food-dining',
      note: 'Có thêm nước ngọt',
    });
    expect(edited?.history?.[0]).toMatchObject({
      categoryKey: 'food-dining',
      note: 'Có thêm nước ngọt',
    });

    // Explicitly passing null clears both fields.
    const clearRes = await send(
      'PATCH',
      `/expenses/${expenseId}`,
      headers,
      equalAll(360000, PID.M, 'Bữa tối', { categoryKey: null, note: null }),
    );
    expect(clearRes.status).toBe(200);
    const cleared = (await view(headers)).expenses.find((e) => e.rootId === expenseId);
    expect(cleared?.categoryKey).toBeNull();
    expect(cleared?.note).toBeNull();

    // Rollback to the first version restores categoryKey and note.
    const rollbackRes = await send('POST', `/expenses/${expenseId}/rollback`, headers, {
      targetHistoryId: expenseId,
    });
    expect(rollbackRes.status).toBe(200);
    const rolledBack = (await view(headers)).expenses.find((e) => e.rootId === expenseId);
    expect(rolledBack).toMatchObject({
      amount: 300000,
      categoryKey: 'food-dining',
      note: 'Có thêm nước ngọt',
    });

    // Editing an old expense with null category_key and note keeps both null.
    const oldEditRes = await send(
      'PATCH',
      '/expenses/e-4',
      headers,
      {
        ...equalAll(280000, PID.M, 'Cà phê Túi Mơ To'),
        entries: [PID.M, PID.A, PID.C].map((participantId) => ({ participantId, value: 1 })),
      },
    );
    expect(oldEditRes.status).toBe(200);
    const oldEdited = (await view(headers)).expenses.find((e) => e.rootId === 'e-4');
    expect(oldEdited?.categoryKey).toBeNull();
    expect(oldEdited?.note).toBeNull();
  });

  it('pending edit carries note and approving keeps it', async () => {
    const guest = await guestHeaders(PID.C);
    const member = await minh();

    const createRes = await send(
      'POST',
      '/expenses',
      guest,
      equalAll(180000, PID.C, 'Bánh tráng', { categoryKey: 'food', note: 'Ghi chú ban đầu' }),
    );
    expect(createRes.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(createRes);

    // Pending edit updates the note while omitting categoryKey (which stays 'food').
    const editRes = await send(
      'PATCH',
      `/expenses/${expenseId}`,
      guest,
      equalAll(200000, PID.C, 'Bánh tráng', { note: 'Đã cập nhật ghi chú' }),
    );
    expect(editRes.status).toBe(200);

    const pendingView = (await view(guest)).expenses.find((e) => e.rootId === expenseId);
    expect(pendingView).toMatchObject({
      status: 'pending',
      amount: 200000,
      categoryKey: 'food',
      note: 'Đã cập nhật ghi chú',
    });

    const approveRes = await send('POST', `/expenses/${expenseId}/approve`, member);
    expect(approveRes.status).toBe(204);

    const approvedView = (await view(member)).expenses.find((e) => e.rootId === expenseId);
    expect(approvedView).toMatchObject({
      status: 'approved',
      amount: 200000,
      categoryKey: 'food',
      note: 'Đã cập nhật ghi chú',
    });
  });

  it('fund income rejects categoryKey', async () => {
    await makeSport();
    const headers = await minh();
    const res = await send('POST', '/fund/incomes', headers, {
      amount: 200000,
      spentOn: '2026-10-26',
      description: 'Thu quỹ tháng 10',
      categoryKey: 'food-dining',
    });
    expect(res.status).toBe(422);
    expect(await err(res)).toMatchObject({ code: 'VALIDATION', reason: 'categoryKey' });
  });
});
