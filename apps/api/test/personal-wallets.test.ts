import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { MAX_WALLET_AMOUNT } from '@cc/core';
import type { WalletsResponse, CreateWalletResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';

async function setSwitch(userId: string, enabled: 0 | 1) {
  await env.DB.prepare(
    "INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, ?, '2026-11-15T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled",
  ).bind(userId, enabled).run();
}
const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const postWallet = (sid: string | null, body: unknown) =>
  call('/api/me/personal/wallets', {
    method: 'POST',
    headers: { ...(sid ? { Cookie: `sid=${sid}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getWallets = (sid: string | null) =>
  call('/api/me/personal/wallets', sid ? as(sid) : {});

beforeAll(async () => {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS personal_wallets (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      currency text NOT NULL DEFAULT 'VND',
      start_amount integer NOT NULL,
      start_date text NOT NULL,
      is_default integer NOT NULL DEFAULT 0,
      created_at text NOT NULL,
      updated_at text NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS personal_wallets_user_id_is_default_uq
    ON personal_wallets(user_id) WHERE is_default = 1
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS personal_wallets_user_id_idx
    ON personal_wallets(user_id)
  `).run();
});

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal wallets', () => {
  it('401 signed out for both routes', async () => {
    expect((await getWallets(null)).status).toBe(401);
    expect((await postWallet(null, { name: 'Tiền mặt', startAmount: 1000 })).status).toBe(401);
  });

  it('403 for a signed-in user whose setting is off, for both routes', async () => {
    const sidNoRow = await memberSid('u-off-norow', 'OffNoRow');
    expect((await getWallets(sidNoRow)).status).toBe(403);
    expect((await postWallet(sidNoRow, { name: 'Tiền mặt', startAmount: 1000 })).status).toBe(403);

    const sidOff = await memberSid('u-off-row', 'OffRow');
    await setSwitch('u-off-row', 0);
    expect((await getWallets(sidOff)).status).toBe(403);
    expect((await postWallet(sidOff, { name: 'Tiền mặt', startAmount: 1000 })).status).toBe(403);
  });

  it('GET returns { wallets: [] } at first', async () => {
    const sid = await memberSid('u-empty', 'Empty');
    await setSwitch('u-empty', 1);

    const res = await getWallets(sid);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ wallets: [] });
  });

  it('POST { name: "  Tiền mặt  ", startAmount: 2320000 } -> 201 with wallet matching { name: "Tiền mặt", currency: "VND", balance: 2320000, isDefault: true } and a string id, and GET then lists exactly that wallet', async () => {
    const sid = await memberSid('u-create', 'Create');
    await setSwitch('u-create', 1);

    const postRes = await postWallet(sid, { name: '  Tiền mặt  ', startAmount: 2320000 });
    expect(postRes.status).toBe(201);
    const postData = await json<CreateWalletResponse>(postRes);
    expect(typeof postData.wallet.id).toBe('string');
    expect(postData.wallet.id.length).toBeGreaterThan(0);
    expect(postData.wallet).toMatchObject({
      name: 'Tiền mặt',
      currency: 'VND',
      balance: 2320000,
      isDefault: true,
    });

    const getRes = await getWallets(sid);
    expect(getRes.status).toBe(200);
    expect(await json<WalletsResponse>(getRes)).toEqual({
      wallets: [postData.wallet],
    });
  });

  it('startAmount 0 is accepted', async () => {
    const sid = await memberSid('u-zero-amt', 'ZeroAmt');
    await setSwitch('u-zero-amt', 1);

    const res = await postWallet(sid, { name: 'Ví 0đ', startAmount: 0 });
    expect(res.status).toBe(201);
    const data = await json<CreateWalletResponse>(res);
    expect(data.wallet).toMatchObject({
      name: 'Ví 0đ',
      currency: 'VND',
      balance: 0,
      isDefault: true,
    });
  });

  it('422 for each of: name "", a name of 41 characters, name 5 (a number), startAmount -1, 1.5, "100", MAX_WALLET_AMOUNT + 1, a missing startAmount, an array body', async () => {
    const sid = await memberSid('u-invalid', 'Invalid');
    await setSwitch('u-invalid', 1);

    const invalidBodies: unknown[] = [
      { name: '', startAmount: 1000 },
      { name: 'a'.repeat(41), startAmount: 1000 },
      { name: 5, startAmount: 1000 },
      { name: 'Tiền mặt', startAmount: -1 },
      { name: 'Tiền mặt', startAmount: 1.5 },
      { name: 'Tiền mặt', startAmount: '100' },
      { name: 'Tiền mặt', startAmount: MAX_WALLET_AMOUNT + 1 },
      { name: 'Tiền mặt' },
      [{ name: 'Tiền mặt', startAmount: 1000 }],
    ];

    for (const body of invalidBodies) {
      const res = await postWallet(sid, body);
      expect(res.status).toBe(422);
      const err = await json<{ error: { code: string; message: string } }>(res);
      expect(err.error.code).toBe('VALIDATION');
    }
  });

  it('a second POST -> 409 with error.code "ALREADY_HANDLED" and still exactly one wallet', async () => {
    const sid = await memberSid('u-second-post', 'SecondPost');
    await setSwitch('u-second-post', 1);

    const first = await postWallet(sid, { name: 'Ví 1', startAmount: 100000 });
    expect(first.status).toBe(201);
    const firstWallet = (await json<CreateWalletResponse>(first)).wallet;

    const second = await postWallet(sid, { name: 'Ví 2', startAmount: 200000 });
    expect(second.status).toBe(409);
    const err = await json<{ error: { code: string; message: string } }>(second);
    expect(err.error.code).toBe('ALREADY_HANDLED');

    const list = await getWallets(sid);
    const data = await json<WalletsResponse>(list);
    expect(data.wallets).toEqual([firstWallet]);
  });

  it('another switched-on account sees { wallets: [] } and can create its own', async () => {
    const sidA = await memberSid('u-user-a', 'UserA');
    await setSwitch('u-user-a', 1);
    const resA = await postWallet(sidA, { name: 'Ví A', startAmount: 100000 });
    expect(resA.status).toBe(201);
    const walletA = (await json<CreateWalletResponse>(resA)).wallet;

    const sidB = await memberSid('u-user-b', 'UserB');
    await setSwitch('u-user-b', 1);

    const listB1 = await getWallets(sidB);
    expect(listB1.status).toBe(200);
    expect(await json(listB1)).toEqual({ wallets: [] });

    const resB = await postWallet(sidB, { name: 'Ví B', startAmount: 200000 });
    expect(resB.status).toBe(201);
    const walletB = (await json<CreateWalletResponse>(resB)).wallet;
    expect(walletB.name).toBe('Ví B');
    expect(walletB.balance).toBe(200000);

    const listB2 = await getWallets(sidB);
    expect(listB2.status).toBe(200);
    expect(await json(listB2)).toEqual({ wallets: [walletB] });

    const listA = await getWallets(sidA);
    expect(listA.status).toBe(200);
    expect(await json(listA)).toEqual({ wallets: [walletA] });
  });
});
