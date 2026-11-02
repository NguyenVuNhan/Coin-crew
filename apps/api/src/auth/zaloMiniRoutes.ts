import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import type { ZaloMiniRequest, ZaloMiniResponse } from '@fsl/core';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { devices, users } from '../db/schema';
import type { AppBindings } from '../env';
import { ApiError } from '../lib/errors';
import { nowIso, sha256Hex } from '../lib/ids';
import { upsertIdentity } from './identity';
import { createSession } from './session';
import { fetchZaloProfile, zaloConfigured, ZaloError } from './zalo';
import { zaloDeviceId } from './zaloMini';
import { linkZaloSlots } from './zaloSlots';

const MAX_TOKEN = 2048;
const MAX_NAME = 80;
const MAX_AVATAR = 2048;

type Parsed = {
  accessToken: string;
  consent: boolean;
  profile: { name: string; avatar: string | null } | null;
};

function invalid(message = 'Invalid request'): never {
  throw new ApiError('VALIDATION', 422, message);
}

function parseBody(raw: unknown): Parsed {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const body = raw as Partial<Record<keyof ZaloMiniRequest, unknown>>;

  const { accessToken } = body;
  if (typeof accessToken !== 'string' || accessToken.length === 0 || accessToken.length > MAX_TOKEN) {
    invalid('accessToken is required');
  }

  if (body.consent !== undefined && body.consent !== true) invalid();
  const consent = body.consent === true;

  let profile: Parsed['profile'] = null;
  if (body.profile !== undefined) {
    const p = body.profile as { name?: unknown; avatar?: unknown } | null;
    if (!p || typeof p !== 'object' || Array.isArray(p)) invalid();
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (name.length < 1 || name.length > MAX_NAME) invalid('profile.name must be 1 to 80 characters');
    let avatar: string | null = null;
    if (p.avatar !== undefined && p.avatar !== null) {
      if (typeof p.avatar !== 'string' || p.avatar.length > MAX_AVATAR || !p.avatar.startsWith('https://')) {
        invalid('profile.avatar must be an https URL');
      }
      avatar = p.avatar;
    }
    profile = { name, avatar };
  }

  if (consent && !profile) invalid('consent needs the Zalo profile');
  return { accessToken, consent, profile };
}

/** Bind the shared Zalo device id to the verified Zalo account (the only place devices.zalo_sub is written). */
async function tieZaloDevice(db: Db, deviceId: string, zaloSub: string): Promise<void> {
  const now = nowIso();
  await db
    .insert(devices)
    .values({ idHash: await sha256Hex(deviceId), zaloSub, createdAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: devices.idHash, set: { zaloSub } });
}

export function zaloMiniRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.post('/auth/zalo-mini', async (c) => {
    const appSecret = c.env.ZALO_APP_SECRET;
    const deviceSecret = c.env.DEVICE_SECRET;
    if (!zaloConfigured(c.env) || !appSecret || !deviceSecret) {
      throw new ApiError('INTERNAL', 503, 'Zalo sign-in is not configured');
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      invalid();
    }
    const body = parseBody(raw);

    let profile: Awaited<ReturnType<typeof fetchZaloProfile>>;
    try {
      profile = await fetchZaloProfile(body.accessToken, c.env, { appSecret });
    } catch (e) {
      if (e instanceof ZaloError) {
        console.warn(`Zalo mini sign-in failed: ${e.message}`);
        throw new ApiError('ZALO_TOKEN_INVALID', 401, 'Zalo sign-in failed');
      }
      throw e;
    }

    const db = getDb(c.env);
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.zaloSub, profile.sub))
      .get();

    // Never set the sid cookie here: the Mini App keeps the session token itself (bearer).
    if (existing) {
      const sessionToken = await createSession(db, existing.id);
      await linkZaloSlots(db, existing.id, profile.sub);
      return c.json({ status: 'signed_in', sessionToken } satisfies ZaloMiniResponse, 200);
    }

    const deviceId = await zaloDeviceId(deviceSecret, profile.sub);

    if (!body.consent) {
      // No account without the user tapping "Tiếp tục với tài khoản Zalo".
      await tieZaloDevice(db, deviceId, profile.sub);
      return c.json({ status: 'guest', deviceId } satisfies ZaloMiniResponse, 200);
    }

    // Graph's name and avatar win; the SDK's (client-sent) ones only stand in when Graph withheld them.
    const clientProfile = body.profile!;
    const userId = await upsertIdentity(
      db,
      'zalo',
      profile.nameWithheld
        ? { sub: profile.sub, name: clientProfile.name, avatarUrl: clientProfile.avatar }
        : { sub: profile.sub, name: profile.name, avatarUrl: profile.avatarUrl },
    );
    // The user just consented by tapping the button (same field /me/consent sets).
    await db
      .update(users)
      .set({ consentAt: nowIso() })
      .where(and(eq(users.id, userId), isNull(users.consentAt)));
    await tieZaloDevice(db, deviceId, profile.sub);
    const sessionToken = await createSession(db, userId);
    await linkZaloSlots(db, userId, profile.sub);
    return c.json({ status: 'signed_in', sessionToken } satisfies ZaloMiniResponse, 200);
  });

  return app;
}
