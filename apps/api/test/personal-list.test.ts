import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  CategoryView,
  EntriesResponse,
  ListResponse,
  PersonalSummary,
  TagView,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getList = (sid: string | null, query = '') =>
  call(`/api/me/personal/transactions${query}`, sid ? as(sid) : {});

const getSummary = (sid: string | null, query = '') =>
  call(`/api/me/personal/summary${query}`, sid ? as(sid) : {});

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const getTags = (sid: string) => call('/api/me/personal/tags', as(sid));

const createCategory = (sid: string, body: unknown) =>
  postJson('/api/me/personal/categories', sid, body);

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const patchWallet = (id: string, sid: string, body: unknown) =>
  postJson(`/api/me/personal/wallets/${encodeURIComponent(id)}`, sid, body, 'PATCH');

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal transaction list, quick expenses, and summary', () => {
  it('month list is newest first and totals skip excluded rows', async () => {
    const sid = await memberSid('u-list-1', 'List1');
    await switchOn('u-list-1');

    const wallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;
    const salary = cats.find((c) => c.type === 'income')!;

    // Same date, one with time null, one with time 09:00, one with time 14:00, and an older date
    const eOld = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 50_000,
          categoryId: food.id,
          date: '2026-11-05',
          time: '20:00',
          note: 'Old',
        }),
      )
    ).entries[0]!;

    const eNoTime = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 100_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'No time',
        }),
      )
    ).entries[0]!;

    const eMorning = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'income',
          walletId: wallet.id,
          amount: 500_000,
          categoryId: salary.id,
          date: '2026-11-10',
          time: '09:00',
          note: 'Morning',
        }),
      )
    ).entries[0]!;

    const eAfternoon = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: wallet.id,
          amount: 200_000,
          categoryId: food.id,
          date: '2026-11-10',
          time: '14:00',
          note: 'Excluded',
          excludeFromReports: true,
        }),
      )
    ).entries[0]!;

    // Outside month — should not appear
    await createEntry(sid, {
      type: 'expense',
      walletId: wallet.id,
      amount: 999_000,
      categoryId: food.id,
      date: '2026-10-31',
      note: 'Oct',
    });

    const res = await getList(sid, '?month=2026-11');
    expect(res.status).toBe(200);
    const body = await json<ListResponse>(res);
    expect(body.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      eAfternoon.id,
      eMorning.id,
      eNoTime.id,
      eOld.id,
    ]);
    expect(body.totals).toEqual([{ currency: 'VND', spent: 150_000, income: 500_000 }]);
  });

  it('a transfer counts in totals only when its switch is turned off', async () => {
    const sid = await memberSid('u-list-2', 'List2');
    await switchOn('u-list-2');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'VND 1', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'VND 2', startAmount: 0, startDate: '2026-11-01' }),
      )
    ).wallet;

    // Default transfer: excludeFromReports = true
    await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 200_000,
      date: '2026-11-10',
      note: 'Excluded transfer',
    });

    const list1 = await json<ListResponse>(await getList(sid, '?month=2026-11'));
    expect(list1.rows).toHaveLength(2);
    expect(list1.totals).toEqual([]);

    // Transfer with excludeFromReports = false
    await createEntry(sid, {
      type: 'transfer',
      fromWalletId: w1.id,
      toWalletId: w2.id,
      amountSent: 150_000,
      date: '2026-11-11',
      note: 'Counted transfer',
      excludeFromReports: false,
    });

    const list2 = await json<ListResponse>(await getList(sid, '?month=2026-11'));
    expect(list2.rows).toHaveLength(4);
    expect(list2.totals).toEqual([{ currency: 'VND', spent: 150_000, income: 150_000 }]);

    // Filtering by type=transfer on a single wallet still preserves counterpartWalletId
    const w1Transfers = await json<ListResponse>(
      await getList(sid, `?month=2026-11&walletId=${encodeURIComponent(w1.id)}&type=transfer`),
    );
    expect(w1Transfers.rows).toHaveLength(2);
    for (const r of w1Transfers.rows) {
      expect(r.kind).toBe('entry');
      if (r.kind === 'entry') {
        expect(r.entry.counterpartWalletId).toBe(w2.id);
      }
    }
  });

  it('filters: wallet, category with subs, tag, type, date range, search "phở" matches "Phở bò" but "%" matches only a literal %', async () => {
    const sid = await memberSid('u-list-3', 'List3');
    await switchOn('u-list-3');

    const w1 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const w2 = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Bank', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
    const otherCat = cats.find((c) => c.type === 'expense' && c.id !== food.id)!;
    const salary = cats.find((c) => c.type === 'income')!;

    const subCatRes = await createCategory(sid, {
      parentId: food.id,
      type: 'expense',
      name: 'Cà phê',
      icon: 'coffee',
    });
    expect(subCatRes.status).toBe(201);
    const subCat = (await json<{ category: CategoryView }>(subCatRes)).category;

    const ePho = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w1.id,
          amount: 55_000,
          categoryId: food.id,
          date: '2026-11-10',
          note: 'Phở bò',
          tags: ['Lunch'],
        }),
      )
    ).entries[0]!;

    const eCoffee = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w2.id,
          amount: 45_000,
          categoryId: subCat.id,
          date: '2026-11-12',
          note: '50% off coffee',
          tags: ['Work'],
        }),
      )
    ).entries[0]!;

    const eOther = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w2.id,
          amount: 30_000,
          categoryId: otherCat.id,
          date: '2026-11-15',
          note: 'Bus ticket',
        }),
      )
    ).entries[0]!;

    const eIncome = (
      await json<EntriesResponse>(
        await createEntry(sid, {
          type: 'income',
          walletId: w1.id,
          amount: 2_000_000,
          categoryId: salary.id,
          date: '2026-11-18',
          note: 'Bonus',
        }),
      )
    ).entries[0]!;

    // Wallet filter
    const byWallet = await json<ListResponse>(
      await getList(sid, `?month=2026-11&walletId=${encodeURIComponent(w1.id)}`),
    );
    expect(byWallet.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      eIncome.id,
      ePho.id,
    ]);

    // Category with subs
    const byCat = await json<ListResponse>(
      await getList(sid, `?month=2026-11&categoryId=${encodeURIComponent(food.id)}`),
    );
    expect(byCat.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      eCoffee.id,
      ePho.id,
    ]);

    // Tag filter
    const tags = await json<{ tags: TagView[] }>(await getTags(sid));
    const lunchTag = tags.tags.find((t) => t.name === 'Lunch')!;
    const byTag = await json<ListResponse>(
      await getList(sid, `?month=2026-11&tagId=${encodeURIComponent(lunchTag.id)}`),
    );
    expect(byTag.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([ePho.id]);

    // Type filter
    const byType = await json<ListResponse>(await getList(sid, '?month=2026-11&type=income'));
    expect(byType.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([eIncome.id]);

    // Date range
    const byRange = await json<ListResponse>(
      await getList(sid, '?from=2026-11-11&to=2026-11-16'),
    );
    expect(byRange.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      eOther.id,
      eCoffee.id,
    ]);

    // Search "phở" matches "Phở bò"
    const byPho = await json<ListResponse>(
      await getList(sid, `?month=2026-11&q=${encodeURIComponent('phở')}`),
    );
    expect(byPho.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([ePho.id]);

    // Search "%" matches only literal "%"
    const byPct = await json<ListResponse>(
      await getList(sid, `?month=2026-11&q=${encodeURIComponent('%')}`),
    );
    expect(byPct.rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([eCoffee.id]);
  });

  it('quick expenses show as person rows with the owner share, on the default wallet, and count in totals', async () => {
    const sid = await memberSid('u-list-4', 'List4');
    await switchOn('u-list-4');

    const defaultWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;

    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;
    await createEntry(sid, {
      type: 'expense',
      walletId: defaultWallet.id,
      amount: 40_000,
      categoryId: food.id,
      date: '2026-11-10',
      note: 'Manual coffee',
    });

    // Seed quick expense through existing routes
    const ledger = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sid)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sid, { name: 'Lan' }),
    );
    const expRes = await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
      description: 'Bún chả',
      amount: 120_000,
      spentOn: '2026-11-12',
      payerId: ledger.ownerPid,
      mode: 'amounts',
      entries: [
        { participantId: ledger.ownerPid, value: 50_000 },
        { participantId: lanPid, value: 70_000 },
      ],
    });
    expect(expRes.status).toBe(201);

    // A quick expense where owner has no share row -> share 0, still listed
    const expNoShare = await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
      description: 'Trả hộ Lan',
      amount: 30_000,
      spentOn: '2026-11-13',
      payerId: ledger.ownerPid,
      mode: 'amounts',
      entries: [{ participantId: lanPid, value: 30_000 }],
    });
    expect(expNoShare.status).toBe(201);

    const list = await json<ListResponse>(await getList(sid, '?month=2026-11'));
    expect(list.rows).toHaveLength(3);

    const p0 = list.rows[0]!;
    expect(p0).toMatchObject({
      kind: 'person',
      tripId: ledger.tripId,
      date: '2026-11-13',
      share: 0,
      total: 30_000,
      note: 'Trả hộ Lan',
      people: ['Lan'],
      walletId: defaultWallet.id,
      currency: 'VND',
    });

    const p1 = list.rows[1]!;
    expect(p1).toMatchObject({
      kind: 'person',
      tripId: ledger.tripId,
      date: '2026-11-12',
      share: 50_000,
      total: 120_000,
      note: 'Bún chả',
      people: ['Lan'],
      walletId: defaultWallet.id,
      currency: 'VND',
    });

    expect(list.totals).toEqual([{ currency: 'VND', spent: 90_000, income: 0 }]);

    // type=person returns only person rows
    const personOnly = await json<ListResponse>(await getList(sid, '?month=2026-11&type=person'));
    expect(personOnly.rows).toHaveLength(2);
    expect(personOnly.rows.every((r) => r.kind === 'person')).toBe(true);
    expect(personOnly.totals).toEqual([{ currency: 'VND', spent: 50_000, income: 0 }]);
  });

  it('quick expenses are hidden by a category filter and by a non-default wallet filter', async () => {
    const sid = await memberSid('u-list-5', 'List5');
    await switchOn('u-list-5');

    const defaultWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const secondWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Second', startAmount: 500_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const ledger = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sid)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sid, { name: 'Lan' }),
    );
    await postJson(`/api/trips/${ledger.tripId}/expenses`, sid, {
      description: 'Lunch',
      amount: 100_000,
      spentOn: '2026-11-12',
      payerId: ledger.ownerPid,
      mode: 'equal',
      entries: [
        { participantId: ledger.ownerPid, value: 1 },
        { participantId: lanPid, value: 1 },
      ],
    });

    const byCat = await json<ListResponse>(
      await getList(sid, `?month=2026-11&categoryId=${encodeURIComponent(food.id)}`),
    );
    expect(byCat.rows).toEqual([]);

    const byOtherWallet = await json<ListResponse>(
      await getList(sid, `?month=2026-11&walletId=${encodeURIComponent(secondWallet.id)}`),
    );
    expect(byOtherWallet.rows).toEqual([]);

    const byDefaultWallet = await json<ListResponse>(
      await getList(sid, `?month=2026-11&walletId=${encodeURIComponent(defaultWallet.id)}`),
    );
    expect(byDefaultWallet.rows).toHaveLength(1);
    expect(byDefaultWallet.rows[0]!.kind).toBe('person');
  });

  it('from/to more than 366 days apart is 422; no month and no range is 422', async () => {
    const sid = await memberSid('u-list-6', 'List6');
    await switchOn('u-list-6');

    expect((await getList(sid, '')).status).toBe(422);
    expect((await getList(sid, '?month=2026-13')).status).toBe(422);
    expect((await getList(sid, '?from=2025-01-01&to=2026-01-03')).status).toBe(422);
    expect((await getList(sid, '?from=2025-01-01&to=2026-01-02')).status).toBe(200);
    expect((await getSummary(sid, '?month=bad')).status).toBe(422);
  });

  it('summary: VND 5.000.000 + 1.000 USDT bought for 25.000.000 gives totalVnd 30.000.000, approximate, two currency lines', async () => {
    const sid = await memberSid('u-list-7', 'List7');
    await switchOn('u-list-7');

    await addWallet(sid, {
      name: 'VND Main',
      currency: 'VND',
      startAmount: 5_000_000,
      startDate: '2026-11-01',
    });
    await addWallet(sid, {
      name: 'USDT',
      currency: 'USDT',
      kind: 'investment',
      startAmount: 100_000, // 1,000.00 USDT in minor units (2 decimals)
      startCostVnd: 25_000_000,
      startDate: '2026-11-01',
    });

    const res = await getSummary(sid, '?month=2026-11');
    expect(res.status).toBe(200);
    const body = await json<PersonalSummary>(res);
    expect(body).toEqual({
      totalVnd: 30_000_000,
      approximate: true,
      perCurrency: [
        { currency: 'VND', balance: 5_000_000 },
        { currency: 'USDT', balance: 100_000 },
      ],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    });

    // Default month when ?month is omitted uses current UTC month
    const defaultRes = await getSummary(sid);
    expect(defaultRes.status).toBe(200);
    const defaultBody = await json<PersonalSummary>(defaultRes);
    expect(defaultBody.month).toBe(new Date().toISOString().slice(0, 7));
  });

  it('summary leaves archived wallets out', async () => {
    const sid = await memberSid('u-list-8', 'List8');
    await switchOn('u-list-8');

    await addWallet(sid, {
      name: 'VND Main',
      currency: 'VND',
      startAmount: 5_000_000,
      startDate: '2026-11-01',
    });
    const archivedWallet = (
      await json<WalletDetailResponse>(
        await addWallet(sid, {
          name: 'Old Savings',
          currency: 'VND',
          startAmount: 9_000_000,
          startDate: '2026-11-01',
        }),
      )
    ).wallet;
    await patchWallet(archivedWallet.id, sid, { archived: true });

    const body = await json<PersonalSummary>(await getSummary(sid, '?month=2026-11'));
    expect(body.totalVnd).toBe(5_000_000);
    expect(body.perCurrency).toEqual([{ currency: 'VND', balance: 5_000_000 }]);
  });

  it('another account sees only its own rows, never this accounts entries or quick expenses', async () => {
    const sidA = await memberSid('u-list-9a', 'UserA');
    const sidB = await memberSid('u-list-9b', 'UserB');
    await switchOn('u-list-9a');
    await switchOn('u-list-9b');

    const wA = (
      await json<WalletDetailResponse>(
        await addWallet(sidA, { name: 'A Main', startAmount: 1_000_000, startDate: '2026-11-01' }),
      )
    ).wallet;
    await addWallet(sidB, { name: 'B Main', startAmount: 500_000, startDate: '2026-11-01' });

    const catsA = (await json<CategoriesResponse>(await getCategories(sidA))).categories;
    const foodA = catsA.find((c) => c.type === 'expense')!;
    await createEntry(sidA, {
      type: 'expense',
      walletId: wA.id,
      amount: 100_000,
      categoryId: foodA.id,
      date: '2026-11-10',
      note: 'Secret A',
    });

    const ledgerA = await json<{ tripId: string; ownerPid: string }>(
      await call('/api/me/ledger', as(sidA)),
    );
    const { participantId: lanPid } = await json<{ participantId: string }>(
      await postJson('/api/me/ledger/people', sidA, { name: 'Lan' }),
    );
    await postJson(`/api/trips/${ledgerA.tripId}/expenses`, sidA, {
      description: 'Quick A',
      amount: 80_000,
      spentOn: '2026-11-11',
      payerId: ledgerA.ownerPid,
      mode: 'equal',
      entries: [
        { participantId: ledgerA.ownerPid, value: 1 },
        { participantId: lanPid, value: 1 },
      ],
    });

    const listB = await json<ListResponse>(await getList(sidB, '?month=2026-11'));
    expect(listB.rows).toEqual([]);
    expect(listB.totals).toEqual([]);

    const summaryB = await json<PersonalSummary>(await getSummary(sidB, '?month=2026-11'));
    expect(summaryB.totalVnd).toBe(500_000);
    expect(summaryB.spent).toEqual([]);
  });

  it('switch off: 403 on list and summary', async () => {
    const sid = await memberSid('u-list-10', 'List10');
    expect((await getList(sid, '?month=2026-11')).status).toBe(403);
    expect((await getSummary(sid, '?month=2026-11')).status).toBe(403);
  });
});
