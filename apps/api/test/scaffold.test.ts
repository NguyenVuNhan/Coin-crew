import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { createApp } from '../src/app';
import { ApiError } from '../src/lib/errors';
import { getDb } from '../src/db/client';
import { commitTripWrite } from '../src/lib/commit';

const call = (app: ReturnType<typeof createApp>, path: string) => app.request(path, {}, env);

describe('worker scaffold', () => {
  it('health check', async () => {
    const res = await call(createApp(), '/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
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
    app.get('/api/test/limit', () => { throw new Error('D1_ERROR: free tier daily rows read limit exceeded'); });
    const res = await call(app, '/api/test/limit');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('DAILY_LIMIT');
  });

  it('a D1 limit error wrapped by Drizzle (in err.cause) is still DAILY_LIMIT', async () => {
    const app = createApp();
    app.get('/api/test/wrapped', () => {
      throw new Error('Failed query: select * from trips', { cause: new Error('D1_ERROR: free tier daily rows read limit exceeded') });
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
