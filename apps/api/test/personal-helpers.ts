import { env } from 'cloudflare:test';
import { call } from './helpers';

export async function switchOn(userId: string, enabled: 0 | 1 = 1): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO user_personal_settings (user_id, enabled, updated_at) VALUES (?, ?, '2026-11-15T00:00:00.000Z') ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled",
  )
    .bind(userId, enabled)
    .run();
}

export function postJson(
  path: string,
  sid: string | null,
  body: unknown,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
): Promise<Response> {
  const fullPath = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
  return call(fullPath, {
    method,
    headers: {
      ...(sid ? { Cookie: `sid=${sid}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export function addWallet(sid: string | null, body: unknown): Promise<Response> {
  return postJson('/api/me/personal/wallets/add', sid, body);
}

/** Seeds the pre-#140 starter rows (`${userId}:food`, `:fees` › `:tax`/`:fee`, `:invest`…), i.e. an existing user. */
export async function seedLegacyStarters(userId: string): Promise<void> {
  const { STARTER_CATEGORIES } = await import('./fixtures/legacyStarters');
  const now = '2026-11-01T00:00:00.000Z';
  for (const s of STARTER_CATEGORIES) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO personal_categories (id, user_id, parent_id, type, name, icon, hidden, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
    )
      .bind(`${userId}:${s.key}`, userId, s.parentKey ? `${userId}:${s.parentKey}` : null, s.type, s.name, s.icon, s.sortOrder, now, now)
      .run();
  }
}
