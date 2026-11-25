import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntriesResponse,
  TagView,
  WalletDetailResponse,
  WalletDetailsResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn, seedLegacyStarters } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getWallets = (sid: string | null) =>
  call('/api/me/personal/wallets', sid ? as(sid) : {});

const patchWallet = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/wallets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const deleteWallet = (id: string, sid: string | null) =>
  call(`/api/me/personal/wallets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: sid ? { Cookie: `sid=${sid}` } : {},
  });

const getCategories = (sid: string | null) =>
  call('/api/me/personal/categories', sid ? as(sid) : {});

const patchCategory = (id: string, sid: string | null, body: unknown) =>
  postJson(`/api/me/personal/categories/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const getTags = (sid: string | null) =>
  call('/api/me/personal/tags', sid ? as(sid) : {});

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

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal entries — expense, income, transfer, edit, delete, restore', () => {
  it('expense with tags and a time is stored and returned; the wallet balance drops', async () => {
    const sid = await memberSid('u-ent-1', 'Ent1');
    await switchOn('u-ent-1');
    await seedLegacyStarters('u-ent-1');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví chính', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

    const res = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 65_000,
      categoryId: food.id,
      date: '2026-11-16',
      time: '12:30',
      note: '  Phở bò tái  ',
      tags: ['Lunch', '  lunch ', 'HaNoi'],
    });
    expect(res.status).toBe(201);
    const body = await json<EntriesResponse>(res);
    expect(body.entries).toHaveLength(1);
    const entry = body.entries[0]!;
    expect(entry).toMatchObject({
      walletId: wallet.id,
      type: 'expense',
      amount: 65_000,
      currency: 'VND',
      categoryId: food.id,
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-16',
      time: '12:30',
      note: 'Phở bò tái',
      tags: ['Lunch', 'HaNoi'],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
    });

    // Existing tag reused with original casing when a second entry uses different case
    const res2 = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 35_000,
      categoryId: food.id,
      date: '2026-11-16',
      note: '   ',
      tags: ['hanoi'],
    });
    expect(res2.status).toBe(201);
    const entry2 = (await json<EntriesResponse>(res2)).entries[0]!;
    expect(entry2.note).toBeNull();
    expect(entry2.tags).toEqual(['HaNoi']);

    const wallets = (await json<WalletDetailsResponse>(await getWallets(sid))).wallets;
    expect(wallets[0]?.balance).toBe(400_000);
    expect(wallets[0]?.entryCount).toBe(2);

    const tagList = (await json<{ tags: TagView[] }>(await getTags(sid))).tags;
    expect(tagList).toEqual([
      { id: expect.any(String), name: 'HaNoi', useCount: 2 },
      { id: expect.any(String), name: 'Lunch', useCount: 1 },
    ]);
  });

  it('income in a USDT wallet with 12,34 USDT (1234) is accepted; 1.5 is 422', async () => {
    const sid = await memberSid('u-ent-usdt', 'EntUsdt');
    await switchOn('u-ent-usdt');
    await seedLegacyStarters('u-ent-usdt');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Binance USDT',
          currency: 'USDT',
          kind: 'investment',
          startAmount: 0,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const interest = cats.find((c) => c.type === 'income' && c.name === 'Lãi')!;

    const badFloat = await createEntry(sid, {
      type: 'income',
      walletId: wallet.id,
      amount: 1.5,
      categoryId: interest.id,
      date: '2026-11-16',
    });
    expect(badFloat.status).toBe(422);

    const badOverMax = await createEntry(sid, {
      type: 'income',
      walletId: wallet.id,
      amount: 10_000_000_001,
      categoryId: interest.id,
      date: '2026-11-16',
    });
    expect(badOverMax.status).toBe(422);

    const okRes = await createEntry(sid, {
      type: 'income',
      walletId: wallet.id,
      amount: 1234,
      categoryId: interest.id,
      date: '2026-11-16',
    });
    expect(okRes.status).toBe(201);
    const { entries } = await json<EntriesResponse>(okRes);
    expect(entries[0]).toMatchObject({
      walletId: wallet.id,
      type: 'income',
      amount: 1234,
      currency: 'USDT',
      categoryId: interest.id,
      excludeFromReports: false,
    });

    const wallets = (await json<WalletDetailsResponse>(await getWallets(sid))).wallets;
    expect(wallets[0]?.balance).toBe(1234);
  });

  it('an expense with an income category is 422; a hidden category is 422', async () => {
    const sid = await memberSid('u-ent-cat', 'EntCat');
    await switchOn('u-ent-cat');
    await seedLegacyStarters('u-ent-cat');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const salary = cats.find((c) => c.type === 'income' && c.name === 'Lương')!;
    const shopping = cats.find((c) => c.type === 'expense' && c.name === 'Mua sắm')!;

    const wrongType = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 50_000,
      categoryId: salary.id,
      date: '2026-11-16',
    });
    expect(wrongType.status).toBe(422);

    await patchCategory(shopping.id, sid, { hidden: true });

    const hiddenCat = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 50_000,
      categoryId: shopping.id,
      date: '2026-11-16',
    });
    expect(hiddenCat.status).toBe(422);
  });

  it('a VND → USDT transfer needs amountReceived; both sides share transferId and default to excluded', async () => {
    const sid = await memberSid('u-ent-tr-fx', 'EntTrFx');
    await switchOn('u-ent-tr-fx');
    await seedLegacyStarters('u-ent-tr-fx');

    const vndWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'VCB', startAmount: 30_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const usdtWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Binance',
          currency: 'USDT',
          kind: 'investment',
          startAmount: 0,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const missingReceived = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: vndWallet.id,
      toWalletId: usdtWallet.id,
      amountSent: 25_000_000,
      date: '2026-11-16',
    });
    expect(missingReceived.status).toBe(422);

    const okRes = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: vndWallet.id,
      toWalletId: usdtWallet.id,
      amountSent: 25_000_000,
      amountReceived: 100_000, // 1.000,00 USDT
      date: '2026-11-16',
      time: '09:15',
      note: 'Nạp P2P',
      tags: ['Binance'],
    });
    expect(okRes.status).toBe(201);
    const { entries } = await json<EntriesResponse>(okRes);
    expect(entries).toHaveLength(2);
    const [outSide, inSide] = entries;
    expect(outSide?.transferId).toBeTruthy();
    expect(outSide?.transferId).toBe(inSide?.transferId);
    expect(outSide).toMatchObject({
      walletId: vndWallet.id,
      type: 'transfer_out',
      amount: 25_000_000,
      currency: 'VND',
      categoryId: null,
      counterpartWalletId: usdtWallet.id,
      date: '2026-11-16',
      time: '09:15',
      note: 'Nạp P2P',
      tags: ['Binance'],
      excludeFromReports: true,
      source: 'manual',
      beforeStart: false,
    });
    expect(inSide).toMatchObject({
      walletId: usdtWallet.id,
      type: 'transfer_in',
      amount: 100_000,
      currency: 'USDT',
      categoryId: null,
      counterpartWalletId: vndWallet.id,
      date: '2026-11-16',
      time: '09:15',
      note: 'Nạp P2P',
      tags: ['Binance'],
      excludeFromReports: true,
      source: 'manual',
      beforeStart: false,
    });

    const wallets = (await json<WalletDetailsResponse>(await getWallets(sid))).wallets;
    expect(wallets.find((w) => w.id === vndWallet.id)?.balance).toBe(5_000_000);
    expect(wallets.find((w) => w.id === usdtWallet.id)?.balance).toBe(100_000);
    expect(wallets.find((w) => w.id === usdtWallet.id)?.vndValue).toBe(25_000_000);
  });

  it('same-currency transfer with a different amountReceived is 422; from = to is 422', async () => {
    const sid = await memberSid('u-ent-tr-same', 'EntTrSame');
    await switchOn('u-ent-tr-same');
    await seedLegacyStarters('u-ent-tr-same');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const sameWallet = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w1.id,
      amountSent: 100_000,
      date: '2026-11-16',
    });
    expect(sameWallet.status).toBe(422);

    const diffReceived = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 100_000,
      amountReceived: 99_000,
      date: '2026-11-16',
    });
    expect(diffReceived.status).toBe(422);

    const okRes = await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 100_000,
      date: '2026-11-16',
    });
    expect(okRes.status).toBe(201);
    const { entries } = await json<EntriesResponse>(okRes);
    expect(entries[0]?.amount).toBe(100_000);
    expect(entries[1]?.amount).toBe(100_000);
  });

  it('editing the in-side of a transfer rewrites both sides', async () => {
    const sid = await memberSid('u-ent-edit-tr', 'EntEditTr');
    await switchOn('u-ent-edit-tr');
    await seedLegacyStarters('u-ent-edit-tr');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 1', startAmount: 2_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Ví USDT',
          currency: 'USDT',
          kind: 'investment',
          startAmount: 0,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;

    const created = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'transfer',
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountSent: 1_000_000,
        amountReceived: 4000,
        date: '2026-11-15',
        tags: ['old-tag'],
      }),
    );
    const [origOut, origIn] = created.entries;

    const patchRes = await patchEntry(origIn!.id, sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 1_500_000,
      amountReceived: 6000,
      date: '2026-11-16',
      time: '14:00',
      note: 'Updated transfer',
      tags: ['new-tag'],
      excludeFromReports: false,
    });
    expect(patchRes.status).toBe(200);
    const updated = await json<EntriesResponse>(patchRes);
    expect(updated.entries).toHaveLength(2);
    expect(updated.entries[0]).toMatchObject({
      id: origOut!.id,
      walletId: w1.id,
      type: 'transfer_out',
      amount: 1_500_000,
      transferId: origOut!.transferId,
      counterpartWalletId: w2.id,
      date: '2026-11-16',
      time: '14:00',
      note: 'Updated transfer',
      tags: ['new-tag'],
      excludeFromReports: false,
      createdAt: origOut!.createdAt,
    });
    expect(updated.entries[1]).toMatchObject({
      id: origIn!.id,
      walletId: w2.id,
      type: 'transfer_in',
      amount: 6000,
      transferId: origIn!.transferId,
      counterpartWalletId: w1.id,
      date: '2026-11-16',
      time: '14:00',
      note: 'Updated transfer',
      tags: ['new-tag'],
      excludeFromReports: false,
      createdAt: origIn!.createdAt,
    });

    const wallets = (await json<WalletDetailsResponse>(await getWallets(sid))).wallets;
    expect(wallets.find((w) => w.id === w1.id)?.balance).toBe(500_000);
    expect(wallets.find((w) => w.id === w2.id)?.balance).toBe(6000);
  });

  it('turning a transfer into an expense is 422', async () => {
    const sid = await memberSid('u-ent-turn', 'EntTurn');
    await switchOn('u-ent-turn');
    await seedLegacyStarters('u-ent-turn');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const tr = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'transfer',
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountSent: 200_000,
        date: '2026-11-16',
      }),
    );

    const trToExp = await patchEntry(tr.entries[0]!.id, sid, {
      type: 'expense',
      walletId: w1.id,
      amount: 200_000,
      categoryId: food.id,
      date: '2026-11-16',
    });
    expect(trToExp.status).toBe(422);

    const exp = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'expense',
        walletId: w1.id,
        amount: 50_000,
        categoryId: food.id,
        date: '2026-11-16',
      }),
    );

    const expToTr = await patchEntry(exp.entries[0]!.id, sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 50_000,
      date: '2026-11-16',
    });
    expect(expToTr.status).toBe(422);
  });

  it('delete of one transfer side removes both and returns both', async () => {
    const sid = await memberSid('u-ent-del-tr', 'EntDelTr');
    await switchOn('u-ent-del-tr');
    await seedLegacyStarters('u-ent-del-tr');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const created = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'transfer',
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountSent: 300_000,
        date: '2026-11-16',
        tags: ['move', 'saving'],
      }),
    );
    const inSideId = created.entries[1]!.id;

    const delRes = await deleteEntry(inSideId, sid);
    expect(delRes.status).toBe(200);
    const deleted = await json<EntriesResponse>(delRes);
    expect(deleted).toEqual(created);

    const wallets = (await json<WalletDetailsResponse>(await getWallets(sid))).wallets;
    expect(wallets.find((w) => w.id === w1.id)?.balance).toBe(1_000_000);
    expect(wallets.find((w) => w.id === w2.id)?.balance).toBe(500_000);

    const linkCount = await env.DB.prepare('SELECT count(*) as cnt FROM personal_transaction_tags').first<{
      cnt: number;
    }>();
    expect(linkCount?.cnt).toBe(0);
  });

  it('restore puts them back with the same ids and tags; restoring twice is 409', async () => {
    const sid = await memberSid('u-ent-restore', 'EntRestore');
    await switchOn('u-ent-restore');
    await seedLegacyStarters('u-ent-restore');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    // 1. Transfer delete & restore
    const createdTr = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'transfer',
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountSent: 250_000,
        date: '2026-11-16',
        tags: ['transfer-tag'],
      }),
    );
    const deletedTr = await json<EntriesResponse>(await deleteEntry(createdTr.entries[0]!.id, sid));

    const restoreTrRes = await restoreEntries(sid, deletedTr);
    expect(restoreTrRes.ok).toBe(true);
    const restoredTr = await json<EntriesResponse>(restoreTrRes);
    expect(restoredTr).toEqual(createdTr);

    const twiceTrRes = await restoreEntries(sid, deletedTr);
    expect(twiceTrRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(twiceTrRes)).error.code).toBe('ALREADY_HANDLED');

    // 2. Expense with hidden category restores cleanly
    const createdExp = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'expense',
        walletId: w1.id,
        amount: 40_000,
        categoryId: food.id,
        date: '2026-11-16',
        tags: ['dinner'],
      }),
    );
    const deletedExp = await json<EntriesResponse>(await deleteEntry(createdExp.entries[0]!.id, sid));
    await patchCategory(food.id, sid, { hidden: true });

    const restoreExpRes = await restoreEntries(sid, deletedExp);
    expect(restoreExpRes.ok).toBe(true);
    expect(await json<EntriesResponse>(restoreExpRes)).toEqual(createdExp);
  });

  it('restore refuses a transferId still in use', async () => {
    const sid = await memberSid('u-ent-restore-tid', 'EntRestoreTid');
    await switchOn('u-ent-restore-tid');
    await seedLegacyStarters('u-ent-restore-tid');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const createdTr = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'transfer',
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountSent: 200_000,
        date: '2026-11-16',
      }),
    );
    const [outSide, inSide] = createdTr.entries;

    // Fresh row ids, but the transferId is still in use by this user's existing transfer
    const conflictRes = await restoreEntries(sid, {
      entries: [
        { ...outSide!, id: 'fresh-out-id' },
        { ...inSide!, id: 'fresh-in-id' },
      ],
    });
    expect(conflictRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(conflictRes)).error.code).toBe('ALREADY_HANDLED');
  });

  it('restore refuses a pair whose sides disagree', async () => {
    const sid = await memberSid('u-ent-restore-disagree', 'EntRestoreDisagree');
    await switchOn('u-ent-restore-disagree');
    await seedLegacyStarters('u-ent-restore-disagree');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví 2', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const createdTr = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'transfer',
        fromWalletId: w1.id,
        toWalletId: w2.id,
        amountSent: 200_000,
        date: '2026-11-16',
        time: '10:00',
        note: 'Same note',
        tags: ['TagA'],
      }),
    );
    const deletedTr = await json<EntriesResponse>(await deleteEntry(createdTr.entries[0]!.id, sid));
    const [outSide, inSide] = deletedTr.entries as [
      (typeof deletedTr.entries)[0],
      (typeof deletedTr.entries)[0],
    ];

    // Disagree on date
    expect(
      (
        await restoreEntries(sid, {
          entries: [outSide, { ...inSide, date: '2026-11-15' }],
        })
      ).status,
    ).toBe(422);

    // Disagree on time
    expect(
      (
        await restoreEntries(sid, {
          entries: [outSide, { ...inSide, time: '11:00' }],
        })
      ).status,
    ).toBe(422);

    // Disagree on note
    expect(
      (
        await restoreEntries(sid, {
          entries: [outSide, { ...inSide, note: 'Other note' }],
        })
      ).status,
    ).toBe(422);

    // Disagree on tags
    expect(
      (
        await restoreEntries(sid, {
          entries: [outSide, { ...inSide, tags: ['TagB'] }],
        })
      ).status,
    ).toBe(422);

    // Disagree on excludeFromReports
    expect(
      (
        await restoreEntries(sid, {
          entries: [outSide, { ...inSide, excludeFromReports: false }],
        })
      ).status,
    ).toBe(422);

    // Disagree on createdAt
    expect(
      (
        await restoreEntries(sid, {
          entries: [outSide, { ...inSide, createdAt: '2026-11-16T00:00:00.000Z' }],
        })
      ).status,
    ).toBe(422);

    // Invalid ISO createdAt
    expect(
      (
        await restoreEntries(sid, {
          entries: [
            { ...outSide, createdAt: 'not-an-iso-timestamp' },
            { ...inSide, createdAt: 'not-an-iso-timestamp' },
          ],
        })
      ).status,
    ).toBe(422);
  });

  it('restore refuses when the wallet is gone', async () => {
    const sid = await memberSid('u-ent-restore-gone', 'EntRestoreGone');
    await switchOn('u-ent-restore-gone');
    await seedLegacyStarters('u-ent-restore-gone');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví Chính', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví Phụ', startAmount: 200_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const created = await json<EntriesResponse>(
      await createEntry(sid, {
        type: 'expense',
        walletId: w2.id,
        amount: 50_000,
        categoryId: food.id,
        date: '2026-11-16',
      }),
    );
    const deleted = await json<EntriesResponse>(await deleteEntry(created.entries[0]!.id, sid));

    //Archived wallet -> 422
    await patchWallet(w2.id, sid, { archived: true });
    const archivedRes = await restoreEntries(sid, deleted);
    expect(archivedRes.status).toBe(422);

    // Deleted wallet -> 404
    const delWalletRes = await deleteWallet(w2.id, sid);
    expect(delWalletRes.status).toBe(200);

    const goneRes = await restoreEntries(sid, deleted);
    expect(goneRes.status).toBe(404);
    expect((await json<{ error: { code: string } }>(goneRes)).error.code).toBe('NOT_FOUND');

    // Sanity check w1 still exists
    expect(w1.id).toBeTruthy();
  });

  it('an entry dated before the wallet start is stored with beforeStart: false and counts toward balance', async () => {
    const sid = await memberSid('u-ent-before', 'EntBefore');
    await switchOn('u-ent-before');
    await seedLegacyStarters('u-ent-before');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví', startAmount: 500_000, startDate: '2026-11-10' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const res = await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 100_000,
      categoryId: food.id,
      date: '2026-11-05',
    });
    expect(res.status).toBe(201);
    const { entries } = await json<EntriesResponse>(res);
    expect(entries[0]?.beforeStart).toBe(false);

    const wallets = (await json<WalletDetailsResponse>(await getWallets(sid))).wallets;
    expect(wallets[0]?.balance).toBe(400_000);
    expect(wallets[0]?.entryCount).toBe(1);
  });

  it('a 201-character note, 11 tags or a 31-character tag is 422', async () => {
    const sid = await memberSid('u-ent-limits', 'EntLimits');
    await switchOn('u-ent-limits');
    await seedLegacyStarters('u-ent-limits');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Ví', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const base = {
      type: 'expense',
      walletId: wallet.id,
      amount: 10_000,
      categoryId: food.id,
      date: '2026-11-16',
    };

    const longNote = await createEntry(sid, {
      ...base,
      note: 'a'.repeat(201),
    });
    expect(longNote.status).toBe(422);

    const elevenTags = await createEntry(sid, {
      ...base,
      tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
    });
    expect(elevenTags.status).toBe(422);

    const longTag = await createEntry(sid, {
      ...base,
      tags: ['t'.repeat(31)],
    });
    expect(longTag.status).toBe(422);

    const emptyTag = await createEntry(sid, {
      ...base,
      tags: ['   '],
    });
    expect(emptyTag.status).toBe(422);
  });

  it("another account: POST with this account's walletId or categoryId is 404; PATCH/DELETE/restore of this account's entries are 404", async () => {
    const sid1 = await memberSid('u-ent-own-1', 'Owner1');
    const sid2 = await memberSid('u-ent-own-2', 'Owner2');
    await switchOn('u-ent-own-1');
    await seedLegacyStarters('u-ent-own-1');
    await switchOn('u-ent-own-2');
    await seedLegacyStarters('u-ent-own-2');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid1, { name: 'Ví 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats1 = (await json<CategoriesResponse>(await getCategories(sid1))).categories;
    const food1 = cats1.find((c) => c.type === 'expense')!;

    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid2, { name: 'Ví 2', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats2 = (await json<CategoriesResponse>(await getCategories(sid2))).categories;
    const food2 = cats2.find((c) => c.type === 'expense')!;

    // Account 2 POST with account 1's walletId -> 404
    const postForeignWallet = await createEntry(sid2, {
      type: 'expense',
      walletId: w1.id,
      amount: 20_000,
      categoryId: food2.id,
      date: '2026-11-16',
    });
    expect(postForeignWallet.status).toBe(404);

    // Account 2 POST with account 1's categoryId -> 404
    const postForeignCat = await createEntry(sid2, {
      type: 'expense',
      walletId: w2.id,
      amount: 20_000,
      categoryId: food1.id,
      date: '2026-11-16',
    });
    expect(postForeignCat.status).toBe(404);

    // Account 1 creates an entry
    const created1 = await json<EntriesResponse>(
      await createEntry(sid1, {
        type: 'expense',
        walletId: w1.id,
        amount: 50_000,
        categoryId: food1.id,
        date: '2026-11-16',
      }),
    );
    const entry1 = created1.entries[0]!;

    // Account 2 PATCH / DELETE / restore of account 1's entry -> 404
    const patchForeign = await patchEntry(entry1.id, sid2, {
      type: 'expense',
      walletId: w2.id,
      amount: 99_000,
      categoryId: food2.id,
      date: '2026-11-16',
    });
    expect(patchForeign.status).toBe(404);

    const delForeign = await deleteEntry(entry1.id, sid2);
    expect(delForeign.status).toBe(404);

    const restoreForeign = await restoreEntries(sid2, created1);
    expect(restoreForeign.status).toBe(404);
  });

  it('switch off: 403 on all four routes', async () => {
    const sid = await memberSid('u-ent-off', 'EntOff');
    await switchOn('u-ent-off', 0);
    await seedLegacyStarters('u-ent-off');

    expect(
      (
        await createEntry(sid, {
          type: 'expense',
          walletId: 'w',
          amount: 10_000,
          categoryId: 'c',
          date: '2026-11-16',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await patchEntry('tx-1', sid, {
          type: 'expense',
          walletId: 'w',
          amount: 10_000,
          categoryId: 'c',
          date: '2026-11-16',
        })
      ).status,
    ).toBe(403);
    expect((await deleteEntry('tx-1', sid)).status).toBe(403);
    expect((await restoreEntries(sid, { entries: [] })).status).toBe(403);
  });
});
