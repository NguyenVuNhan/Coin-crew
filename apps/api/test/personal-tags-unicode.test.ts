import { describe, it, expect } from 'vitest';
import type { CategoriesResponse, EntryView, TagView, EventSavedResponse } from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

async function setupBook(sid: string, userId: string) {
  await switchOn(userId);
  const wRes = await addWallet(sid, { name: 'Cash', currency: 'VND', startAmount: 5_000_000 });
  expect(wRes.status).toBe(201);
  const { wallet } = await json<{ wallet: { id: string } }>(wRes);

  const catRes = await call('/api/me/personal/categories', as(sid));
  expect(catRes.status).toBe(200);
  const { categories } = await json<CategoriesResponse>(catRes);
  const expenseCat = categories.find((c) => c.type === 'expense')!;

  return { walletId: wallet.id, categoryId: expenseCat.id };
}

describe('personal tags unicode resolution', () => {
  it('creates an entry with ["Đà Lạt"] and reuses the same tag id for ["đà lạt"]', async () => {
    const userId = 'tags-unicode-reuse';
    const sid = await memberSid(userId);
    const { walletId, categoryId } = await setupBook(sid, userId);

    const firstRes = await postJson('/api/me/personal/transactions', sid, {
      type: 'expense',
      walletId,
      categoryId,
      amount: 120_000,
      date: '2026-11-20',
      note: 'Bánh tráng nướng',
      tags: ['Đà Lạt'],
    });
    expect(firstRes.status).toBe(201);
    const firstBody = await json<{ entries: EntryView[] }>(firstRes);
    expect(firstBody.entries[0]?.tags).toEqual(['Đà Lạt']);

    const tagsAfterFirst = await json<{ tags: TagView[] }>(
      await call('/api/me/personal/tags', as(sid)),
    );
    expect(tagsAfterFirst.tags).toHaveLength(1);
    const firstTagId = tagsAfterFirst.tags[0]!.id;

    const secondRes = await postJson('/api/me/personal/transactions', sid, {
      type: 'expense',
      walletId,
      categoryId,
      amount: 85_000,
      date: '2026-11-21',
      note: 'Sữa đậu nành',
      tags: ['đà lạt'],
    });
    expect(secondRes.status).toBe(201);
    const secondBody = await json<{ entries: EntryView[] }>(secondRes);
    expect(secondBody.entries[0]?.tags).toEqual(['Đà Lạt']);

    const tagsAfterSecond = await json<{ tags: TagView[] }>(
      await call('/api/me/personal/tags', as(sid)),
    );
    expect(tagsAfterSecond.tags).toHaveLength(1);
    expect(tagsAfterSecond.tags[0]!.id).toBe(firstTagId);
  });

  it('handles mixed ASCII names case-insensitively', async () => {
    const userId = 'tags-unicode-ascii';
    const sid = await memberSid(userId);
    const { walletId, categoryId } = await setupBook(sid, userId);

    const firstRes = await postJson('/api/me/personal/transactions', sid, {
      type: 'expense',
      walletId,
      categoryId,
      amount: 50_000,
      date: '2026-11-20',
      tags: ['Work', 'Coffee'],
    });
    expect(firstRes.status).toBe(201);

    const secondRes = await postJson('/api/me/personal/transactions', sid, {
      type: 'expense',
      walletId,
      categoryId,
      amount: 75_000,
      date: '2026-11-21',
      tags: ['work', 'COFFEE', 'Event'],
    });
    expect(secondRes.status).toBe(201);
    const secondBody = await json<{ entries: EntryView[] }>(secondRes);
    expect(secondBody.entries[0]?.tags).toEqual(['Work', 'Coffee', 'Event']);

    const { tags } = await json<{ tags: TagView[] }>(
      await call('/api/me/personal/tags', as(sid)),
    );
    expect(tags.map((t) => t.name).sort()).toEqual(['Coffee', 'Event', 'Work']);
  });

  it('shares one tag between a trip created as "Đà Lạt" and an entry tagged "Đà Lạt"', async () => {
    const userId = 'tags-unicode-trip';
    const sid = await memberSid(userId);
    const { walletId, categoryId } = await setupBook(sid, userId);

    const tripRes = await postJson('/api/me/personal/events', sid, {
      name: 'Đà Lạt',
      start: '2026-11-20',
      end: '2026-11-22',
      countsFrom: '2026-11-20',
      groupIds: [],
      today: '2026-11-20',
    });
    expect(tripRes.status).toBe(201);
    const { event } = await json<EventSavedResponse>(tripRes);

    const entryRes = await postJson('/api/me/personal/transactions', sid, {
      type: 'expense',
      walletId,
      categoryId,
      amount: 450_000,
      date: '2026-11-20',
      note: 'Lẩu gà lá é',
      tags: ['Đà Lạt'],
    });
    expect(entryRes.status).toBe(201);

    const { tags } = await json<{ tags: TagView[] }>(
      await call('/api/me/personal/tags', as(sid)),
    );
    expect(tags).toHaveLength(1);
    expect(tags[0]!.id).toBe(event.tagId);
    expect(tags[0]!.name).toBe('Đà Lạt');
  });
});
