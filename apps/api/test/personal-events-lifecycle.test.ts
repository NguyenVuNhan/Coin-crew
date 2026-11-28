import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type {
  BudgetResponse,
  CategoriesResponse,
  EntryView,
  EventSavedResponse,
  EventView,
  EventsResponse,
  TagView,
  WalletDetailResponse,
} from '@cc/core';
import { call, json, memberSid } from './helpers';
import { addWallet, postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const listEvents = (sid: string | null) =>
  call('/api/me/personal/events', sid ? as(sid) : {});

const createEvent = (sid: string | null, body: unknown) =>
  postJson('/api/me/personal/events', sid, body);

const patchEvent = (sid: string | null, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}`, sid, body, 'PATCH');

const stopEvent = (sid: string | null, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}/stop`, sid, body);

const resumeEvent = (sid: string | null, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}/resume`, sid, body);

const startNowEvent = (sid: string | null, id: string, body: unknown) =>
  postJson(`/api/me/personal/events/${encodeURIComponent(id)}/start-now`, sid, body);

const getBudget = (sid: string, id: string) =>
  call(`/api/me/personal/budgets/${encodeURIComponent(id)}`, as(sid));

const getCategories = (sid: string) => call('/api/me/personal/categories', as(sid));
const getTags = (sid: string) => call('/api/me/personal/tags', as(sid));
const deleteTag = (sid: string, id: string) =>
  call(`/api/me/personal/tags/${encodeURIComponent(id)}`, { method: 'DELETE', ...as(sid) });
const createEntry = (sid: string, body: unknown) =>
  postJson('/api/me/personal/transactions', sid, body);

async function seedGroupWithExpenses(
  tripId: string,
  userId: string,
  expenses: { id: string; description: string; amount: number; myShare: number; spentOn: string }[],
): Promise<void> {
  const now = '2026-10-01T00:00:00.000Z';
  const myPid = `p-me-${tripId}`;
  const otherPid = `p-other-${tripId}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, 'VND', 1, ?, ?, ?, 1, ?)",
  )
    .bind(tripId, `Group ${tripId}`, userId, `gtok-${tripId}`, `vtok-${tripId}`, now)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, 'Me', 'me', ?, 'active', 0, ?)",
  )
    .bind(myPid, tripId, userId, now)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, 'Friend', 'friend', NULL, 'active', 1, ?)",
  )
    .bind(otherPid, tripId, now)
    .run();

  for (const exp of expenses) {
    await env.DB.prepare(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', ?, ?, 'VND', ?, ?, 'exact', 'approved', ?, ?, ?)",
    )
      .bind(exp.id, exp.id, tripId, exp.description, exp.amount, exp.spentOn, otherPid, myPid, now, now)
      .run();
    await env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
    )
      .bind(exp.id, myPid, exp.myShare, exp.myShare)
      .run();
    await env.DB.prepare(
      'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, ?, ?)',
    )
      .bind(exp.id, otherPid, exp.amount - exp.myShare, exp.amount - exp.myShare)
      .run();
  }
}

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
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallet_options').run();
  await env.DB.prepare('DELETE FROM personal_wallet_settings').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_trip_cache').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('personal events lifecycle', () => {
  it('guards stop, resume, and start-now routes (401/403)', async () => {
    expect((await stopEvent(null, 'ev-1', { today: '2026-12-20' })).status).toBe(401);
    expect((await resumeEvent(null, 'ev-1', { today: '2026-12-20' })).status).toBe(401);
    expect((await startNowEvent(null, 'ev-1', { today: '2026-12-20' })).status).toBe(401);

    const sid = await memberSid('u-lc-guard', 'Guard');
    expect((await stopEvent(sid, 'ev-1', { today: '2026-12-20' })).status).toBe(403);
    expect((await resumeEvent(sid, 'ev-1', { today: '2026-12-20' })).status).toBe(403);
    expect((await startNowEvent(sid, 'ev-1', { today: '2026-12-20' })).status).toBe(403);
  });

  it('create with only a name starts today and tags dalat-<ddmmyy>', async () => {
    const userId = 'u-lc-name-only';
    const sid = await memberSid(userId, 'NameOnly');
    await switchOn(userId);

    const { result: res, queries } = await countQueries(() =>
      createEvent(sid, {
        name: 'Đà Lạt',
        groupIds: [],
        today: '2026-12-20',
      }),
    );
    expect(res.status).toBe(201);
    expect(queries).toBeLessThanOrEqual(50);

    const body = await json<EventSavedResponse>(res);
    expect(body.event.name).toBe('Đà Lạt');
    expect(body.event.start).toBe('2026-12-20');
    expect(body.event.end).toBeNull();
    expect(body.event.stoppedAt).toBeNull();
    expect(body.event.countsFrom).toBe('2026-12-20');
    expect(body.event.tagId).toBeTruthy();
    expect(body.event.tagName).toBe('dalat-201226');
  });

  it('create rejects a limit without an end', async () => {
    const userId = 'u-lc-limit-no-end';
    const sid = await memberSid(userId, 'LimitNoEnd');
    await switchOn(userId);

    const res = await createEvent(sid, {
      name: 'Đà Lạt',
      groupIds: [],
      limit: { amount: 5_000_000, currency: 'VND' },
      today: '2026-12-20',
    });
    expect(res.status).toBe(400);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe('limit_needs_end');

    // end < start -> 400 invalid_range
    const badRange = await createEvent(sid, {
      name: 'Đà Lạt',
      start: '2026-12-25',
      end: '2026-12-20',
      groupIds: [],
      today: '2026-12-20',
    });
    expect(badRange.status).toBe(400);
    expect((await json<{ error: { code: string } }>(badRange)).error.code).toBe('invalid_range');
  });

  it('generated name collides with an owner tag', async () => {
    const userId = 'u-lc-collide';
    const sid = await memberSid(userId, 'Collide');
    await switchOn(userId);

    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-existing', ?, 'dalat-201226', '2026-12-01T00:00:00.000Z')",
    )
      .bind(userId)
      .run();

    const res = await createEvent(sid, {
      name: 'Đà Lạt',
      groupIds: [],
      today: '2026-12-20',
    });
    expect(res.status).toBe(201);
    const body = await json<EventSavedResponse>(res);
    expect(body.event.tagId).not.toBe('tag-existing');
    expect(body.event.tagName).toBe('dalat-201226-2');
  });

  it('two events can overlap', async () => {
    const userId = 'u-lc-overlap';
    const sid = await memberSid(userId, 'Overlap');
    await switchOn(userId);

    const res1 = await createEvent(sid, {
      name: 'Đà Lạt',
      start: '2026-12-20',
      end: '2026-12-25',
      groupIds: [],
      today: '2026-12-20',
    });
    expect(res1.status).toBe(201);

    const res2 = await createEvent(sid, {
      name: 'Mua sắm Tết',
      start: '2026-12-20',
      end: '2026-12-25',
      groupIds: [],
      today: '2026-12-20',
    });
    expect(res2.status).toBe(201);
  });

  it('stop sets end today, renames tag, keeps budget with end today', async () => {
    const userId = 'u-lc-stop';
    const sid = await memberSid(userId, 'StopUser');
    await switchOn(userId);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          end: '2026-12-30',
          groupIds: [],
          limit: { amount: 8_000_000, currency: 'VND' },
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.tagName).toBe('dalat-201226-301226');
    expect(created.budgetId).toBeTruthy();

    // Cannot stop when upcoming
    const upcomingRes = await stopEvent(sid, created.id, { today: '2026-12-19' });
    expect(upcomingRes.status).toBe(409);
    expect((await json<{ error: { code: string } }>(upcomingRes)).error.code).toBe('not_running');

    const { result: stopRes, queries } = await countQueries(() =>
      stopEvent(sid, created.id, { today: '2026-12-25' }),
    );
    expect(stopRes.status).toBe(200);
    expect(queries).toBeLessThanOrEqual(50);

    const stopped = (await json<{ event: EventView }>(stopRes)).event;
    expect(stopped.end).toBe('2026-12-25');
    expect(stopped.stoppedAt).toBeTruthy();
    expect(stopped.tagName).toBe('dalat-201226-251226');
    expect(stopped.budgetId).toBe(created.budgetId);

    const budget = (await json<BudgetResponse>(await getBudget(sid, created.budgetId!))).budget;
    expect(budget.to).toBe('2026-12-25');

    // Stopping again -> 409 not_running
    const stopAgain = await stopEvent(sid, created.id, { today: '2026-12-25' });
    expect(stopAgain.status).toBe(409);
    expect((await json<{ error: { code: string } }>(stopAgain)).error.code).toBe('not_running');
  });

  it('resume clears end, drops the budget and returns the gap', async () => {
    const userId = 'u-lc-resume';
    const sid = await memberSid(userId, 'ResumeUser');
    await switchOn(userId);

    const w = (
      await json<WalletDetailResponse>(
        await addWallet(sid, { name: 'Cash', startAmount: 5_000_000, startDate: '2026-12-01' }),
      )
    ).wallet;
    const cats = (await json<CategoriesResponse>(await getCategories(sid))).categories;
    const food = cats.find((c) => c.type === 'expense')!;

    await seedGroupWithExpenses('g-res', userId, []);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          end: '2026-12-30',
          groupIds: ['g-res'],
          limit: { amount: 6_000_000, currency: 'VND' },
          today: '2026-12-20',
        }),
      )
    ).event;

    // Cannot resume when not stopped
    expect((await resumeEvent(sid, created.id, { today: '2026-12-25' })).status).toBe(409);

    // Stop on Dec 25
    const stopRes = await stopEvent(sid, created.id, { today: '2026-12-25' });
    expect(stopRes.status).toBe(200);

    // Expense on Dec 26 (in the stopped gap, untagged)
    const gapEntry = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w.id,
          amount: 250_000,
          categoryId: food.id,
          date: '2026-12-26',
          note: 'Coffee in gap',
        }),
      )
    ).entries[0]!;

    // Expense on Dec 24 (before stop day) -> not in gap
    await createEntry(sid, {
      type: 'expense',
      walletId: w.id,
      amount: 100_000,
      categoryId: food.id,
      date: '2026-12-24',
      note: 'Before stop',
    });

    // Group share in gap (Dec 26)
    await seedGroupWithExpenses('g-res', userId, [
      { id: 'ge-gap', description: 'Gap dinner', amount: 400_000, myShare: 200_000, spentOn: '2026-12-26' },
    ]);

    const { result: resumeRes, queries } = await countQueries(() =>
      resumeEvent(sid, created.id, { today: '2026-12-27' }),
    );
    expect(resumeRes.status).toBe(200);
    expect(queries).toBeLessThanOrEqual(50);

    const resumed = await json<EventSavedResponse>(resumeRes);
    expect(resumed.event.end).toBeNull();
    expect(resumed.event.stoppedAt).toBeNull();
    expect(resumed.event.budgetId).toBeNull();
    expect(resumed.event.tagName).toBe('dalat-201226');
    expect(resumed.existing.ownIds).toEqual([gapEntry.id]);
    expect(resumed.existing.shareRootIds).toEqual(['ge-gap']);

    // Budget row is gone
    expect((await getBudget(sid, created.budgetId!)).status).toBe(404);
  });

  it('start-now moves start and renames', async () => {
    const userId = 'u-lc-startnow';
    const sid = await memberSid(userId, 'StartNowUser');
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
          start: '2027-01-10',
          end: '2027-01-15',
          countsFrom: '2027-01-01',
          groupIds: [],
          today: '2026-12-20',
        }),
      )
    ).event;

    const todayEntry = (
      await json<{ entries: EntryView[] }>(
        await createEntry(sid, {
          type: 'expense',
          walletId: w.id,
          amount: 150_000,
          categoryId: food.id,
          date: '2026-12-28',
        }),
      )
    ).entries[0]!;

    const { result: startRes, queries } = await countQueries(() =>
      startNowEvent(sid, created.id, { today: '2026-12-28' }),
    );
    expect(startRes.status).toBe(200);
    expect(queries).toBeLessThanOrEqual(50);

    const started = await json<EventSavedResponse>(startRes);
    expect(started.event.start).toBe('2026-12-28');
    expect(started.event.countsFrom).toBe('2026-12-28');
    expect(started.event.tagName?.startsWith('dalat-281226')).toBe(true);
    expect(started.event.tagName).toBe('dalat-281226-150127');
    expect(started.existing.ownIds).toEqual([todayEntry.id]);

    // Cannot start-now when already running
    expect((await startNowEvent(sid, created.id, { today: '2026-12-28' })).status).toBe(409);
  });

  it('deleted tag is recreated on the next save', async () => {
    const userId = 'u-lc-deltag';
    const sid = await memberSid(userId, 'DelTag');
    await switchOn(userId);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          groupIds: [],
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.tagId).toBeTruthy();

    // Delete the tag row
    const delRes = await deleteTag(sid, created.tagId!);
    expect(delRes.status).toBe(200);

    // Event still exists with tagId null and tagName null
    const listed = (await json<EventsResponse>(await listEvents(sid))).events;
    expect(listed).toHaveLength(1);
    expect(listed[0]!.tagId).toBeNull();
    expect(listed[0]!.tagName).toBeNull();

    // PATCH recreates the tag
    const patchRes = await patchEvent(sid, created.id, {
      name: 'Đà Lạt',
      today: '2026-12-20',
    });
    expect(patchRes.status).toBe(200);
    const patched = (await json<EventSavedResponse>(patchRes)).event;
    expect(patched.tagId).toBeTruthy();
    expect(patched.tagId).not.toBe(created.tagId);
    expect(patched.tagName).toBe('dalat-201226');
  });

  it('hand-renamed tag is renamed back on a date change', async () => {
    const userId = 'u-lc-handrename';
    const sid = await memberSid(userId, 'HandRename');
    await switchOn(userId);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          end: '2026-12-25',
          groupIds: [],
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.tagName).toBe('dalat-201226-251226');

    // Rename tag by hand in DB (or tag endpoint)
    await env.DB.prepare('UPDATE personal_tags SET name = ? WHERE id = ?')
      .bind('my-custom-tag', created.tagId)
      .run();

    // Date change renames it back to generated format
    const patchRes = await patchEvent(sid, created.id, {
      end: '2026-12-28',
      today: '2026-12-20',
    });
    expect(patchRes.status).toBe(200);
    const patched = (await json<EventSavedResponse>(patchRes)).event;
    expect(patched.tagId).toBe(created.tagId);
    expect(patched.tagName).toBe('dalat-201226-281226');

    const tags = (await json<{ tags: TagView[] }>(await getTags(sid))).tags;
    expect(tags.find((t) => t.id === created.tagId)?.name).toBe('dalat-201226-281226');
  });

  it('clearing end deletes the limit', async () => {
    const userId = 'u-lc-clearend';
    const sid = await memberSid(userId, 'ClearEnd');
    await switchOn(userId);

    const created = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-12-20',
          end: '2026-12-25',
          groupIds: [],
          limit: { amount: 5_000_000, currency: 'VND' },
          today: '2026-12-20',
        }),
      )
    ).event;
    expect(created.budgetId).toBeTruthy();

    // Passing end: null AND limit -> 400 limit_needs_end
    const badPatch = await patchEvent(sid, created.id, {
      end: null,
      limit: { amount: 5_000_000, currency: 'VND' },
      today: '2026-12-20',
    });
    expect(badPatch.status).toBe(400);
    expect((await json<{ error: { code: string } }>(badPatch)).error.code).toBe('limit_needs_end');

    // Clearing end deletes the linked budget and updates tagName
    const { result: patchRes, queries } = await countQueries(() =>
      patchEvent(sid, created.id, {
        end: null,
        today: '2026-12-20',
      }),
    );
    expect(patchRes.status).toBe(200);
    expect(queries).toBeLessThanOrEqual(50);

    const patched = (await json<EventSavedResponse>(patchRes)).event;
    expect(patched.end).toBeNull();
    expect(patched.budgetId).toBeNull();
    expect(patched.tagName).toBe('dalat-201226');
    expect((await getBudget(sid, created.budgetId!)).status).toBe(404);
  });
});
