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

/** Approved mockup expenses (docs/superpowers/mockups/v1-flow.html), created by Minh. */
export async function seedExpenses(): Promise<void> {
  const all = [PID.M, PID.A, PID.B, PID.C];
  const rows: [string, string, string, number, string[]][] = [
    ['e-1', 'Homestay Bloom · 2 nights', PID.M, 3200000, all],
    ['e-2', 'Lẩu gà lá é', PID.A, 860000, all],
    ['e-3', 'Motorbike rental + fuel', PID.B, 600000, all],
    ['e-4', 'Cà phê Túi Mơ To', PID.M, 240000, [PID.M, PID.A, PID.C]],
  ];
  for (const [id, description, payer, amount, people] of rows) {
    await sql("INSERT OR IGNORE INTO expenses (id, trip_id, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, ?, ?)",
      id, T.tripId, description, amount, payer, PID.M, '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z');
    for (const p of people) {
      await sql('INSERT OR IGNORE INTO expense_shares (expense_id, participant_id, input_value, amount) VALUES (?, ?, 1, ?)', id, p, amount / people.length);
    }
  }
}

/** Approved bank details on Minh's profile. */
export async function seedMinhBank(): Promise<void> {
  await sql("INSERT OR IGNORE INTO bank_details (id, user_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-minh', ?, '970407', '19031234565678', 'NGUYEN VAN MINH', 'approved', ?, ?)",
    U.minh, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z');
}

/** Turn a guest participant into a signed-in member and return their session cookie. */
export async function linkMember(participantId: string, userId: string, name: string): Promise<string> {
  const sid = await memberSid(userId, name);
  await sql('UPDATE participants SET user_id = ? WHERE id = ?', userId, participantId);
  return sid;
}

/** Headers for a guest device that picked `participantId` (or nobody). */
export async function guestHeaders(participantId?: string, token: string = T.groupToken): Promise<Record<string, string>> {
  const { deviceId, cookie } = await newDevice();
  if (participantId) await pickAs(deviceId, participantId);
  return { Cookie: cookie, 'X-Link-Token': token };
}

export async function json<R>(res: Response | Promise<Response>): Promise<R> {
  return (await (await res).json()) as R;
}

export const byKey = <X extends { fromId: string; toId: string }>(ts: X[]) =>
  [...ts].sort((x, y) => (x.fromId + x.toId).localeCompare(y.fromId + y.toId));
