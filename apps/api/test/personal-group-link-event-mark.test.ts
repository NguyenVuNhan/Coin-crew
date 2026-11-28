import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { EventSavedResponse } from '@cc/core';
import { json, memberSid } from './helpers';
import { postJson, switchOn } from './personal-helpers';

const createEvent = (sid: string, body: unknown) =>
  postJson('/api/me/personal/events', sid, body);

const putGroupLink = (sid: string, rootId: string, body: unknown) =>
  postJson(`/api/me/personal/group-links/${encodeURIComponent(rootId)}`, sid, body, 'PUT');

const tagShares = (sid: string, today: string) =>
  postJson('/api/me/personal/events/tag-shares', sid, { today });

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

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_event_share_marks').run();
  await env.DB.prepare('DELETE FROM personal_event_groups').run();
  await env.DB.prepare('DELETE FROM personal_events').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM personal_trip_cache').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('personal group-links explicit tag write records event share mark', () => {
  it('quick share during a trip with trip tag dismissed (tagIds: []) writes skipped mark so tag-shares never adds it', async () => {
    const userId = 'u-gl-mark-qs';
    const sid = await memberSid(userId, 'QuickShareMarkUser');
    await switchOn(userId);

    await seedGroupWithExpenses('g-trip', userId, []);
    const trip = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Đà Lạt',
          start: '2026-11-10',
          end: '2026-11-15',
          countsFrom: '2026-11-01',
          groupIds: ['g-trip'],
          today: '2026-11-11',
        }),
      )
    ).event;

    // New expense saved during the trip (quick share flow: expense created, then PUT /group-links with tagIds: [])
    await seedGroupWithExpenses('g-trip', userId, [
      { id: 'ge-qs-1', description: 'Coffee', amount: 100_000, myShare: 50_000, spentOn: '2026-11-11' },
    ]);
    const putRes = await putGroupLink(sid, 'ge-qs-1', { tagIds: [] });
    expect(putRes.status).toBe(200);

    // Mark should be written as 'skipped'
    const mark = await env.DB.prepare(
      'SELECT event_id, state FROM personal_event_share_marks WHERE user_id = ? AND root_id = ?',
    )
      .bind(userId, 'ge-qs-1')
      .first<{ event_id: string; state: string }>();
    expect(mark).toEqual({ event_id: trip.id, state: 'skipped' });

    // Running tag-shares must NOT add the trip tag
    const tagRes = await tagShares(sid, '2026-11-11');
    expect(tagRes.status).toBe(200);
    expect(await json<{ tagged: number }>(tagRes)).toEqual({ tagged: 0 });

    const linkTags = await env.DB.prepare(
      'SELECT tag_id FROM personal_group_link_tags WHERE user_id = ? AND root_id = ?',
    )
      .bind(userId, 'ge-qs-1')
      .all<{ tag_id: string }>();
    expect(linkTags.results).toEqual([]);
  });

  it('PUT /group-links setting tags without trip tag before tag-shares ever ran prevents tag-shares from adding it back', async () => {
    const userId = 'u-gl-mark-put';
    const sid = await memberSid(userId, 'PutMarkUser');
    await switchOn(userId);

    await seedGroupWithExpenses('g-trip2', userId, []);
    const trip = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Phú Quốc',
          start: '2026-11-10',
          end: '2026-11-15',
          countsFrom: '2026-11-01',
          groupIds: ['g-trip2'],
          today: '2026-11-11',
        }),
      )
    ).event;

    // Seed another tag to assign explicitly
    await env.DB.prepare(
      "INSERT INTO personal_tags (id, user_id, name, created_at) VALUES ('tag-other', ?, 'Work', '2026-11-01T00:00:00.000Z')",
    )
      .bind(userId)
      .run();

    // New group share added during trip; user edits link tags to ['tag-other'] (removing/omitting trip tag) before tag-shares runs
    await seedGroupWithExpenses('g-trip2', userId, [
      { id: 'ge-manual-1', description: 'Taxi', amount: 200_000, myShare: 100_000, spentOn: '2026-11-12' },
      { id: 'ge-manual-2', description: 'Dinner', amount: 300_000, myShare: 150_000, spentOn: '2026-11-12' },
    ]);

    expect((await putGroupLink(sid, 'ge-manual-1', { tagIds: ['tag-other'] })).status).toBe(200);
    // Also test explicit inclusion of trip tag writes 'tagged'
    expect((await putGroupLink(sid, 'ge-manual-2', { tagIds: [trip.tagId] })).status).toBe(200);

    const marks = await env.DB.prepare(
      'SELECT root_id, event_id, state FROM personal_event_share_marks WHERE user_id = ? ORDER BY root_id',
    )
      .bind(userId)
      .all<{ root_id: string; event_id: string; state: string }>();
    expect(marks.results).toEqual([
      { root_id: 'ge-manual-1', event_id: trip.id, state: 'skipped' },
      { root_id: 'ge-manual-2', event_id: trip.id, state: 'tagged' },
    ]);

    // tag-shares does not re-tag ge-manual-1
    const tagRes = await tagShares(sid, '2026-11-12');
    expect(tagRes.status).toBe(200);
    expect(await json<{ tagged: number }>(tagRes)).toEqual({ tagged: 0 });

    const tags1 = await env.DB.prepare(
      'SELECT tag_id FROM personal_group_link_tags WHERE user_id = ? AND root_id = ?',
    )
      .bind(userId, 'ge-manual-1')
      .all<{ tag_id: string }>();
    expect(tags1.results.map((r) => r.tag_id)).toEqual(['tag-other']);
  });

  it('setting tags on a share outside any trip writes no mark', async () => {
    const userId = 'u-gl-mark-outside';
    const sid = await memberSid(userId, 'OutsideMarkUser');
    await switchOn(userId);

    await seedGroupWithExpenses('g-in', userId, []);
    await seedGroupWithExpenses('g-out', userId, [
      { id: 'ge-other-grp', description: 'Lunch', amount: 100_000, myShare: 50_000, spentOn: '2026-11-11' },
    ]);
    await createEvent(sid, {
      name: 'Nha Trang',
      start: '2026-11-10',
      end: '2026-11-15',
      countsFrom: '2026-11-05',
      groupIds: ['g-in'],
      today: '2026-11-11',
    });

    // Share in g-in but outside countsFrom..end
    await seedGroupWithExpenses('g-in', userId, [
      { id: 'ge-out-date', description: 'Old', amount: 100_000, myShare: 50_000, spentOn: '2026-10-01' },
    ]);

    expect((await putGroupLink(sid, 'ge-other-grp', { tagIds: [] })).status).toBe(200);
    expect((await putGroupLink(sid, 'ge-out-date', { tagIds: [] })).status).toBe(200);

    const marks = await env.DB.prepare(
      'SELECT root_id FROM personal_event_share_marks WHERE user_id = ?',
    )
      .bind(userId)
      .all<{ root_id: string }>();
    expect(marks.results).toEqual([]);
  });

  it('removing an event tag flips an existing tagged mark to skipped, and re-adding flips it back to tagged', async () => {
    const userId = 'u-gl-mark-flip';
    const sid = await memberSid(userId, 'FlipMarkUser');
    await switchOn(userId);

    await seedGroupWithExpenses('g-flip', userId, []);
    const ev = (
      await json<EventSavedResponse>(
        await createEvent(sid, {
          name: 'Flip Event',
          start: '2026-11-10',
          end: '2026-11-15',
          countsFrom: '2026-11-01',
          groupIds: ['g-flip'],
          today: '2026-11-11',
        }),
      )
    ).event;

    await seedGroupWithExpenses('g-flip', userId, [
      { id: 'ge-flip', description: 'Snack', amount: 100_000, myShare: 50_000, spentOn: '2026-11-11' },
    ]);

    expect((await tagShares(sid, '2026-11-11')).status).toBe(200);
    const markAfterTag = await env.DB.prepare(
      'SELECT state FROM personal_event_share_marks WHERE user_id = ? AND root_id = ? AND event_id = ?',
    )
      .bind(userId, 'ge-flip', ev.id)
      .first<{ state: string }>();
    expect(markAfterTag).toEqual({ state: 'tagged' });

    expect((await putGroupLink(sid, 'ge-flip', { tagIds: [] })).status).toBe(200);
    const markAfterRemove = await env.DB.prepare(
      'SELECT state FROM personal_event_share_marks WHERE user_id = ? AND root_id = ? AND event_id = ?',
    )
      .bind(userId, 'ge-flip', ev.id)
      .first<{ state: string }>();
    expect(markAfterRemove).toEqual({ state: 'skipped' });

    expect((await putGroupLink(sid, 'ge-flip', { tagIds: [ev.tagId] })).status).toBe(200);
    const markAfterReadd = await env.DB.prepare(
      'SELECT state FROM personal_event_share_marks WHERE user_id = ? AND root_id = ? AND event_id = ?',
    )
      .bind(userId, 'ge-flip', ev.id)
      .first<{ state: string }>();
    expect(markAfterReadd).toEqual({ state: 'tagged' });
  });
});
