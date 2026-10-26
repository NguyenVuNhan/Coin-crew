import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, linkMember, memberSid, PID, seedTrip, T, U } from './helpers';
import { makeSport, seedIncome } from './fund-helpers';

const base = `/api/trips/${T.tripId}`;
const income = { amount: 250000, spentOn: '2026-10-26', description: 'Đóng quỹ tháng 11' };

const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// i-2 is the edited version of i-1; i-3 is disabled.
const writes: [string, (h: Record<string, string>) => Promise<Response>][] = [
  ['edit', (h) => send('PATCH', '/fund/incomes/i-2', h, income)],
  ['disable', (h) => send('POST', '/fund/incomes/i-2/disable', h)],
  ['enable', (h) => send('POST', '/fund/incomes/i-3/enable', h)],
  ['roll back', (h) => send('POST', '/fund/incomes/i-2/rollback', h, { targetHistoryId: 'i-1' })],
];

const incomeRows = async () =>
  (await env.DB.prepare("SELECT id, amount, status, is_latest FROM transactions WHERE type = 'income' ORDER BY id").all()).results;

let minh: Record<string, string>;
let an: Record<string, string>;

beforeEach(async () => {
  await seedTrip();
  minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
  an = { Cookie: `sid=${await linkMember(PID.A, U.an, 'An')}` };
  await seedIncome({ id: 'i-1', amount: 200000, status: 'superseded', isLatest: 0, createdAt: '2026-10-25T10:00:00.000Z' });
  await seedIncome({ id: 'i-2', rootId: 'i-1', parentId: 'i-1', amount: 220000 });
  await seedIncome({ id: 'i-3', amount: 100000, status: 'disabled', disabledByUserId: U.minh });
});

describe('fund income writes other than add', () => {
  it.each(writes)('%s: 403 for a member who is not an admin', async (_, write) => {
    await makeSport();
    const before = await incomeRows();
    expect((await write(an)).status).toBe(403);
    expect(await incomeRows()).toEqual(before);
  });

  it.each(writes)('%s: goes through for an admin in a sport group', async (_, write) => {
    await makeSport();
    expect((await write(minh)).status).toBeLessThan(300);
  });

  it.each(writes)('%s: 403 for an admin in a trip group', async (_, write) => {
    const before = await incomeRows();
    expect((await write(minh)).status).toBe(403);
    expect(await incomeRows()).toEqual(before);
  });
});
