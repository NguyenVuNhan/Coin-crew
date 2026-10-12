import { Google } from 'arctic';
import type { Env } from '../env';

export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

export function googleClient(env: Env): Google {
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.APP_ORIGIN}/api/auth/google/callback`,
  );
}
