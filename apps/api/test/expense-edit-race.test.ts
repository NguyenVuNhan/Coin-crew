import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpenseInput } from '@cc/core';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@cc/api-db/client';
import { transactions } from '@cc/api-db/schema';
import type { ResolvedActor } from '@cc/api-auth/actor';
import { ApiError } from '@cc/api-util/errors';
import { writeExpenseEdit, type TransactionRow, type ValidatedExpense } from '../src/expenses/routes';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const equalAll = (amount: number, payerId: string, description = 'Bánh tráng nướng'): ExpenseInput => ({
  description, amount, spentOn: '2026-10-11', payerId, mode: 'equal',
  entries: [PID.M, PID.A, PID.B, PID.C].map((participantId) => ({ participantId, value: 1 })),
});

async function addPendingAsChi(): Promise<string> {
  const res = await send('POST', '/expenses', await guestHeaders(PID.C), equalAll(180000, PID.C));
  expect(res.status).toBe(201);
  return (await json<{ expenseId: string }>(res)).expenseId;
}

async function readHead(rootId: string): Promise<TransactionRow> {
  const rows = await getDb(env).select().from(transactions).where(and(eq(transactions.rootId, rootId), eq(transactions.isLatest, 1)));
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function heads(rootId: string) {
  const { results } = await env.DB.prepare('SELECT id, status, description, amount FROM transactions WHERE root_id = ? AND is_latest = 1')
    .bind(rootId).all<{ id: string; status: string; description: string; amount: number }>();
  return results;
}

const chiActor = { participantId: PID.C, userId: null, deviceHash: 'dev-chi' } as unknown as ResolvedActor;
const editTo = (description: string): ValidatedExpense => ({
  description, amount: 200000, spentOn: '2026-10-11', payerId: PID.C, mode: 'equal', meta: null,
  shares: [PID.M, PID.A, PID.B, PID.C].map((participantId) => ({ participantId, inputValue: 1, inputAuto: 0 as const, amount: 50000 })),
});

async function expectAlreadyHandled(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe('ALREADY_HANDLED');
  expect((err as ApiError).status).toBe(409);
}

beforeEach(async () => { await seedTrip(); await seedExpenses(); });

describe('an expense edit cannot undo an approval', () => {
  it('stale edit after approve is refused', async () => {
    const rootId = await addPendingAsChi();
    const stale = await readHead(rootId);
    expect(stale.status).toBe('pending');
    expect((await send('POST', `/expenses/${rootId}/approve`, await minh())).status).toBe(204);

    await expectAlreadyHandled(writeExpenseEdit(getDb(env), T.tripId, stale, editTo('Changed'), chiActor, false));

    const after = await heads(rootId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: 'approved', description: 'Bánh tráng nướng', amount: 180000 });
  });

  it('two stale edits leave one head', async () => {
    const rootId = await addPendingAsChi();
    const stale = await readHead(rootId);
    const db = getDb(env);

    const first = await writeExpenseEdit(db, T.tripId, stale, editTo('First'), chiActor, false);
    await expectAlreadyHandled(writeExpenseEdit(db, T.tripId, stale, editTo('Second'), chiActor, false));

    const after = await heads(rootId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: first, status: 'pending', description: 'First' });
  });

  it('concurrent guest edit and member approve never leave a pending copy of an approved expense', async () => {
    const rootId = await addPendingAsChi();
    const chi = await guestHeaders(PID.C);
    const m = await minh();

    const [edit, approve] = await Promise.all([
      send('PATCH', `/expenses/${rootId}`, chi, equalAll(200000, PID.C, 'Edited')),
      send('POST', `/expenses/${rootId}/approve`, m),
    ]);

    const after = await heads(rootId);
    expect(after).toHaveLength(1);
    if (approve.status === 204) {
      expect([403, 409]).toContain(edit.status);
      expect(after[0]!.status).toBe('approved');
    } else {
      expect(approve.status).toBe(409);
      expect(edit.status).toBe(200);
      expect(after[0]).toMatchObject({ status: 'pending', description: 'Edited' });
    }
  });

  it('member edit of an approved expense keeps it approved', async () => {
    const res = await send('PATCH', '/expenses/e-4', await minh(), { ...equalAll(300000, PID.M, 'Cà phê'), entries: [{ participantId: PID.M, value: 1 }, { participantId: PID.A, value: 1 }] });
    expect(res.status).toBe(200);
    const after = await heads('e-4');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: 'approved', amount: 300000 });
  });

  it('a stale rollback after approve is refused', async () => {
    const rootId = await addPendingAsChi();
    const chi = await guestHeaders(PID.C);
    expect((await send('PATCH', `/expenses/${rootId}`, chi, equalAll(200000, PID.C, 'Edited'))).status).toBe(200);
    const { results } = await env.DB.prepare('SELECT id FROM transactions WHERE root_id = ? AND is_latest = 0').bind(rootId).all<{ id: string }>();
    expect(results).toHaveLength(1);

    // Approve and roll back at once: the rollback must never put back a pending copy of an approved expense.
    const [rollback, approve] = await Promise.all([
      send('POST', `/expenses/${rootId}/rollback`, chi, { targetHistoryId: results[0]!.id }),
      send('POST', `/expenses/${rootId}/approve`, await minh()),
    ]);
    const after = await heads(rootId);
    expect(after).toHaveLength(1);
    if (approve.status === 204) {
      expect([403, 409]).toContain(rollback.status);
      expect(after[0]!.status).toBe('approved');
    } else {
      expect(rollback.status).toBe(200);
      expect(after[0]!.status).toBe('pending');
    }
  });
});
