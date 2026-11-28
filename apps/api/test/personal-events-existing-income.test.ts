import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  CategoriesResponse,
  EntryView,
  EventSavedResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const createEvent = (sid: string, body: unknown) =>
  postJson('/api/me/personal/events', sid, body);

const applyExisting = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}/existing`, sid, body);

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_event_share_marks').run();
  await env.DB.prepare('DELETE FROM personal_event_groups').run();
  await env.DB.prepare('DELETE FROM personal_events').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal events existing items with income and transfer', () => {
  it('counts and tags an income entry inside the event dates, and excludes transfers', async () => {
    const userId = 'u-ev-existing-income';
    const sid = await memberSid(userId, 'IncomeUser');
    await switchOn(userId);

    const wBank = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Bank', startAmount: 5_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const wCash = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 1_000_000, startDate: '2026-10-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const salary = cats.find((c) => c.type === 'income')!;

    // Income inside event dates -> MUST be counted and tagged
    const incomeEntry = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'income',
          walletId: wBank.id,
          amount: 1_200_000,
          categoryId: salary.id,
          date: '2026-11-11',
          note: 'Refund',
        }),
      )
    ).entries[0]!;

    // Transfer inside event dates -> MUST NOT be counted or tagged
    const transferEntries = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'transfer',
          fromWalletId: wBank.id,
          toWalletId: wCash.id,
          amountSent: 500_000,
          date: '2026-11-11',
          note: 'ATM',
        }),
      )
    ).entries;
    expect(transferEntries.length).toBe(2);

    const createRes = await createEvent(sid, {
      name: 'Đà Lạt',
      start: '2026-11-10',
      end: '2026-11-12',
      groupIds: [],
      today: '2026-11-27',
    });
    expect(createRes.status).toBe(201);

    const saved = await json<EventSavedResponse>(createRes);
    expect(saved.existing.own.count).toBe(1);
    expect(saved.existing.own.totals).toEqual([{ currency: 'VND', amount: 1_200_000 }]);
    expect(saved.existing.ownIds).toEqual([incomeEntry.id]);

    // Even if transfer IDs are also passed to /existing, only income is tagged
    const applyRes = await applyExisting(sid, saved.event.id, {
      tag: true,
      ownIds: [incomeEntry.id, ...transferEntries.map((e) => e.id)],
      shareRootIds: [],
    });
    expect(applyRes.status).toBe(200);
    expect(await json<{ tagged: number }>(applyRes)).toEqual({ tagged: 1 });

    const txTags = await env.DB.prepare(
      'SELECT transaction_id FROM personal_transaction_tags WHERE tag_id = ?',
    )
      .bind(saved.event.tagId)
      .all<{ transaction_id: string }>();
    const taggedIds = txTags.results.map((r) => r.transaction_id);
    expect(taggedIds).toEqual([incomeEntry.id]);
  });
});
