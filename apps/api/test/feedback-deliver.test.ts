import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { deliverFeedback, retryUndeliveredFeedback } from '../src/feedback/deliver';
import { app } from './helpers';

const URL_ = 'https://script.example.com/exec';
const sheetEnv = { ...env, FEEDBACK_SHEET_WEBHOOK_URL: URL_, FEEDBACK_SHEET_TOKEN: 'tok' };

async function insert(id: string, deliveredAt: string | null = null, createdAt = '2026-11-01T10:00:00.000Z') {
  await env.DB.prepare(
    "INSERT INTO feedback (id, type, message, screen, device, lang, app_version, contact, created_at, delivered_at) VALUES (?, 'bug', 'msg', 'trip', 'phone', 'vi', 'v1', NULL, ?, ?)",
  ).bind(id, createdAt, deliveredAt).run();
}

async function deliveredAt(id: string): Promise<string | null> {
  return (await env.DB.prepare('SELECT delivered_at FROM feedback WHERE id = ?').bind(id).first<{ delivered_at: string | null }>())!.delivered_at;
}

function mockSheet(status = 200) {
  const bodies: { token: string; rows: Record<string, unknown>[] }[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== URL_) throw new Error(`unexpected fetch ${url}`);
    bodies.push(JSON.parse(String(init?.body)));
    return new Response('{"ok":true}', { status });
  });
  return { spy, bodies };
}

afterEach(() => vi.restoreAllMocks());

describe('deliverFeedback', () => {
  it('delivers and marks row', async () => {
    await insert('f1');
    const { bodies } = mockSheet();
    await deliverFeedback(sheetEnv, ['f1']);
    expect(bodies).toEqual([{
      token: 'tok',
      rows: [{ id: 'f1', createdAt: '2026-11-01T10:00:00.000Z', type: 'bug', message: 'msg', screen: 'trip', device: 'phone', lang: 'vi', appVersion: 'v1', contact: null }],
    }]);
    expect(await deliveredAt('f1')).not.toBeNull();
  });

  it('failed delivery leaves row undelivered', async () => {
    await insert('f1');
    mockSheet(500);
    await deliverFeedback(sheetEnv, ['f1']);
    expect(await deliveredAt('f1')).toBeNull();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(deliverFeedback(sheetEnv, ['f1'])).resolves.toBeUndefined();
    expect(await deliveredAt('f1')).toBeNull();
  });

  it('no webhook configured', async () => {
    await insert('f1');
    const { spy } = mockSheet();
    await deliverFeedback(env, ['f1']);
    expect(spy).not.toHaveBeenCalled();
    expect(await deliveredAt('f1')).toBeNull();
  });
});

describe('retryUndeliveredFeedback', () => {
  it('retry sends undelivered rows', async () => {
    await insert('a');
    await insert('b');
    await insert('c', '2026-11-01T10:05:00.000Z');
    const { bodies } = mockSheet();
    await retryUndeliveredFeedback(sheetEnv, new Date('2026-11-01T12:00:00.000Z'));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(await deliveredAt('a')).not.toBeNull();
  });

  it('cleans old rate buckets', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO feedback_rate (key, bucket, count) VALUES ('old', '2026-10-31T10:00:00.000Z', 1)"),
      env.DB.prepare("INSERT INTO feedback_rate (key, bucket, count) VALUES ('new', '2026-11-01T10:00:00.000Z', 1)"),
    ]);
    await retryUndeliveredFeedback(env, new Date('2026-11-01T11:00:00.000Z'));
    const keys = (await env.DB.prepare('SELECT key FROM feedback_rate').all<{ key: string }>()).results.map((r) => r.key);
    expect(keys).toEqual(['new']);
  });
});

describe('POST /api/feedback delivery', () => {
  const body = JSON.stringify({ message: 'hi', type: null, screen: 'trip', device: 'phone', lang: 'en', appVersion: 'v', contactMe: false });

  it('still 201 when Sheet down', async () => {
    mockSheet(500);
    const res = await app.request('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, sheetEnv);
    expect(res.status).toBe(201);
    const row = await env.DB.prepare('SELECT delivered_at FROM feedback').first<{ delivered_at: string | null }>();
    expect(row!.delivered_at).toBeNull();
  });

  it('forwards right away when Sheet up', async () => {
    const { bodies } = mockSheet();
    const res = await app.request('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, sheetEnv);
    expect(res.status).toBe(201);
    expect(bodies).toHaveLength(1);
    const row = await env.DB.prepare('SELECT delivered_at FROM feedback').first<{ delivered_at: string | null }>();
    expect(row!.delivered_at).not.toBeNull();
  });
});
