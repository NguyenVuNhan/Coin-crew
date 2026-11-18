import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  AssetView,
  EntriesResponse,
  WalletDetailResponse,
} from '@cc/core';
import { app, call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const createAsset = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/assets', sid, body);

const patchAsset = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/assets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const patchWallet = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/wallets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const createEntry = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const patchEntry = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/transactions/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteEntry = (id: string, sid: string | null) =>
  call(`/api/me/personal/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });

const restoreEntries = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/transactions/restore', sid, body);

function countingEnv() {
  const counter = { queries: 0 };
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (q: string) => {
          counter.queries += 1;
          return target.prepare(q);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { env: { ...env, DB }, counter };
}

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_assets').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM user_personal_settings').run();
});

async function setupInvestmentFixture(userId: string) {
  const sid = await memberSid(userId, userId);
  await switchOn(userId, 1);

  const invWallet = (
    await json<WalletDetailResponse>(
      await addWallet(sid, {
        name: 'Đầu tư',
        currency: 'VND',
        kind: 'investment',
        startAmount: 100_000_000,
        startDate: '2026-11-01',
      }),
    )
  ).wallet;

  const btc = (
    await json<{ asset: AssetView }>(
      await createAsset(sid, {
        name: 'Bitcoin',
        unit: 'BTC',
        groupName: 'Crypto',
        decimals: 8,
      }),
    )
  ).asset;

  return { sid, invWallet, btc };
}

describe('personal trades — buy/sell entries and oversell checks', () => {
  it('buy in an investment wallet -> 201, stores asset_id/quantity, tags work, ignores excludeFromReports, rejects categoryId', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-1');

    const badCat = await createEntry(sid, {
      type: 'buy',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 50_000_000,
      amount: 50_000_000,
      categoryId: 'some-cat',
      date: '2026-11-10',
    });
    expect(badCat.status).toBe(422);

    const res = await createEntry(sid, {
      type: 'buy',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 50_000_000,
      amount: 50_000_000,
      date: '2026-11-10',
      time: '09:15',
      note: '  DCA BTC  ',
      tags: ['Crypto', 'dca'],
      excludeFromReports: true,
    });
    expect(res.status).toBe(201);
    const entry = (await json<EntriesResponse>(res)).entries[0]!;
    expect(entry).toMatchObject({
      walletId: invWallet.id,
      type: 'buy',
      amount: 50_000_000,
      currency: 'VND',
      categoryId: null,
      assetId: btc.id,
      quantity: 50_000_000,
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-10',
      time: '09:15',
      note: 'DCA BTC',
      tags: ['Crypto', 'dca'],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
    });

    const row = await env.DB.prepare(
      'SELECT asset_id, quantity, exclude_from_reports, category_id FROM personal_transactions WHERE id = ?',
    )
      .bind(entry.id)
      .first<{
        asset_id: string | null;
        quantity: number | null;
        exclude_from_reports: number;
        category_id: string | null;
      }>();
    expect(row).toEqual({
      asset_id: btc.id,
      quantity: 50_000_000,
      exclude_from_reports: 0,
      category_id: null,
    });
  });

  it('buy in an everyday wallet -> 422; archived investment wallet -> 422', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-2');

    const everyday = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Tiền mặt',
          currency: 'VND',
          kind: 'everyday',
          startAmount: 1_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const everydayRes = await createEntry(sid, {
      type: 'buy',
      walletId: everyday.id,
      assetId: btc.id,
      quantity: 100,
      amount: 100_000,
      date: '2026-11-10',
    });
    expect(everydayRes.status).toBe(422);

    const archivedWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Archived Inv',
          currency: 'VND',
          kind: 'investment',
          startAmount: 0,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    await patchWallet(archivedWallet.id, sid, { archived: true });

    const archivedRes = await createEntry(sid, {
      type: 'buy',
      walletId: archivedWallet.id,
      assetId: btc.id,
      quantity: 100,
      amount: 100_000,
      date: '2026-11-10',
    });
    expect(archivedRes.status).toBe(422);
    expect(invWallet.id).toBeTruthy();
  });

  it('another user asset -> 404; hidden asset refused on create (422) but allowed when editing same asset (200)', async () => {
    const { sid: sidA, invWallet: walletA, btc: btcA } = await setupInvestmentFixture('u-trade-3a');
    const { btc: btcB } = await setupInvestmentFixture('u-trade-3b');

    const otherAssetRes = await createEntry(sidA, {
      type: 'buy',
      walletId: walletA.id,
      assetId: btcB.id,
      quantity: 100,
      amount: 100_000,
      date: '2026-11-10',
    });
    expect(otherAssetRes.status).toBe(404);

    const created = (
      await json<EntriesResponse>(
        await createEntry(sidA, {
          type: 'buy',
          walletId: walletA.id,
          assetId: btcA.id,
          quantity: 1_000,
          amount: 1_000_000,
          date: '2026-11-10',
        }),
      )
    ).entries[0]!;

    const ethA = (
      await json<{ asset: AssetView }>(
        await createAsset(sidA, {
          name: 'Ethereum',
          unit: 'ETH',
          groupName: 'Crypto',
          decimals: 8,
        }),
      )
    ).asset;

    await patchAsset(btcA.id, sidA, { hidden: true });
    await patchAsset(ethA.id, sidA, { hidden: true });

    const createHiddenRes = await createEntry(sidA, {
      type: 'buy',
      walletId: walletA.id,
      assetId: btcA.id,
      quantity: 500,
      amount: 500_000,
      date: '2026-11-11',
    });
    expect(createHiddenRes.status).toBe(422);

    const editSameHiddenRes = await patchEntry(created.id, sidA, {
      type: 'buy',
      walletId: walletA.id,
      assetId: btcA.id,
      quantity: 2_000,
      amount: 2_000_000,
      date: '2026-11-10',
    });
    expect(editSameHiddenRes.status).toBe(200);

    const editOtherHiddenRes = await patchEntry(created.id, sidA, {
      type: 'buy',
      walletId: walletA.id,
      assetId: ethA.id,
      quantity: 2_000,
      amount: 2_000_000,
      date: '2026-11-10',
    });
    expect(editOtherHiddenRes.status).toBe(422);
  });

  it('rejects non-integer quantity, quantity <= 0, quantity > 10^15, and invalid cash amount', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-4');

    for (const badQty of [0, -5, 1.5, 10 ** 15 + 1, '100']) {
      const res = await createEntry(sid, {
        type: 'buy',
        walletId: invWallet.id,
        assetId: btc.id,
        quantity: badQty,
        amount: 100_000,
        date: '2026-11-10',
      });
      expect(res.status).toBe(422);
    }

    const badAmount = await createEntry(sid, {
      type: 'buy',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 100,
      amount: 0,
      date: '2026-11-10',
    });
    expect(badAmount.status).toBe(422);
  });

  it('sell above held quantity -> 422 OVERSELL with details.{assetId, date} and writes nothing', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-5');

    await createEntry(sid, {
      type: 'buy',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 1_000,
      amount: 1_000_000,
      date: '2026-11-10',
    });

    const oversellRes = await createEntry(sid, {
      type: 'sell',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 1_001,
      amount: 1_200_000,
      date: '2026-11-12',
    });
    expect(oversellRes.status).toBe(422);
    const errBody = await json<{ error: { code: string; details: { assetId: string; date: string } } }>(
      oversellRes,
    );
    expect(errBody.error.code).toBe('OVERSELL');
    expect(errBody.error.details).toEqual({ assetId: btc.id, date: '2026-11-12' });

    const countRow = await env.DB.prepare('SELECT count(*) AS n FROM personal_transactions WHERE wallet_id = ?')
      .bind(invWallet.id)
      .first<{ n: number }>();
    expect(countRow?.n).toBe(1);
  });

  it('deleting a buy behind a later sell -> 422 OVERSELL and nothing deleted', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-6');

    const buy = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'buy',
          walletId: invWallet.id,
          assetId: btc.id,
          quantity: 1_000,
          amount: 1_000_000,
          date: '2026-11-10',
        }),
      )
    ).entries[0]!;

    await createEntry(sid, {
      type: 'sell',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 600,
      amount: 700_000,
      date: '2026-11-12',
    });

    const delRes = await deleteEntry(buy.id, sid);
    expect(delRes.status).toBe(422);
    const errBody = await json<{ error: { code: string; details: { assetId: string; date: string } } }>(
      delRes,
    );
    expect(errBody.error.code).toBe('OVERSELL');
    expect(errBody.error.details).toEqual({ assetId: btc.id, date: '2026-11-12' });

    const stillThere = await env.DB.prepare('SELECT id FROM personal_transactions WHERE id = ?')
      .bind(buy.id)
      .first();
    expect(stillThere).toBeTruthy();
  });

  it('editing buy quantity below later sell -> 422 OVERSELL; moving buy to another investment wallet checks both wallets; changing type -> 422', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-7');
    const invWallet2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Đầu tư 2',
          currency: 'VND',
          kind: 'investment',
          startAmount: 10_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const buy = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'buy',
          walletId: invWallet.id,
          assetId: btc.id,
          quantity: 1_000,
          amount: 1_000_000,
          date: '2026-11-10',
        }),
      )
    ).entries[0]!;

    await createEntry(sid, {
      type: 'sell',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 800,
      amount: 900_000,
      date: '2026-11-12',
    });

    const shrinkRes = await patchEntry(buy.id, sid, {
      type: 'buy',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 700,
      amount: 700_000,
      date: '2026-11-10',
    });
    expect(shrinkRes.status).toBe(422);
    const shrinkErr = await json<{ error: { code: string } }>(shrinkRes);
    expect(shrinkErr.error.code).toBe('OVERSELL');

    const moveRes = await patchEntry(buy.id, sid, {
      type: 'buy',
      walletId: invWallet2.id,
      assetId: btc.id,
      quantity: 1_000,
      amount: 1_000_000,
      date: '2026-11-10',
    });
    expect(moveRes.status).toBe(422);
    const moveErr = await json<{ error: { code: string } }>(moveRes);
    expect(moveErr.error.code).toBe('OVERSELL');

    // A separate buy in wallet 1 with no sell can move to wallet 2
    const freeBuy = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'buy',
          walletId: invWallet.id,
          assetId: btc.id,
          quantity: 500,
          amount: 500_000,
          date: '2026-11-11',
        }),
      )
    ).entries[0]!;

    const moveOk = await patchEntry(freeBuy.id, sid, {
      type: 'buy',
      walletId: invWallet2.id,
      assetId: btc.id,
      quantity: 500,
      amount: 500_000,
      date: '2026-11-11',
    });
    expect(moveOk.status).toBe(200);
    expect((await json<EntriesResponse>(moveOk)).entries[0]?.walletId).toBe(invWallet2.id);

    // Changing trade into expense -> 422
    const changeTypeRes = await patchEntry(freeBuy.id, sid, {
      type: 'expense',
      walletId: invWallet2.id,
      amount: 500_000,
      categoryId: 'any',
      date: '2026-11-11',
    });
    expect(changeTypeRes.status).toBe(422);
  });

  it('restoring a deleted sell that no longer fits -> 422 OVERSELL; restoring valid sell -> 200', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-8');

    const buy = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'buy',
          walletId: invWallet.id,
          assetId: btc.id,
          quantity: 1_000,
          amount: 1_000_000,
          date: '2026-11-10',
        }),
      )
    ).entries[0]!;

    const sell = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'sell',
          walletId: invWallet.id,
          assetId: btc.id,
          quantity: 600,
          amount: 700_000,
          date: '2026-11-12',
        }),
      )
    ).entries[0]!;

    const delSell = await deleteEntry(sell.id, sid);
    expect(delSell.status).toBe(200);
    const deletedView = (await json<EntriesResponse>(delSell)).entries[0]!;
    expect(deletedView.assetId).toBe(btc.id);
    expect(deletedView.quantity).toBe(600);

    // Delete the buy now that the sell is gone
    const delBuy = await deleteEntry(buy.id, sid);
    expect(delBuy.status).toBe(200);

    // Restoring the sell without the buy -> 422 OVERSELL
    const badRestore = await restoreEntries(sid, { entries: [deletedView] });
    expect(badRestore.status).toBe(422);
    const err = await json<{ error: { code: string; details: { assetId: string; date: string } } }>(
      badRestore,
    );
    expect(err.error.code).toBe('OVERSELL');
    expect(err.error.details).toEqual({ assetId: btc.id, date: '2026-11-12' });

    // Restore buy, then restore sell -> 200
    const restoreBuy = await restoreEntries(sid, {
      entries: [(await json<EntriesResponse>(delBuy)).entries[0]!],
    });
    expect(restoreBuy.status).toBe(200);

    const restoreSell = await restoreEntries(sid, { entries: [deletedView] });
    expect(restoreSell.status).toBe(200);
    expect((await json<EntriesResponse>(restoreSell)).entries[0]?.quantity).toBe(600);
  });

  it('PATCHing wallet startDate past a buy whose sell stays after it -> 422 OVERSELL', async () => {
    const { sid, invWallet, btc } = await setupInvestmentFixture('u-trade-9');

    await createEntry(sid, {
      type: 'buy',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 1_000,
      amount: 1_000_000,
      date: '2026-11-05',
    });
    await createEntry(sid, {
      type: 'sell',
      walletId: invWallet.id,
      assetId: btc.id,
      quantity: 500,
      amount: 600_000,
      date: '2026-11-15',
    });

    const patchRes = await patchWallet(invWallet.id, sid, { startDate: '2026-11-10' });
    expect(patchRes.status).toBe(422);
    const err = await json<{ error: { code: string; details: { assetId: string; date: string } } }>(
      patchRes,
    );
    expect(err.error.code).toBe('OVERSELL');
    expect(err.error.details).toEqual({ assetId: btc.id, date: '2026-11-15' });

    const row = await env.DB.prepare('SELECT start_date FROM personal_wallets WHERE id = ?')
      .bind(invWallet.id)
      .first<{ start_date: string }>();
    expect(row?.start_date).toBe('2026-11-01');
  });

  it('enforces 401/403/404 guards for trade routes and keeps create query count <= 50', async () => {
    const { sid: sidA, invWallet: walletA, btc: btcA } = await setupInvestmentFixture('u-trade-guard-a');
    const { sid: sidB, invWallet: walletB, btc: btcB } = await setupInvestmentFixture('u-trade-guard-b');

    const buyA = (
      await json<EntriesResponse>(
        await createEntry(sidA, {
          type: 'buy',
          walletId: walletA.id,
          assetId: btcA.id,
          quantity: 1_000,
          amount: 1_000_000,
          date: '2026-11-10',
        }),
      )
    ).entries[0]!;

    // 401 signed-out
    expect(
      (
        await createEntry(null, {
          type: 'buy',
          walletId: walletA.id,
          assetId: btcA.id,
          quantity: 100,
          amount: 100_000,
          date: '2026-11-10',
        })
      ).status,
    ).toBe(401);
    expect((await patchEntry(buyA.id, null, { ...buyA, quantity: 200 })).status).toBe(401);
    expect((await deleteEntry(buyA.id, null)).status).toBe(401);
    expect((await restoreEntries(null, { entries: [buyA] })).status).toBe(401);

    // 403 switch-off
    const sidOff = await memberSid('u-trade-off', 'Off');
    await switchOn('u-trade-off', 0);
    expect(
      (
        await createEntry(sidOff, {
          type: 'buy',
          walletId: walletA.id,
          assetId: btcA.id,
          quantity: 100,
          amount: 100_000,
          date: '2026-11-10',
        })
      ).status,
    ).toBe(403);
    expect((await patchEntry(buyA.id, sidOff, { ...buyA, quantity: 200 })).status).toBe(403);
    expect((await deleteEntry(buyA.id, sidOff)).status).toBe(403);
    expect((await restoreEntries(sidOff, { entries: [buyA] })).status).toBe(403);

    // 404 cross-account
    expect(
      (
        await createEntry(sidB, {
          type: 'buy',
          walletId: walletA.id,
          assetId: btcB.id,
          quantity: 100,
          amount: 100_000,
          date: '2026-11-10',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await createEntry(sidB, {
          type: 'buy',
          walletId: walletB.id,
          assetId: btcA.id,
          quantity: 100,
          amount: 100_000,
          date: '2026-11-10',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await patchEntry(buyA.id, sidB, {
          type: 'buy',
          walletId: walletB.id,
          assetId: btcB.id,
          quantity: 100,
          amount: 100_000,
          date: '2026-11-10',
        })
      ).status,
    ).toBe(404);
    expect((await deleteEntry(buyA.id, sidB)).status).toBe(404);
    expect((await restoreEntries(sidB, { entries: [buyA] })).status).toBe(404);

    // Query count <= 50 for create
    const counted = countingEnv();
    const res = await app.request(
      '/api/me/personal/transactions',
      {
        method: 'POST',
        headers: {
          Cookie: `sid=${sidA}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'buy',
          walletId: walletA.id,
          assetId: btcA.id,
          quantity: 500,
          amount: 500_000,
          date: '2026-11-11',
          tags: ['t1', 't2'],
        }),
      },
      counted.env,
    );
    expect(res.status).toBe(201);
    expect(counted.counter.queries).toBeLessThanOrEqual(50);
  });
});
