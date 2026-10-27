import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import type { MeResponse } from '@fsl/core';
import { call, json, memberSid } from './helpers';

async function seedMergeRequest({
  id,
  survivorUserId,
  mergedUserId,
  provider = 'zalo',
  providerSub = `z-${mergedUserId}`,
  status,
  createdAt,
  expiresAt,
  decidedAt = null,
  dismissedAt = null,
}: {
  id: string;
  survivorUserId: string;
  mergedUserId: string;
  provider?: string;
  providerSub?: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string | null;
  dismissedAt?: string | null;
}): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO account_merge_requests (id, survivor_user_id, merged_user_id, provider, provider_sub, status, created_at, expires_at, decided_at, dismissed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      survivorUserId,
      mergedUserId,
      provider,
      providerSub,
      status,
      createdAt,
      expiresAt,
      decidedAt,
      dismissedAt,
    )
    .run();
}

describe('POST /api/me/merge-requests/:id/dismiss', () => {
  it('dismisses a declined request', async () => {
    const sidSurvivor = await memberSid('u-d1-survivor', 'Survivor 1');
    await memberSid('u-d1-merged', 'Merged 1');

    const now = Date.now();
    const createdAt = new Date(now - 3_600_000).toISOString();
    const expiresAt = new Date(now + 7 * 86_400_000).toISOString();
    const decidedAt = new Date(now - 1_800_000).toISOString();

    await seedMergeRequest({
      id: 'mr-d1',
      survivorUserId: 'u-d1-survivor',
      mergedUserId: 'u-d1-merged',
      provider: 'zalo',
      providerSub: 'z-d1',
      status: 'declined',
      createdAt,
      expiresAt,
      decidedAt,
      dismissedAt: null,
    });

    const res = await call('/api/me/merge-requests/mr-d1/dismiss', {
      method: 'POST',
      headers: { Cookie: `sid=${sidSurvivor}` },
    });
    expect(res.status).toBe(204);

    const row = await env.DB.prepare('SELECT dismissed_at FROM account_merge_requests WHERE id = ?')
      .bind('mr-d1')
      .first<{ dismissed_at: string | null }>();
    expect(row?.dismissed_at).not.toBeNull();

    const meRes = await call('/api/me', { headers: { Cookie: `sid=${sidSurvivor}` } });
    expect(meRes.status).toBe(200);
    const meBody = await json<MeResponse>(meRes);
    expect(meBody.mergeRequests.outgoing.find((r) => r.id === 'mr-d1')).toBeUndefined();
  });

  it('dismisses an accepted request', async () => {
    const sidSurvivor = await memberSid('u-d2-survivor', 'Survivor 2');
    await memberSid('u-d2-merged', 'Merged 2');

    const now = Date.now();
    const createdAt = new Date(now - 3_600_000).toISOString();
    const expiresAt = new Date(now + 7 * 86_400_000).toISOString();
    const decidedAt = new Date(now - 1_800_000).toISOString();

    await seedMergeRequest({
      id: 'mr-d2',
      survivorUserId: 'u-d2-survivor',
      mergedUserId: 'u-d2-merged',
      provider: 'zalo',
      providerSub: 'z-d2',
      status: 'accepted',
      createdAt,
      expiresAt,
      decidedAt,
      dismissedAt: null,
    });

    const res = await call('/api/me/merge-requests/mr-d2/dismiss', {
      method: 'POST',
      headers: { Cookie: `sid=${sidSurvivor}` },
    });
    expect(res.status).toBe(204);

    const row = await env.DB.prepare('SELECT dismissed_at FROM account_merge_requests WHERE id = ?')
      .bind('mr-d2')
      .first<{ dismissed_at: string | null }>();
    expect(row?.dismissed_at).not.toBeNull();
  });

  it('refuses a pending request', async () => {
    const sidSurvivor = await memberSid('u-d3-survivor', 'Survivor 3');
    await memberSid('u-d3-merged', 'Merged 3');

    const now = Date.now();
    const createdAt = new Date(now - 3_600_000).toISOString();
    const expiresAt = new Date(now + 7 * 86_400_000).toISOString();

    await seedMergeRequest({
      id: 'mr-d3',
      survivorUserId: 'u-d3-survivor',
      mergedUserId: 'u-d3-merged',
      provider: 'zalo',
      providerSub: 'z-d3',
      status: 'pending',
      createdAt,
      expiresAt,
      decidedAt: null,
      dismissedAt: null,
    });

    const res = await call('/api/me/merge-requests/mr-d3/dismiss', {
      method: 'POST',
      headers: { Cookie: `sid=${sidSurvivor}` },
    });
    expect(res.status).toBe(404);
  });

  it('refuses another account’s request', async () => {
    const sidSurvivor = await memberSid('u-d4-survivor', 'Survivor 4');
    const sidMerged = await memberSid('u-d4-merged', 'Merged 4');

    const now = Date.now();
    const createdAt = new Date(now - 3_600_000).toISOString();
    const expiresAt = new Date(now + 7 * 86_400_000).toISOString();
    const decidedAt = new Date(now - 1_800_000).toISOString();

    await seedMergeRequest({
      id: 'mr-d4',
      survivorUserId: 'u-d4-survivor',
      mergedUserId: 'u-d4-merged',
      provider: 'zalo',
      providerSub: 'z-d4',
      status: 'declined',
      createdAt,
      expiresAt,
      decidedAt,
      dismissedAt: null,
    });

    const res = await call('/api/me/merge-requests/mr-d4/dismiss', {
      method: 'POST',
      headers: { Cookie: `sid=${sidMerged}` },
    });
    expect(res.status).toBe(404);

    const row = await env.DB.prepare('SELECT dismissed_at FROM account_merge_requests WHERE id = ?')
      .bind('mr-d4')
      .first<{ dismissed_at: string | null }>();
    expect(row?.dismissed_at).toBeNull();
  });

  it('refuses an already dismissed or unknown request', async () => {
    const sidSurvivor = await memberSid('u-d5-survivor', 'Survivor 5');
    await memberSid('u-d5-merged', 'Merged 5');

    const now = Date.now();
    const createdAt = new Date(now - 3_600_000).toISOString();
    const expiresAt = new Date(now + 7 * 86_400_000).toISOString();
    const decidedAt = new Date(now - 1_800_000).toISOString();
    const dismissedAt = new Date(now - 900_000).toISOString();

    await seedMergeRequest({
      id: 'mr-d5',
      survivorUserId: 'u-d5-survivor',
      mergedUserId: 'u-d5-merged',
      provider: 'zalo',
      providerSub: 'z-d5',
      status: 'declined',
      createdAt,
      expiresAt,
      decidedAt,
      dismissedAt,
    });

    const resDismissed = await call('/api/me/merge-requests/mr-d5/dismiss', {
      method: 'POST',
      headers: { Cookie: `sid=${sidSurvivor}` },
    });
    expect(resDismissed.status).toBe(404);

    const resUnknown = await call('/api/me/merge-requests/nope/dismiss', {
      method: 'POST',
      headers: { Cookie: `sid=${sidSurvivor}` },
    });
    expect(resUnknown.status).toBe(404);
  });
});
