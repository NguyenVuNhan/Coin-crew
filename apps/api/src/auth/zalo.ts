import { generateCodeVerifier } from 'arctic';
import type { Env } from '../env';

export { zaloConfigured } from './me';

export class ZaloError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZaloError';
  }
}

export async function s256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function zaloPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateCodeVerifier();
  const challenge = await s256Challenge(verifier);
  return { verifier, challenge };
}

export function zaloAuthorizeUrl(env: Env, state: string, challenge: string): URL {
  const url = new URL('https://oauth.zaloapp.com/v4/permission');
  url.searchParams.set('app_id', env.ZALO_APP_ID ?? '');
  url.searchParams.set('redirect_uri', `${env.APP_ORIGIN}/api/auth/zalo/callback`);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('state', state);
  return url;
}

interface ZaloTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string | number;
  error?: number | string;
  error_name?: string;
  message?: string;
}

export async function exchangeZaloCode(
  env: Env,
  code: string,
  verifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    code,
    app_id: env.ZALO_APP_ID ?? '',
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });

  let res: Response;
  try {
    res = await fetch('https://oauth.zaloapp.com/v4/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: env.ZALO_APP_SECRET ?? '',
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    if (err instanceof ZaloError) {
      throw err;
    }
    throw new ZaloError(`Failed to exchange Zalo code: ${(err as Error).message}`, {
      cause: err,
    });
  }

  if (!res.ok) {
    throw new ZaloError(`Zalo access token request failed with status ${res.status}`);
  }

  let data: ZaloTokenResponse;
  try {
    data = (await res.json()) as ZaloTokenResponse;
  } catch (err) {
    throw new ZaloError('Zalo access token response is not valid JSON', {
      cause: err,
    });
  }

  if (!data || typeof data !== 'object') {
    throw new ZaloError('Zalo access token response is not an object');
  }

  if (data.error != null && data.error !== 0 && data.error !== '0') {
    const message = data.error_name ?? data.message ?? String(data.error);
    throw new ZaloError(`Zalo access token error: ${message}`);
  }

  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new ZaloError('Zalo access token response missing access_token');
  }

  return data.access_token;
}

interface ZaloProfileResponse {
  id?: string | number;
  name?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
  error?: number | string;
  error_name?: string;
  message?: string;
}

export async function fetchZaloProfile(
  accessToken: string,
): Promise<{ sub: string; name: string; avatarUrl: string | null }> {
  let res: Response;
  try {
    res = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      method: 'GET',
      headers: {
        access_token: accessToken,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    if (err instanceof ZaloError) {
      throw err;
    }
    throw new ZaloError(`Failed to fetch Zalo profile: ${(err as Error).message}`, {
      cause: err,
    });
  }

  if (!res.ok) {
    throw new ZaloError(`Zalo profile request failed with status ${res.status}`);
  }

  let data: ZaloProfileResponse;
  try {
    data = (await res.json()) as ZaloProfileResponse;
  } catch (err) {
    throw new ZaloError('Zalo profile response is not valid JSON', {
      cause: err,
    });
  }

  if (!data || typeof data !== 'object') {
    throw new ZaloError('Zalo profile response is not an object');
  }

  if (data.error != null && data.error !== 0 && data.error !== '0') {
    const message = data.message ?? data.error_name ?? String(data.error);
    throw new ZaloError(`Zalo profile error: ${message}`);
  }

  // A JSON number would lose precision for ~19-digit ids; only accept strings.
  if (typeof data.id !== 'string' || data.id === '') {
    throw new ZaloError('Zalo profile response missing id');
  }

  const sub = data.id;
  const rawName = typeof data.name === 'string' ? data.name.trim() : '';
  const name = rawName.length > 0 ? rawName : 'Zalo';
  const rawAvatarUrl = data.picture?.data?.url;
  const avatarUrl =
    typeof rawAvatarUrl === 'string' && rawAvatarUrl.trim().length > 0
      ? rawAvatarUrl.trim()
      : null;

  return { sub, name, avatarUrl };
}
