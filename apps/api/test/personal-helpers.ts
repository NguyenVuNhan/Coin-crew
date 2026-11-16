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
