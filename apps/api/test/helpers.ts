import { env } from 'cloudflare:test';
import { createApp } from '../src/app';

export const app = createApp();

export function call(path: string, init: RequestInit = {}): Promise<Response> {
  return Promise.resolve(app.request(path, init, env));
}

/** name=value pairs from every Set-Cookie header, ignoring attributes. */
export function cookiesFrom(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const i = pair.indexOf('=');
    out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

export function unsignedJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.sig`;
}

export const T = { tripId: 't-1', groupToken: 'gtok-1', viewToken: 'vtok-1' } as const;
export const U = { minh: 'u-minh', an: 'u-an' } as const;
export const PID = { M: 'p-minh', A: 'p-an', B: 'p-binh', C: 'p-chi' } as const;

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

export async function seedUser(id: string, name: string): Promise<void> {
  await sql('INSERT OR IGNORE INTO users (id, google_sub, email, name, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, `g-${id}`, `${id}@example.com`, name, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z');
}

/** A session cookie value for the user (creates the user if needed). */
export async function memberSid(userId: string, name = userId): Promise<string> {
  const { sha256Hex } = await import('../src/lib/ids');
  await seedUser(userId, name);
  const sid = `sid-${userId}-${crypto.randomUUID()}`;
  await sql('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)', await sha256Hex(sid), userId, '2099-01-01T00:00:00.000Z');
  return sid;
}

/** The mockup trip "Đà Lạt · Oct 2026": Minh (organiser, member), An, Bình, Chi (guests). */
export async function seedTrip(): Promise<void> {
  await seedUser(U.minh, 'Minh');
  await sql('INSERT OR IGNORE INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, 0, ?)',
    T.tripId, 'Đà Lạt · Oct 2026', 'VND', U.minh, T.groupToken, T.viewToken, '2026-10-12T00:00:00.000Z');
  const people: [string, string, string, string | null][] = [[PID.M, 'Minh', 'minh', U.minh], [PID.A, 'An', 'an', null], [PID.B, 'Bình', 'binh', null], [PID.C, 'Chi', 'chi', null]];
  for (const [i, [id, name, norm, userId]] of people.entries()) {
    await sql("INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      id, T.tripId, name, norm, userId, i, '2026-10-12T00:00:00.000Z');
  }
}

/** A new device: returns its id (as the browser would store it) and its cookie header. */
export async function newDevice(): Promise<{ deviceId: string; cookie: string }> {
  const res = await call('/api/health');
  const deviceId = res.headers.get('X-Device-Id')!;
  return { deviceId, cookie: `did=${deviceId}` };
}

/** Make a device's current pick in the trip (as POST people/pick will do in Task 11). */
export async function pickAs(deviceId: string, participantId: string, tripId: string = T.tripId): Promise<void> {
  const { sha256Hex } = await import('../src/lib/ids');
  await sql('INSERT OR REPLACE INTO device_participants (device_hash, trip_id, participant_id, last_used_at) VALUES (?, ?, ?, ?)',
    await sha256Hex(deviceId), tripId, participantId, new Date().toISOString());
}
