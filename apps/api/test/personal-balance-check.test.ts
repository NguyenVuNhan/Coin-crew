import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, memberSid, U } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

async function runSql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

describe('personal turn-off record and balance checks', () => {
  it('off->on within 1h returns no wallets', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const wRes = await addWallet(sid, {
      name: 'Ví chính',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);

    const offRes = await postJson('/api/me/personal', sid, { enabled: false }, 'PATCH');
    expect(offRes.status).toBe(200);

    const onRes = await postJson('/api/me/personal', sid, { enabled: true }, 'PATCH');
    expect(onRes.status).toBe(200);

    const row = await env.DB.prepare(
      'SELECT disabled_at, reenabled_at FROM personal_group_settings WHERE user_id = ?',
    )
      .bind(U.minh)
      .first<{ disabled_at: string | null; reenabled_at: string | null }>();
    expect(row?.disabled_at).toBeTruthy();
    expect(row?.reenabled_at).toBeTruthy();

    // Even if we move disabled_at to 1 hour before reenabled_at, it is still <= 24h
    const reenabledMs = Date.parse(row!.reenabled_at!);
    const oneHourEarlier = new Date(reenabledMs - 60 * 60 * 1000).toISOString();
    await runSql(
      'UPDATE personal_group_settings SET disabled_at = ? WHERE user_id = ?',
      oneHourEarlier,
      U.minh,
    );

    const checksRes = await call('/api/me/personal/balance-checks', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(checksRes.status).toBe(200);
    expect(await json<{ walletIds: string[] }>(checksRes)).toEqual({ walletIds: [] });
  });

  it('off->on after 2 days lists only everyday non-archived wallets', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const w1Res = await addWallet(sid, {
      name: 'Tiền mặt',
      currency: 'VND',
      kind: 'everyday',
      startAmount: 500_000,
      startDate: '2026-10-01',
    });
    expect(w1Res.status).toBe(201);
    const { wallet: w1 } = await json<{ wallet: { id: string } }>(w1Res);

    const w2Res = await addWallet(sid, {
      name: 'Ngân hàng',
      currency: 'VND',
      kind: 'everyday',
      startAmount: 2_000_000,
      startDate: '2026-10-01',
    });
    expect(w2Res.status).toBe(201);
    const { wallet: w2 } = await json<{ wallet: { id: string } }>(w2Res);

    const invRes = await addWallet(sid, {
      name: 'Đầu tư',
      currency: 'VND',
      kind: 'investment',
      startAmount: 10_000_000,
      startDate: '2026-10-01',
    });
    expect(invRes.status).toBe(201);

    const archRes = await addWallet(sid, {
      name: 'Ví cũ',
      currency: 'VND',
      kind: 'everyday',
      startAmount: 100_000,
      startDate: '2026-10-01',
    });
    expect(archRes.status).toBe(201);
    const { wallet: archWallet } = await json<{ wallet: { id: string } }>(archRes);
    await runSql(
      "UPDATE personal_wallet_settings SET archived_at = '2026-11-01T00:00:00.000Z' WHERE wallet_id = ?",
      archWallet.id,
    );

    await runSql(
      `INSERT INTO personal_group_settings (user_id, default_group_category_id, count_loans, disabled_at, reenabled_at, updated_at)
       VALUES (?, NULL, 0, '2026-11-18T10:00:00.000Z', '2026-11-20T12:00:00.000Z', '2026-11-20T12:00:00.000Z')
       ON CONFLICT(user_id) DO UPDATE SET disabled_at = excluded.disabled_at, reenabled_at = excluded.reenabled_at, updated_at = excluded.updated_at`,
      U.minh,
    );

    const checksRes = await call('/api/me/personal/balance-checks', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(checksRes.status).toBe(200);
    const data = await json<{ walletIds: string[] }>(checksRes);
    expect(data.walletIds).toEqual([w1.id, w2.id]);
  });

  it('answer with actual = balance + 70000 creates excluded income entry and removes wallet from list', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const wRes = await addWallet(sid, {
      name: 'Ví chính',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);
    const { wallet } = await json<{ wallet: { id: string; balance: number } }>(wRes);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    await runSql(
      `INSERT INTO personal_group_settings (user_id, default_group_category_id, count_loans, disabled_at, reenabled_at, updated_at)
       VALUES (?, NULL, 0, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET disabled_at = excluded.disabled_at, reenabled_at = excluded.reenabled_at, updated_at = excluded.updated_at`,
      U.minh,
      twoDaysAgo,
      oneMinAgo,
      oneMinAgo,
    );

    const postRes = await postJson(`/api/me/personal/wallets/${wallet.id}/balance-check`, sid, {
      actual: wallet.balance + 70_000,
    });
    expect(postRes.status).toBe(200);
    const { entryId } = await json<{ entryId: string | null }>(postRes);
    expect(typeof entryId).toBe('string');
    expect(entryId).not.toBeNull();

    const tx = await env.DB.prepare(
      'SELECT type, amount, category_id, note, exclude_from_reports, source FROM personal_transactions WHERE id = ?',
    )
      .bind(entryId)
      .first<{
        type: string;
        amount: number;
        category_id: string | null;
        note: string | null;
        exclude_from_reports: number;
        source: string;
      }>();
    expect(tx).toEqual({
      type: 'income',
      amount: 70_000,
      category_id: null,
      note: 'Điều chỉnh số dư',
      exclude_from_reports: 1,
      source: 'adjustment',
    });

    const checksRes = await call('/api/me/personal/balance-checks', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(checksRes.status).toBe(200);
    expect(await json<{ walletIds: string[] }>(checksRes)).toEqual({ walletIds: [] });

    const walletsRes = await call('/api/me/personal/wallets', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(walletsRes.status).toBe(200);
    const { wallets } = await json<{ wallets: { id: string; balance: number }[] }>(walletsRes);
    expect(wallets.find((w) => w.id === wallet.id)?.balance).toBe(wallet.balance + 70_000);
  });

  it('skip removes wallet from list with no entry created', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh, 1);

    const wRes = await addWallet(sid, {
      name: 'Ví chính',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);
    const { wallet } = await json<{ wallet: { id: string } }>(wRes);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    await runSql(
      `INSERT INTO personal_group_settings (user_id, default_group_category_id, count_loans, disabled_at, reenabled_at, updated_at)
       VALUES (?, NULL, 0, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET disabled_at = excluded.disabled_at, reenabled_at = excluded.reenabled_at, updated_at = excluded.updated_at`,
      U.minh,
      twoDaysAgo,
      oneMinAgo,
      oneMinAgo,
    );

    const skipRes = await postJson(`/api/me/personal/wallets/${wallet.id}/balance-check`, sid, {
      skip: true,
    });
    expect(skipRes.status).toBe(200);
    expect(await json<{ entryId: string | null }>(skipRes)).toEqual({ entryId: null });

    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM personal_transactions WHERE user_id = ?',
    )
      .bind(U.minh)
      .first<{ cnt: number }>();
    expect(countRow?.cnt).toBe(0);

    const checksRes = await call('/api/me/personal/balance-checks', {
      headers: { Cookie: `sid=${sid}` },
    });
    expect(checksRes.status).toBe(200);
    expect(await json<{ walletIds: string[] }>(checksRes)).toEqual({ walletIds: [] });
  });

  it('returns 403 when personal mode is off, 404 for another user wallet, and 422 for invalid body', async () => {
    const sidMinh = await memberSid(U.minh, 'Minh');
    const sidAn = await memberSid(U.an, 'An');
    await switchOn(U.minh, 1);
    await switchOn(U.an, 1);

    const wRes = await addWallet(sidMinh, {
      name: 'Ví Minh',
      currency: 'VND',
      startAmount: 100_000,
      startDate: '2026-10-01',
    });
    expect(wRes.status).toBe(201);
    const { wallet: minhWallet } = await json<{ wallet: { id: string } }>(wRes);

    // Another account's wallet -> 404
    const otherRes = await postJson(
      `/api/me/personal/wallets/${minhWallet.id}/balance-check`,
      sidAn,
      { skip: true },
    );
    expect(otherRes.status).toBe(404);

    // Invalid body -> 422
    const badRes = await postJson(
      `/api/me/personal/wallets/${minhWallet.id}/balance-check`,
      sidMinh,
      { actual: 10.5 },
    );
    expect(badRes.status).toBe(422);

    // Switch-off -> 403
    await switchOn(U.minh, 0);
    const offGet = await call('/api/me/personal/balance-checks', {
      headers: { Cookie: `sid=${sidMinh}` },
    });
    expect(offGet.status).toBe(403);

    const offPost = await postJson(
      `/api/me/personal/wallets/${minhWallet.id}/balance-check`,
      sidMinh,
      { skip: true },
    );
    expect(offPost.status).toBe(403);
  });
});
