import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { decodeIdToken, generateCodeVerifier, generateState } from 'arctic';
import { eq, inArray, sql } from 'drizzle-orm';
import type { UpdateProfileInput } from '@fsl/core';
import { normalizeName } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { participants, sessions, trips, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { nowIso, sha256Hex } from '../lib/ids';
import { GOOGLE_SCOPES, googleClient } from './google';
import { linkIdentity, upsertIdentity } from './identity';
import { buildMeResponse, toMeUserView } from './me';
import { createSession, getSessionUser, requireUser, setSessionCookie } from './session';
import {
  exchangeZaloCode,
  fetchZaloProfile,
  zaloAuthorizeUrl,
  zaloConfigured,
  zaloPkce,
  ZaloError,
} from './zalo';

/** Only same-site paths: "/x" but not "//host" or "/\host" (browsers read a backslash as a slash). */
export function safeReturnTo(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || /[\\\u0000-\u001f]/.test(raw)) return '/trips';
  const base = 'https://app.invalid';
  const url = new URL(raw, base);
  return url.origin === base ? url.pathname + url.search + url.hash : '/trips';
}

export function withQuery(path: string, key: string, value: string): string {
  const hashIndex = path.indexOf('#');
  const base = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : path.slice(hashIndex);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${key}=${encodeURIComponent(value)}${hash}`;
}

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

function clearOauthCookies(c: Context, prefix: 'oauth' | 'zalo_oauth'): void {
  deleteCookie(c, `${prefix}_state`, { path: '/' });
  deleteCookie(c, `${prefix}_verifier`, { path: '/' });
  deleteCookie(c, `${prefix}_return`, { path: '/' });
  deleteCookie(c, `${prefix}_intent`, { path: '/' });
}

export function authRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/auth/google/start', async (c) => {
    const rawReturnTo = c.req.query('returnTo');
    const returnTo =
      safeReturnTo(rawReturnTo);
    const user = await getSessionUser(c);
    const intent = c.req.query('intent') === 'link' && user ? 'link' : 'signin';

    const state = generateState();
    const verifier = generateCodeVerifier();

    const cookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
      path: '/',
      maxAge: 600,
    };
    setCookie(c, 'oauth_state', state, cookieOpts);
    setCookie(c, 'oauth_verifier', verifier, cookieOpts);
    setCookie(c, 'oauth_return', returnTo, cookieOpts);
    setCookie(c, 'oauth_intent', intent, cookieOpts);

    const url = googleClient(c.env).createAuthorizationURL(state, verifier, GOOGLE_SCOPES);
    return c.redirect(url.toString(), 302);
  });

  app.get('/auth/google/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const oauthState = getCookie(c, 'oauth_state');
    const oauthVerifier = getCookie(c, 'oauth_verifier');

    if (!code || !state || !oauthVerifier || state !== oauthState) {
      if (getCookie(c, 'oauth_intent') === 'link') {
        const linkReturn = getCookie(c, 'oauth_return');
        clearOauthCookies(c, 'oauth');
        return c.redirect(
          withQuery(linkReturn ? safeReturnTo(linkReturn) : '/', 'auth', 'failed'),
          302,
        );
      }
      throw new ApiError('VALIDATION', 400, 'Sign-in expired. Please try again.');
    }

    const tokens = await googleClient(c.env).validateAuthorizationCode(code, oauthVerifier);
    const claims = decodeIdToken(tokens.idToken()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    const db = getDb(c.env);
    const oauthReturn = getCookie(c, 'oauth_return');
    const intent = getCookie(c, 'oauth_intent');

    if (intent === 'link') {
      const user = await getSessionUser(c);
      if (!user) {
        clearOauthCookies(c, 'oauth');
        return c.redirect(withQuery(safeReturnTo(oauthReturn), 'auth', 'failed'), 302);
      }
      const outcome = await linkIdentity(db, user.id, 'google', {
        sub: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email,
        avatarUrl: claims.picture ?? null,
      });
      clearOauthCookies(c, 'oauth');
      const target = safeReturnTo(oauthReturn);
      const destination =
        outcome.result === 'linked'
          ? withQuery(target, 'linked', 'google')
          : withQuery(withQuery(target, 'merge', 'requested'), 'provider', 'google');
      return c.redirect(destination, 302);
    }

    const userId = await upsertIdentity(db, 'google', {
      sub: claims.sub,
      email: claims.email,
      name: claims.name ?? claims.email,
      avatarUrl: claims.picture ?? null,
    });

    const token = await createSession(db, userId);
    setSessionCookie(c, token);

    const returnTo = safeReturnTo(oauthReturn);
    clearOauthCookies(c, 'oauth');

    return c.redirect(returnTo, 302);
  });

  app.get('/auth/zalo/start', async (c) => {
    if (!zaloConfigured(c.env)) {
      throw new ApiError('NOT_FOUND', 404);
    }
    const rawReturnTo = c.req.query('returnTo');
    const returnTo = safeReturnTo(rawReturnTo);
    const user = await getSessionUser(c);
    const intent = c.req.query('intent') === 'link' && user ? 'link' : 'signin';

    const state = generateState();
    const { verifier, challenge } = await zaloPkce();

    const cookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax' as const,
      path: '/',
      maxAge: 600,
    };
    setCookie(c, 'zalo_oauth_state', state, cookieOpts);
    setCookie(c, 'zalo_oauth_verifier', verifier, cookieOpts);
    setCookie(c, 'zalo_oauth_return', returnTo, cookieOpts);
    setCookie(c, 'zalo_oauth_intent', intent, cookieOpts);

    return c.redirect(zaloAuthorizeUrl(c.env, state, challenge).toString(), 302);
  });

  app.get('/auth/zalo/callback', async (c) => {
    const oauthState = getCookie(c, 'zalo_oauth_state');
    const oauthVerifier = getCookie(c, 'zalo_oauth_verifier');
    const oauthReturn = getCookie(c, 'zalo_oauth_return');

    // Every failure ends in the same "auth=failed" toast, so the reason only shows in the Worker logs.
    const failure = (reason: string) => {
      console.warn(`Zalo sign-in failed: ${reason}`);
      clearOauthCookies(c, 'zalo_oauth');
      return c.redirect(
        withQuery(oauthReturn ? safeReturnTo(oauthReturn) : '/', 'auth', 'failed'),
        302,
      );
    };

    const error = c.req.query('error');
    const code = c.req.query('code');
    const state = c.req.query('state');

    if (error) {
      return failure(`Zalo returned error=${error}`);
    }
    if (!code || !state) {
      return failure('callback is missing code or state');
    }
    if (!oauthVerifier || !oauthState) {
      return failure('sign-in cookies are missing');
    }
    if (state !== oauthState) {
      return failure('state does not match the cookie');
    }

    let profile: Awaited<ReturnType<typeof fetchZaloProfile>>;
    try {
      const accessToken = await exchangeZaloCode(c.env, code, oauthVerifier);
      profile = await fetchZaloProfile(accessToken);
    } catch (e) {
      if (e instanceof ZaloError) {
        return failure(e.message);
      }
      clearOauthCookies(c, 'zalo_oauth');
      throw e;
    }

    const db = getDb(c.env);
    const intent = getCookie(c, 'zalo_oauth_intent');

    if (intent === 'link') {
      const user = await getSessionUser(c);
      if (!user) {
        return failure('linking Zalo without a signed-in session');
      }
      const outcome = await linkIdentity(db, user.id, 'zalo', profile);
      clearOauthCookies(c, 'zalo_oauth');
      const target = safeReturnTo(oauthReturn);
      const destination =
        outcome.result === 'linked'
          ? withQuery(target, 'linked', 'zalo')
          : withQuery(withQuery(target, 'merge', 'requested'), 'provider', 'zalo');
      return c.redirect(destination, 302);
    }

    const userId = await upsertIdentity(db, 'zalo', profile);
    const token = await createSession(db, userId);
    setSessionCookie(c, token);

    clearOauthCookies(c, 'zalo_oauth');

    return c.redirect(safeReturnTo(oauthReturn), 302);
  });

  app.post('/auth/logout', async (c) => {
    const sid = getCookie(c, 'sid');
    if (sid) {
      const idHash = await sha256Hex(sid);
      const db = getDb(c.env);
      await db.delete(sessions).where(eq(sessions.idHash, idHash));
    }
    deleteCookie(c, 'sid', { path: '/' });
    return c.body(null, 204);
  });

  app.get('/me', async (c) => {
    const user = await getSessionUser(c);
    return c.json(await buildMeResponse(getDb(c.env), c.env, user));
  });

  app.patch('/me', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<UpdateProfileInput>(c);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    let trimmedName: string | undefined;
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
      trimmedName = body.name.trim();
      if (trimmedName.length < 1 || trimmedName.length > 40) {
        throw new ApiError('VALIDATION', 422, 'Name must be between 1 and 40 characters');
      }
    }

    if (body.gender !== undefined && body.gender !== null) {
      if (body.gender !== 'M' && body.gender !== 'F') {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
    }

    if (body.avatarUrl !== undefined && body.avatarUrl !== null) {
      if (
        typeof body.avatarUrl !== 'string' ||
        body.avatarUrl.length > 150000 ||
        (!body.avatarUrl.startsWith('data:image/') && !body.avatarUrl.startsWith('https://'))
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid request');
      }
    }

    const db = getDb(c.env);
    const updates: Partial<typeof users.$inferInsert> = {};
    if (trimmedName !== undefined) {
      updates.name = trimmedName;
    }
    if (body.gender !== undefined) {
      updates.gender = body.gender;
    }
    if (body.avatarUrl !== undefined) {
      updates.avatarUrl = body.avatarUrl;
    }
    if (body.name !== undefined || body.avatarUrl !== undefined) {
      updates.customProfile = 1;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, user.id));
    }

    if (trimmedName !== undefined || body.gender !== undefined) {
      const pUpdates: Partial<typeof participants.$inferInsert> = {};
      if (trimmedName !== undefined) {
        pUpdates.name = trimmedName;
        pUpdates.normalizedName = normalizeName(trimmedName);
      }
      if (body.gender !== undefined) {
        pUpdates.gender = body.gender;
      }

      const userParticipants = await db
        .select({ id: participants.id, tripId: participants.tripId })
        .from(participants)
        .where(eq(participants.userId, user.id));

      if (userParticipants.length > 0) {
        await db
          .update(participants)
          .set(pUpdates)
          .where(eq(participants.userId, user.id));

        const affectedTripIds = Array.from(new Set(userParticipants.map((p) => p.tripId)));
        if (affectedTripIds.length > 0) {
          await db
            .update(trips)
            .set({ version: sql`${trips.version} + 1` })
            .where(inArray(trips.id, affectedTripIds));
        }
      }
    }

    const updatedUser = await db.select().from(users).where(eq(users.id, user.id)).get();
    c.set('user', updatedUser ?? null);

    const userView = toMeUserView(updatedUser!);

    return c.json({ user: userView }, 200);
  });

  app.post('/me/consent', requireUser, async (c) => {
    const user = await getSessionUser(c);
    if (!user) {
      throw new ApiError('UNAUTHENTICATED', 401);
    }
    const db = getDb(c.env);
    const now = nowIso();
    await db.update(users).set({ consentAt: now }).where(eq(users.id, user.id));
    user.consentAt = now;
    return c.body(null, 204);
  });

  return app;
}
