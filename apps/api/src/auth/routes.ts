import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { decodeIdToken, generateCodeVerifier, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import type { AppBindings } from '../env';
import { getDb } from '../db/client';
import { sessions, users } from '../db/schema';
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
    const claims = decodeIdToken(tokens.idToken()) as { sub: string; email: string; name?: string };

    const db = getDb(c.env);
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.googleSub, claims.sub))
      .get();

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      await db
        .update(users)
        .set({
          email: claims.email,
          name: claims.name ?? claims.email,
        })
        .where(eq(users.id, userId));
    } else {
      userId = newId();
      await db.insert(users).values({
        id: userId,
        googleSub: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email,
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
    return c.json({
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            consentAt: user.consentAt,
          }
        : null,
    });
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
