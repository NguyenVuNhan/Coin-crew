import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createApp } from '../src/app';
import { ApiError } from '@cc/api-util/errors';
import { getDb } from '@cc/api-db/client';
import { commitTripWrite } from '@cc/api-db/commit';

const call = (app: ReturnType<typeof createApp>, path: string) => app.request(path, {}, env);

describe('worker scaffold', () => {
  it('health check', async () => {
    const res = await call(createApp(), '/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('health check answers HEAD for uptime probes (#79)', async () => {
    const res = await createApp().request('/api/health', { method: 'HEAD' }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('ApiError becomes a JSON error body', async () => {
    const app = createApp();
    app.get('/api/test/throw', () => { throw new ApiError('VALIDATION', 400, 'x'); });
    const res = await call(app, '/api/test/throw');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'VALIDATION', message: 'x' } });
  });

  it('D1 daily limit becomes 503 DAILY_LIMIT', async () => {
    const app = createApp();
    app.get('/api/test/limit', () => { throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit."); });
    const res = await call(app, '/api/test/limit');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('DAILY_LIMIT');
    expect(body.error.message).not.toMatch(/limit|free/i);
  });

  it('the D1 daily row write limit is DAILY_LIMIT too', async () => {
    const app = createApp();
    app.get('/api/test/write-limit', () => { throw new Error("Your account has exceeded D1's free tier daily row write limit."); });
    const res = await call(app, '/api/test/write-limit');
    expect(res.status).toBe(503);
  });

  it('the D1 storage limit and SQL that mentions limit are not DAILY_LIMIT', async () => {
    const app = createApp();
    app.get('/api/test/storage', () => {
      throw new Error("D1_ERROR: Your account has exceeded D1's maximum account storage limit, please contact Cloudflare to raise your limit");
    });
    app.get('/api/test/sql', () => {
      throw new Error('Failed query: select "borrower_row" from "loans" limit ?', { cause: new Error('D1_ERROR: no such column: borrower_row') });
    });
    expect((await call(app, '/api/test/storage')).status).toBe(500);
    expect((await call(app, '/api/test/sql')).status).toBe(500);
  });

  it('a D1 limit error wrapped by Drizzle (in err.cause) is still DAILY_LIMIT', async () => {
    const app = createApp();
    app.get('/api/test/wrapped', () => {
      throw new Error('Failed query: select * from trips', { cause: new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.") });
    });
    const res = await call(app, '/api/test/wrapped');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('DAILY_LIMIT');
  });

  it('any other error becomes 500 INTERNAL', async () => {
    const app = createApp();
    app.get('/api/test/boom', () => { throw new Error('boom'); });
    const res = await call(app, '/api/test/boom');
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INTERNAL');
  });

  it('migrations are applied', async () => {
    const row = await env.DB.prepare('SELECT count(*) AS n FROM trips').first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('commitTripWrite bumps the version once and logs one activity row', async () => {
    await env.DB.prepare(
      "INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES ('t1', 'Đà Lạt', 'VND', 1, 'u1', 'g', 'v', 0, '2026-10-12T00:00:00Z')",
    ).run();
    await commitTripWrite(getDb(env), 't1', [], { action: 'trip_created', actorParticipantId: null, actorUserId: 'u1', actorDevice: null, details: {} });
    const trip = await env.DB.prepare("SELECT version FROM trips WHERE id = 't1'").first<{ version: number }>();
    const acts = await env.DB.prepare("SELECT action FROM activity WHERE trip_id = 't1'").all<{ action: string }>();
    expect(trip?.version).toBe(1);
    expect(acts.results.map((a) => a.action)).toEqual(['trip_created']);
  });
});
