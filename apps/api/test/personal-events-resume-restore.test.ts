import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  BudgetResponse,
  CategoriesResponse,
  EntryView,
  EventSavedResponse,
  EventView,
  EventsResponse,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const listEvents = (sid: string) => call('/api/me/personal/events', as(sid));

const createEvent = (sid: string, body: unknown) =>
  postJson('/api/me/personal/events', sid, body);

const patchEvent = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const stopEvent = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}/stop`, sid, body);

const resumeEvent = (sid: string, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}/resume`, sid, body);

const getBudget = (sid: string, id: string) =>
  call(`/api/me/personal/budgets/${encodeURIComponent(id)}`, as(sid));

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));

const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

const countQueries = async <T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> => {
  let prepareCount = 0;
  let batchCount = 0;
  const origPrepare = env.DB.prepare.bind(env.DB);
  const origBatch = env.DB.batch.bind(env.DB);
  env.DB.prepare = ((q: string) => {
    prepareCount++;
    return origPrepare(q);
  }) as typeof env.DB.prepare;
  env.DB.batch = ((stmts: D1PreparedStatement[]) => {
    batchCount++;
    return origBatch(stmts);
  }) as typeof env.DB.batch;
  try {
    const result = await fn();
    return { result, queries: prepareCount + batchCount };
  } finally {
    env.DB.prepare = origPrepare;
    env.DB.batch = origBatch;
  }
};

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_event_share_marks').run();
  await env.DB.prepare('DELETE FROM personal_event_groups').run();
  await env.DB.prepare('DELETE FROM personal_events').run();
  await env.DB.prepare('DELETE FROM personal_budget_excluded_wallets').run();
  await env.DB.prepare('DELETE FROM personal_budget_limits').run();
  await env.DB.prepare('DELETE FROM personal_budgets').run();
  await env.DB.prepare('DELETE FROM personal_transaction_tags').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
});

describe('personal events stop -> resume restore', () => {
  it('resume restores the planned end and keeps the limit', async () => {
    const userId = 'u-rr-restore';
    const sid = await memberSid(userId, 'RestoreUser');
    await switchOn(userId);

    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 5_000_000, startDate: '2026-12-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          end: '2026-12-30',
          groupIds: [],
          limit: { amount: 6_000_000, currency: 'VND' },
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.plannedEnd).toBeNull();
    expect(created.budgetId).toBeTruthy();

    const { result: stopRes, queries: stopQueries } = await countQueries(() =>
      stopEvent(sid, created.id, { today: '2026-12-25' }),
    );
    expect(stopRes.status).toBe(200);
    expect(stopQueries).toBeLessThanOrEqual(50);

    const stopped = (await json<{ event: EventView }>(stopRes)).event;
    expect(stopped.end).toBe('2026-12-25');
    expect(stopped.plannedEnd).toBe('2026-12-30');
    expect(stopped.stoppedAt).toBeTruthy();
    expect(stopped.tagName).toBe('dalat-201226-251226');
    expect(stopped.budgetId).toBe(created.budgetId);

    const budgetWhileStopped = (
      await json<BudgetResponse>(await getBudget(sid, created.budgetId!))
    ).budget;
    expect(budgetWhileStopped.to).toBe('2026-12-25');

    // Add an expense in the stopped gap
    const gapEntry = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w.id,
          amount: 200_000,
          categoryId: food.id,
          date: '2026-12-26',
          note: 'Gap coffee',
        }),
      )
    ).entries[0]!;

    // Resume on Dec 27 (plannedEnd >= today)
    const { result: resumeRes, queries: resumeQueries } = await countQueries(() =>
      resumeEvent(sid, created.id, { today: '2026-12-27' }),
    );
    expect(resumeRes.status).toBe(200);
    expect(resumeQueries).toBeLessThanOrEqual(50);

    const resumed = await json<EventSavedResponse>(resumeRes);
    expect(resumed.event.end).toBe('2026-12-30');
    expect(resumed.event.plannedEnd).toBeNull();
    expect(resumed.event.stoppedAt).toBeNull();
    expect(resumed.event.budgetId).toBe(created.budgetId);
    expect(resumed.event.tagName).toBe('dalat-201226-301226');
    expect(resumed.existing.ownIds).toEqual([gapEntry.id]);

    // Budget range restored and limit preserved
    const budgetAfterResume = (
      await json<BudgetResponse>(await getBudget(sid, created.budgetId!))
    ).budget;
    expect(budgetAfterResume.to).toBe('2026-12-30');
    expect(budgetAfterResume.limits[0]?.amount).toBe(6_000_000);

    // Persisted in GET list
    const listed = (await json<EventsResponse>(await listEvents(sid))).events;
    expect(listed[0]?.end).toBe('2026-12-30');
    expect(listed[0]?.plannedEnd).toBeNull();
    expect(listed[0]?.stoppedAt).toBeNull();
    expect(listed[0]?.budgetId).toBe(created.budgetId);
  });

  it('resume after the planned end passed opens the event and drops the limit', async () => {
    const userId = 'u-rr-passed';
    const sid = await memberSid(userId, 'PassedUser');
    await switchOn(userId);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          end: '2026-12-30',
          groupIds: [],
          limit: { amount: 6_000_000, currency: 'VND' },
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.budgetId).toBeTruthy();

    expect((await stopEvent(sid, created.id, { today: '2026-12-25' })).status).toBe(200);

    // Resume on Dec 31 (plannedEnd '2026-12-30' < today '2026-12-31')
    const { result: resumeRes, queries } = await countQueries(() =>
      resumeEvent(sid, created.id, { today: '2026-12-31' }),
    );
    expect(resumeRes.status).toBe(200);
    expect(queries).toBeLessThanOrEqual(50);

    const resumed = await json<EventSavedResponse>(resumeRes);
    expect(resumed.event.end).toBeNull();
    expect(resumed.event.plannedEnd).toBeNull();
    expect(resumed.event.stoppedAt).toBeNull();
    expect(resumed.event.budgetId).toBeNull();
    expect(resumed.event.tagName).toBe('dalat-201226');

    // Budget row is deleted
    expect((await getBudget(sid, created.budgetId!)).status).toBe(404);

    // Persisted in GET list
    const listed = (await json<EventsResponse>(await listEvents(sid))).events;
    expect(listed[0]?.end).toBeNull();
    expect(listed[0]?.plannedEnd).toBeNull();
    expect(listed[0]?.budgetId).toBeNull();
  });

  it('resume of an open event stays open', async () => {
    const userId = 'u-rr-open';
    const sid = await memberSid(userId, 'OpenUser');
    await switchOn(userId);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          groupIds: [],
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.end).toBeNull();
    expect(created.plannedEnd).toBeNull();

    const { result: stopRes, queries: stopQueries } = await countQueries(() =>
      stopEvent(sid, created.id, { today: '2026-12-25' }),
    );
    expect(stopRes.status).toBe(200);
    expect(stopQueries).toBeLessThanOrEqual(50);

    const stopped = (await json<{ event: EventView }>(stopRes)).event;
    expect(stopped.end).toBe('2026-12-25');
    expect(stopped.plannedEnd).toBeNull();
    expect(stopped.tagName).toBe('dalat-201226-251226');

    const { result: resumeRes, queries: resumeQueries } = await countQueries(() =>
      resumeEvent(sid, created.id, { today: '2026-12-27' }),
    );
    expect(resumeRes.status).toBe(200);
    expect(resumeQueries).toBeLessThanOrEqual(50);

    const resumed = await json<EventSavedResponse>(resumeRes);
    expect(resumed.event.end).toBeNull();
    expect(resumed.event.plannedEnd).toBeNull();
    expect(resumed.event.stoppedAt).toBeNull();
    expect(resumed.event.budgetId).toBeNull();
    expect(resumed.event.tagName).toBe('dalat-201226');
  });

  it('stop keeps planned end in EventView.plannedEnd', async () => {
    const userId = 'u-rr-view';
    const sid = await memberSid(userId, 'ViewUser');
    await switchOn(userId);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          end: '2026-12-30',
          groupIds: [],
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.plannedEnd).toBeNull();

    const { result: stopRes, queries: stopQueries } = await countQueries(() =>
      stopEvent(sid, created.id, { today: '2026-12-25' }),
    );
    expect(stopRes.status).toBe(200);
    expect(stopQueries).toBeLessThanOrEqual(50);

    const stopped = (await json<{ event: EventView }>(stopRes)).event;
    expect(stopped.plannedEnd).toBe('2026-12-30');
    expect(stopped.end).toBe('2026-12-25');

    // GET /me/personal/events returns plannedEnd
    const { result: listRes, queries: listQueries } = await countQueries(() => listEvents(sid));
    expect(listRes.status).toBe(200);
    expect(listQueries).toBeLessThanOrEqual(50);
    const listed = (await json<EventsResponse>(listRes)).events;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.plannedEnd).toBe('2026-12-30');

    // PATCH on a stopped event (e.g. renaming) preserves plannedEnd in response and DB
    const { result: patchRes, queries: patchQueries } = await countQueries(() =>
      patchEvent(sid, created.id, { name: 'Đà Lạt 2', today: '2026-12-26' }),
    );
    expect(patchRes.status).toBe(200);
    expect(patchQueries).toBeLessThanOrEqual(50);
    const patched = (await json<EventSavedResponse>(patchRes)).event;
    expect(patched.plannedEnd).toBe('2026-12-30');

    const listedAfterPatch = (await json<EventsResponse>(await listEvents(sid))).events;
    expect(listedAfterPatch[0]?.plannedEnd).toBe('2026-12-30');
  });
});
