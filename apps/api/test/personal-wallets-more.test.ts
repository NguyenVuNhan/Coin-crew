import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  PersonalSummary,
  WalletDetailResponse,
  WalletDetailsResponse,
} from '@cc/core';
import { isBeforeStart } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getWallets = (sid: string | null) =>
  call('/api/me/personal/wallets', sid ? as(sid) : {});

const patchWallet = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/wallets/${id}`, sid, body, 'PATCH');

const deleteWallet = (id: string, sid: string | null) =>
  call(`/api/me/personal/wallets/${id}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });

const reorderWallets = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/wallets/reorder', sid, body);

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const getSummary = (sid: string, query = '') =>
  call(`/api/me/personal/summary${query}`, as(sid));

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transactions').run();
});

describe('personal wallets — more wallets, kinds, currencies, archive, reorder, delete', () => {
  it('/wallets/add makes a USDT investment wallet with a negative start', async () => {
    const sid = await memberSid('u-usdt', 'Usdt');
    await switchOn('u-usdt');

    const firstRes = await addWallet(sid, { name: 'Ví chính', startAmount: 1_000_000 });
    expect(firstRes.status).toBe(201);
    const first = (await json<WalletDetailResponse>(firstRes)).wallet;
    expect(first.isDefault).toBe(true);

    const res = await addWallet(sid, {
      name: 'Margin USDT',
      currency: 'USDT',
      kind: 'investment',
      startAmount: -500,
      startCostVnd: 130_000,
    });
    expect(res.status).toBe(201);
    const { wallet } = await json<WalletDetailResponse>(res);
    expect(wallet).toMatchObject({
      currency: 'USDT',
      kind: 'investment',
      startAmount: -500,
      balance: -500,
      isDefault: false,
    });
  });

  it('a non-VND start without startCostVnd is 422, with it the vndValue equals it', async () => {
    const sid = await memberSid('u-fx-cost', 'FxCost');
    await switchOn('u-fx-cost');

    const badRes = await addWallet(sid, {
      name: 'USD Cash',
      currency: 'USD',
      startAmount: 10_000,
    });
    expect(badRes.status).toBe(422);

    const vndWithCost = await addWallet(sid, {
      name: 'VND Bad Cost',
      currency: 'VND',
      startAmount: 100_000,
      startCostVnd: 100_000,
    });
    expect(vndWithCost.status).toBe(422);

    const zeroWithCost = await addWallet(sid, {
      name: 'USD Zero Bad Cost',
      currency: 'USD',
      startAmount: 0,
      startCostVnd: 100_000,
    });
    expect(zeroWithCost.status).toBe(422);

    const okRes = await addWallet(sid, {
      name: 'USD Cash',
      currency: 'USD',
      startAmount: 10_000,
      startCostVnd: 2_540_000,
    });
    expect(okRes.status).toBe(201);
    const { wallet } = await json<WalletDetailResponse>(okRes);
    expect(wallet.startCostVnd).toBe(2_540_000);
    expect(wallet.vndValue).toBe(2_540_000);

    const list = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(list.wallets[0]?.vndValue).toBe(2_540_000);
  });

  it('/wallets/add USDT with startAmount 0 returns the same object GET lists', async () => {
    const sid = await memberSid('u-usdt-zero', 'UsdtZero');
    await switchOn('u-usdt-zero');

    const postRes = await addWallet(sid, {
      name: 'USDT Zero',
      currency: 'USDT',
      kind: 'investment',
      startAmount: 0,
    });
    expect(postRes.status).toBe(201);
    const { wallet } = await json<WalletDetailResponse>(postRes);

    const list = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(list.wallets).toEqual([wallet]);
  });

  it('two parallel /wallets/add for a user with no wallet make one default wallet', async () => {
    const sid = await memberSid('u-parallel', 'Parallel');
    await switchOn('u-parallel');

    const [r1, r2] = await Promise.all([
      addWallet(sid, { name: 'Ví A', startAmount: 100_000 }),
      addWallet(sid, { name: 'Ví B', startAmount: 200_000 }),
    ]);

    expect([r1.status, r2.status]).toContain(201);
    for (const s of [r1.status, r2.status]) {
      expect([201, 409]).toContain(s);
    }

    const list = await json<WalletDetailsResponse>(await getWallets(sid));
    const defaults = list.wallets.filter((w) => w.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it('moving startDate after an entry still counts it in balance and beforeStart is false', async () => {
    const sid = await memberSid('u-startdate', 'StartDate');
    await switchOn('u-startdate');

    const createRes = await addWallet(sid, {
      name: 'Tiền mặt',
      startAmount: 500_000,
      startDate: '2026-11-10',
    });
    expect(createRes.status).toBe(201);
    const created = (await json<WalletDetailResponse>(createRes)).wallet;
    expect(created.balance).toBe(500_000);

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES ('tx-sd-1', 'u-startdate', ?, 'expense', 120000, '2026-11-12', '2026-11-12T10:00:00.000Z', '2026-11-12T10:00:00.000Z')",
    )
      .bind(created.id)
      .run();

    const beforePatch = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(beforePatch.wallets[0]?.balance).toBe(380_000);
    expect(BeforeStartOf('2026-11-12', beforePatch.wallets[0]!.startDate)).toBe(false);

    const patchRes = await patchWallet(created.id, sid, { startDate: '2026-11-13' });
    expect(patchRes.status).toBe(200);
    const patched = (await json<WalletDetailResponse>(patchRes)).wallet;
    expect(patched.startDate).toBe('2026-11-13');
    expect(BeforeStartOf('2026-11-12', patched.startDate)).toBe(false);
    expect(patched.balance).toBe(380_000);
    expect(patched.entryCount).toBe(1);

    const afterPatch = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(afterPatch.wallets[0]?.balance).toBe(380_000);
  });

  it('archiving the default is 409 DEFAULT_WALLET; after making another default it works and the wallet shows archived: true', async () => {
    const sid = await memberSid('u-archive', 'Archive');
    await switchOn('u-archive');

    const w1 = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví 1', startAmount: 100_000 }))).wallet;
    const w2 = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví 2', startAmount: 200_000 }))).wallet;
    expect(w1.isDefault).toBe(true);
    expect(w2.isDefault).toBe(false);

    const badArchive = await patchWallet(w1.id, sid, { archived: true });
    expect(badArchive.status).toBe(409);
    expect((await json<{ error: { code: string } }>(badArchive)).error.code).toBe('DEFAULT_WALLET');

    const makeDefault = await patchWallet(w2.id, sid, { isDefault: true });
    expect(makeDefault.status).toBe(200);
    expect((await json<WalletDetailResponse>(makeDefault)).wallet.isDefault).toBe(true);

    const okArchive = await patchWallet(w1.id, sid, { archived: true });
    expect(okArchive.status).toBe(200);
    const archivedWallet = (await json<WalletDetailResponse>(okArchive)).wallet;
    expect(archivedWallet.archived).toBe(true);
    expect(archivedWallet.isDefault).toBe(false);

    const list = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(list.wallets.find((w) => w.id === w1.id)?.archived).toBe(true);
    expect(list.wallets.find((w) => w.id === w2.id)?.isDefault).toBe(true);
  });

  it('kind cannot change once the wallet has an entry', async () => {
    const sid = await memberSid('u-kind-lock', 'KindLock');
    await switchOn('u-kind-lock');

    const w = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 100_000 }))).wallet;

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES ('tx-k-1', 'u-kind-lock', ?, 'expense', 10000, '2026-11-16', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z')",
    )
      .bind(w.id)
      .run();

    const kindRes = await patchWallet(w.id, sid, { kind: 'investment' });
    expect(kindRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(kindRes)).error.code).toBe('IN_USE');

    const currRes = await patchWallet(w.id, sid, { currency: 'USD', startCostVnd: 100_000 });
    expect(currRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(currRes)).error.code).toBe('IN_USE');
  });

  it('delete refuses a wallet with entries and removes an empty one', async () => {
    const sid = await memberSid('u-delete', 'Delete');
    await switchOn('u-delete');

    const w1 = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví 1', startAmount: 100_000 }))).wallet;
    const w2 = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví 2', startAmount: 200_000 }))).wallet;

    const delDefaultWhileOther = await deleteWallet(w1.id, sid);
    expect(delDefaultWhileOther.status).toBe(409);
    expect((await json<{ error: { code: string } }>(delDefaultWhileOther)).error.code).toBe('DEFAULT_WALLET');

    await env.DB.prepare(
      "INSERT INTO personal_transactions (id, user_id, wallet_id, type, amount, date, created_at, updated_at) VALUES ('tx-del-1', 'u-delete', ?, 'expense', 10000, '2026-11-16', '2026-11-16T00:00:00.000Z', '2026-11-16T00:00:00.000Z')",
    )
      .bind(w2.id)
      .run();

    const delWithEntries = await deleteWallet(w2.id, sid);
    expect(delWithEntries.status).toBe(409);
    expect((await json<{ error: { code: string } }>(delWithEntries)).error.code).toBe('IN_USE');

    await env.DB.prepare("DELETE FROM personal_transactions WHERE id = 'tx-del-1'").run();

    const delEmpty = await deleteWallet(w2.id, sid);
    expect(delEmpty.status).toBe(200);

    const list = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(list.wallets.map((w) => w.id)).toEqual([w1.id]);
  });

  it('reorder with a missing or foreign id is 422; a valid reorder changes the GET order', async () => {
    const sid = await memberSid('u-reorder', 'Reorder');
    await switchOn('u-reorder');

    const w1 = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví 1', startAmount: 100_000 }))).wallet;
    const w2 = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví 2', startAmount: 200_000 }))).wallet;
    const w3 = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví 3', startAmount: 300_000 }))).wallet;

    const sidOther = await memberSid('u-reorder-other', 'Other');
    await switchOn('u-reorder-other');
    const wOther = (await json<WalletDetailResponse>(await addWallet(sidOther, { name: 'Ví Other', startAmount: 50_000 }))).wallet;

    expect((await reorderWallets(sid, { ids: [w1.id, w2.id] })).status).toBe(422);
    expect((await reorderWallets(sid, { ids: [w1.id, w2.id, w3.id, wOther.id] })).status).toBe(422);
    expect((await reorderWallets(sid, { ids: [w1.id, w2.id, wOther.id] })).status).toBe(422);
    expect((await reorderWallets(sid, { ids: [w1.id, w1.id, w2.id] })).status).toBe(422);

    const okRes = await reorderWallets(sid, { ids: [w3.id, w1.id, w2.id] });
    expect(okRes.status).toBe(200);

    const list = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(list.wallets.map((w) => w.id)).toEqual([w3.id, w1.id, w2.id]);
    expect(list.wallets.map((w) => w.sortOrder)).toEqual([0, 1, 2]);
  });

  it('the #112 first-wallet route still refuses a second wallet', async () => {
    const sid = await memberSid('u-first-only', 'FirstOnly');
    await switchOn('u-first-only');

    const first = await postJson('/api/me/personal/wallets', sid, { name: 'Ví 1', startAmount: 100_000 });
    expect(first.status).toBe(201);

    const second = await postJson('/api/me/personal/wallets', sid, { name: 'Ví 2', startAmount: 200_000 });
    expect(second.status).toBe(409);
    expect((await json<{ error: { code: string } }>(second)).error.code).toBe('ALREADY_HANDLED');
  });

  it("another account gets 404 for PATCH, DELETE and reorder with this account's wallet id", async () => {
    const sidOwner = await memberSid('u-owner-w', 'Owner');
    await switchOn('u-owner-w');
    const w = (await json<WalletDetailResponse>(await addWallet(sidOwner, { name: 'Ví Owner', startAmount: 100_000 }))).wallet;

    const sidOther = await memberSid('u-intruder', 'Intruder');
    await switchOn('u-intruder');

    const patchRes = await patchWallet(w.id, sidOther, { name: 'Stolen' });
    expect(patchRes.status).toBe(404);
    expect((await json<{ error: { code: string } }>(patchRes)).error.code).toBe('NOT_FOUND');

    const delRes = await deleteWallet(w.id, sidOther);
    expect(delRes.status).toBe(404);
    expect((await json<{ error: { code: string } }>(delRes)).error.code).toBe('NOT_FOUND');

    const reorderRes = await reorderWallets(sidOther, { ids: [w.id] });
    expect(reorderRes.status).toBe(422);
  });

  it('switch off: 403 on add, PATCH, reorder, DELETE', async () => {
    const sid = await memberSid('u-switchoff', 'SwitchOff');
    await switchOn('u-switchoff', 1);
    const w = (await json<WalletDetailResponse>(await addWallet(sid, { name: 'Ví', startAmount: 100_000 }))).wallet;

    await switchOn('u-switchoff', 0);

    expect((await addWallet(sid, { name: 'Ví 2', startAmount: 50_000 })).status).toBe(403);
    expect((await patchWallet(w.id, sid, { name: 'Đổi tên' })).status).toBe(403);
    expect((await reorderWallets(sid, { ids: [w.id] })).status).toBe(403);
    expect((await deleteWallet(w.id, sid)).status).toBe(403);
  });

  it('JPY wallet with excludeFromReports: true persists option and returns excludeFromReports: true', async () => {
    const sid = await memberSid('u-jpy-excl', 'JpyExcl');
    await switchOn('u-jpy-excl');

    const res = await addWallet(sid, {
      name: 'Yen Wallet',
      currency: 'JPY',
      startAmount: 10_000,
      startCostVnd: 1_700_000,
      excludeFromReports: true,
    });
    expect(res.status).toBe(201);
    const { wallet } = await json<WalletDetailResponse>(res);
    expect(wallet.currency).toBe('JPY');
    expect(wallet.startAmount).toBe(10_000);
    expect(wallet.startCostVnd).toBe(1_700_000);
    expect(wallet.excludeFromReports).toBe(true);

    const list = await json<WalletDetailsResponse>(await getWallets(sid));
    expect(list.wallets[0]).toEqual(wallet);
  });

  it('non-boolean excludeFromReports returns 422 on create and patch', async () => {
    const sid = await memberSid('u-excl-422', 'Excl422');
    await switchOn('u-excl-422');

    const badFirst = await postJson('/api/me/personal/wallets', sid, {
      name: 'Ví 1',
      startAmount: 100_000,
      excludeFromReports: 'yes',
    });
    expect(badFirst.status).toBe(422);

    const badAdd = await addWallet(sid, {
      name: 'Ví 1',
      startAmount: 100_000,
      excludeFromReports: 'yes',
    });
    expect(badAdd.status).toBe(422);

    const ok = await addWallet(sid, { name: 'Ví 1', startAmount: 100_000 });
    expect(ok.status).toBe(201);
    const w = (await json<WalletDetailResponse>(ok)).wallet;
    expect(w.excludeFromReports).toBe(false);

    const badPatch = await patchWallet(w.id, sid, { excludeFromReports: 'yes' });
    expect(badPatch.status).toBe(422);
  });

  it('excludeFromReports wallet stays in summary totalVnd/perCurrency while skipping spent/income, and can toggle back when entryCount > 0', async () => {
    const sid = await memberSid('u-excl-sum', 'ExclSum');
    await switchOn('u-excl-sum');

    const mainWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Ví chính',
          startAmount: 5_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    const exclWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Ví ẩn báo cáo',
          startAmount: 2_000_000,
          startDate: '2026-11-01',
          excludeFromReports: true,
        }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;
    const salary = cats.find((c) => c.type === 'income')!;

    await createEntry(sid, {
      type: 'expense',
      walletId: mainWallet.id,
      amount: 100_000,
      categoryId: food.id,
      date: '2026-11-10',
      note: 'Main expense',
    });
    await createEntry(sid, {
      type: 'expense',
      walletId: exclWallet.id,
      amount: 300_000,
      categoryId: food.id,
      date: '2026-11-11',
      note: 'Excluded wallet expense',
    });
    await createEntry(sid, {
      type: 'income',
      walletId: exclWallet.id,
      amount: 800_000,
      categoryId: salary.id,
      date: '2026-11-12',
      note: 'Excluded wallet income',
    });

    const summaryExcl = await json<PersonalSummary>(await getSummary(sid, '?month=2026-11'));
    // Balances: main = 4_900_000, excl = 2_500_000 -> totalVnd = 7_400_000
    expect(summaryExcl.totalVnd).toBe(7_400_000);
    expect(summaryExcl.perCurrency).toEqual([{ currency: 'VND', balance: 7_400_000 }]);
    expect(summaryExcl.spent).toEqual([{ currency: 'VND', amount: 100_000 }]);
    expect(summaryExcl.income).toEqual([]);

    // Patch excludeFromReports: false on a wallet with entryCount > 0 succeeds
    const patchRes = await patchWallet(exclWallet.id, sid, { excludeFromReports: false });
    expect(patchRes.status).toBe(200);
    const patched = (await json<WalletDetailResponse>(patchRes)).wallet;
    expect(patched.excludeFromReports).toBe(false);
    expect(patched.entryCount).toBe(2);

    const summaryIncl = await json<PersonalSummary>(await getSummary(sid, '?month=2026-11'));
    expect(summaryIncl.totalVnd).toBe(7_400_000);
    expect(summaryIncl.perCurrency).toEqual([{ currency: 'VND', balance: 7_400_000 }]);
    expect(summaryIncl.spent).toEqual([{ currency: 'VND', amount: 400_000 }]);
    expect(summaryIncl.income).toEqual([{ currency: 'VND', amount: 800_000 }]);
  });

  it('another account gets 404 when patching excludeFromReports', async () => {
    const sidOwner = await memberSid('u-excl-owner', 'ExclOwner');
    await switchOn('u-excl-owner');
    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sidOwner, { name: 'Ví Owner', startAmount: 100_000 }),
      )
    ).wallet;

    const sidOther = await memberSid('u-excl-other', 'ExclOther');
    await switchOn('u-excl-other');

    const res = await patchWallet(w.id, sidOther, { excludeFromReports: true });
    expect(res.status).toBe(404);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('NOT_FOUND');
  });
});

function BeforeStartOf(date: string, startDate: string): boolean {
  return isBeforeStart({ date }, { startDate });
}
