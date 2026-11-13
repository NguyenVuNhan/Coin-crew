import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ActivityItem } from '@cc/core';
import { call, json, seedTrip, guestHeaders, T, PID } from './helpers';

const at = (minute: number) => `2026-10-20T10:${String(minute).padStart(2, '0')}:00.000Z`;

function act(id: string, createdAt: string) {
  return env.DB.prepare(
    "INSERT INTO activity (id, trip_id, actor_participant_id, actor_user_id, actor_device, action, details_json, created_at) VALUES (?, ?, NULL, NULL, NULL, 'expense_added', '{}', ?)",
  ).bind(id, T.tripId, createdAt);
}

async function page(before?: string): Promise<ActivityItem[]> {
  const q = before ? `?before=${encodeURIComponent(before)}` : '';
  return json<ActivityItem[]>(call(`/api/trips/${T.tripId}/activity${q}`, { headers: await guestHeaders(PID.C) }));
}

describe('GET /api/trips/:id/activity paging', () => {
  beforeEach(async () => {
    await seedTrip();
    await env.DB.prepare('DELETE FROM activity WHERE trip_id = ?').bind(T.tripId).run();
    const rows = [];
    for (let i = 0; i < 60; i++) {
      // The 20 oldest rows share one createdAt, so the 50-row page boundary falls inside them.
      rows.push(act(`a-${String(i).padStart(2, '0')}`, i < 40 ? at(20 + i) : at(10)));
    }
    await env.DB.batch(rows);
  });

  it('pages by `<createdAt>~<id>` without skipping rows that share a timestamp', async () => {
    const p1 = await page();
    expect(p1).toHaveLength(50);
    const last = p1[p1.length - 1]!;
    const p2 = await page(`${last.createdAt}~${last.id}`);
    expect(p2).toHaveLength(10);
    const keys = [...p1, ...p2].map((i) => `${i.createdAt}~${i.id}`);
    expect(new Set(keys).size).toBe(60);
    expect(keys).toEqual([...keys].sort().reverse());
  });

  it('still accepts a bare createdAt cursor from older clients', async () => {
    const res = await page(at(30));
    expect(res.map((i) => i.createdAt).every((c) => c < at(30))).toBe(true);
    expect(res).toHaveLength(30);
  });

  it('rejects a malformed cursor', async () => {
    const res = await call(`/api/trips/${T.tripId}/activity?before=${encodeURIComponent('~abc')}`, { headers: await guestHeaders(PID.C) });
    expect(res.status).toBe(422);
  });
});
