import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { decodeIdToken, generateCodeVerifier, generateState } from 'arctic';
import { eq, inArray, sql } from 'drizzle-orm';
import type { MeUserView, UpdateProfileInput } from '@fsl/core';
import { normalizeName } from '@fsl/core';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { participants, sessions, trips, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newId, nowIso, sha256Hex } from '../lib/ids';
import { GOOGLE_SCOPES, googleClient } from './google';
import { createSession, getSessionUser, requireUser, setSessionCookie } from './session';

/** Only same-site paths: "/x" but not "//host" or "/\host" (browsers read a backslash as a slash). */
export function safeReturnTo(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || /[\\\u0000-\u001f]/.test(raw)) return '/trips';
  const base = 'https://app.invalid';
  const url = new URL(raw, base);
  return url.origin === base ? url.pathname + url.search + url.hash : '/trips';
}

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

export function authRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/auth/google/start', (c) => {
    const rawReturnTo = c.req.query('returnTo');
    const returnTo =
      safeReturnTo(rawReturnTo);

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

    const url = googleClient(c.env).createAuthorizationURL(state, verifier, GOOGLE_SCOPES);
    return c.redirect(url.toString(), 302);
  });

  app.get('/auth/google/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const oauthState = getCookie(c, 'oauth_state');
    const oauthVerifier = getCookie(c, 'oauth_verifier');

    if (!code || !state || !oauthVerifier || state !== oauthState) {
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
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.googleSub, claims.sub))
      .get();

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      const updates: Partial<typeof users.$inferInsert> = {
        email: claims.email,
      };
      if (existingUser.customProfile === 0) {
        updates.name = claims.name ?? claims.email;
      }
      if ((existingUser.customProfile === 0 || !existingUser.avatarUrl) && claims.picture) {
        updates.avatarUrl = claims.picture;
      }
      await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId));
    } else {
      userId = newId();
      await db.insert(users).values({
        id: userId,
        googleSub: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email,
        avatarUrl: claims.picture ?? null,
        customProfile: 0,
        createdAt: nowIso(),
      });
    }

    const token = await createSession(db, userId);
    setSessionCookie(c, token);

    const oauthReturn = getCookie(c, 'oauth_return');
    const returnTo =
      safeReturnTo(oauthReturn);

    deleteCookie(c, 'oauth_state', { path: '/' });
    deleteCookie(c, 'oauth_verifier', { path: '/' });
    deleteCookie(c, 'oauth_return', { path: '/' });

    return c.redirect(returnTo, 302);
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
    const userView: MeUserView | null = user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          gender: (user.gender as 'M' | 'F' | null) ?? null,
          avatarUrl: user.avatarUrl ?? null,
          consentAt: user.consentAt,
        }
      : null;
    return c.json({ user: userView });
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

    const userView: MeUserView = {
      id: updatedUser!.id,
      email: updatedUser!.email,
      name: updatedUser!.name,
      gender: (updatedUser!.gender as 'M' | 'F' | null) ?? null,
      avatarUrl: updatedUser!.avatarUrl ?? null,
      consentAt: updatedUser!.consentAt,
    };

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
