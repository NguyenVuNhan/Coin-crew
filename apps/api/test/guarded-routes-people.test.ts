import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { insertProposal } from '../src/proposals/store';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const code = async (res: Response) => (await json<{ error: { code: string } }>(res)).error.code;

async function tripState() {
  const trip = await env.DB.prepare('SELECT version FROM trips WHERE id = ?').bind(T.tripId).first<{ version: number }>();
  const acts = await env.DB.prepare('SELECT COUNT(*) AS n FROM activity WHERE trip_id = ?').bind(T.tripId).first<{ n: number }>();
  return { version: trip!.version, activity: acts!.n };
}

async function statusOf(table: string, id: string) {
  return (await env.DB.prepare(`SELECT status FROM ${table} WHERE id = ?`).bind(id).first<{ status: string }>())!.status;
}

async function addPending(id = 'p-dung-pending') {
  await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, status, sort_order, created_at) VALUES (?, ?, 'Dũng', 'dung', 'pending', 10, '2026-10-12T00:00:00.000Z')")
    .bind(id, T.tripId).run();
  return id;
}

async function askMembership(): Promise<string> {
  const anSid = await memberSid('u-an-2', 'An Trần');
  const g = await guestHeaders(PID.A);
  const res = await send('/membership', { ...g, Cookie: `${g.Cookie}; sid=${anSid}` }, { participantId: PID.A });
  expect(res.status).toBe(201);
  return (await env.DB.prepare("SELECT id FROM membership_requests WHERE trip_id = ? AND status = 'pending'").bind(T.tripId).first<{ id: string }>())!.id;
}

async function askProposal(): Promise<string> {
  await memberSid('u-eve', 'Eve');
  return insertProposal(getDb(env), {
    tripId: T.tripId, guestPid: PID.A, intoPid: null, targetUserId: 'u-eve', requestedBy: U.minh,
    needsUser: true, needsAdmin: true,
  });
}

beforeEach(async () => { await seedTrip(); await seedExpenses(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('name approval is atomic', () => {
  it('a lost approve writes nothing', async () => {
    const pid = await addPending();
    const headers = await minh();
    expect((await send(`/people/${pid}/approve`, headers, {})).status).toBe(204);
    const before = await tripState();

    const res = await send(`/people/${pid}/approve`, headers, {});
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('ALREADY_HANDLED');
    expect(await tripState()).toEqual(before);
  });

  it('a failed batch leaves the name pending', async () => {
    const pid = await addPending();
    const before = await tripState();
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await send(`/people/${pid}/approve`, await minh(), {});
    expect(res.status).toBe(500);
    expect(await statusOf('participants', pid)).toBe('pending');
    expect(await tripState()).toEqual(before);
  });
});

describe('membership reject is atomic', () => {
  it('a lost reject writes nothing', async () => {
    const rid = await askMembership();
    const headers = await minh();
    expect((await send(`/membership/${rid}/reject`, headers)).status).toBe(204);
    const before = await tripState();

    const res = await send(`/membership/${rid}/reject`, headers);
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('ALREADY_HANDLED');
    expect(await tripState()).toEqual(before);
  });

  it('a failed batch leaves the request pending', async () => {
    const rid = await askMembership();
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await send(`/membership/${rid}/reject`, await minh());
    expect(res.status).toBe(500);
    expect(await statusOf('membership_requests', rid)).toBe('pending');
  });
});

describe('proposal decline and reject are atomic', () => {
  it('a lost admin reject writes nothing', async () => {
    const id = await askProposal();
    const headers = await minh();
    expect((await send(`/proposals/${id}/reject`, headers)).status).toBe(204);
    const before = await tripState();

    const res = await send(`/proposals/${id}/reject`, headers);
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('ALREADY_HANDLED');
    expect(await tripState()).toEqual(before);
  });

  it('a failed batch leaves the proposal pending on admin reject', async () => {
    const id = await askProposal();
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await send(`/proposals/${id}/reject`, await minh());
    expect(res.status).toBe(500);
    expect(await statusOf('merge_proposals', id)).toBe('pending');
  });

  it('a failed batch leaves the proposal pending on user decline', async () => {
    const id = await askProposal();
    const eve = { Cookie: `sid=${await memberSid('u-eve', 'Eve')}` };
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await call(`/api/me/proposals/${id}/decline`, { method: 'POST', headers: eve });
    expect(res.status).toBe(500);
    expect(await statusOf('merge_proposals', id)).toBe('pending');
  });
});
