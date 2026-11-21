import { Google } from 'arctic';
import type { Env } from '@cc/api-db/env';

export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

/** `origin` is where the browser started sign-in (see `requestOrigin`); start and callback must agree. */
export function googleClient(env: Env, origin: string = env.APP_ORIGIN): Google {
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${origin}/api/auth/google/callback`,
  );
}
