import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  zaloPkce,
  s256Challenge,
  zaloAuthorizeUrl,
  exchangeZaloCode,
  fetchZaloProfile,
  ZaloError,
} from '../src/auth/zalo';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Zalo OAuth helpers', () => {
  it('S256 matches RFC 7636', async () => {
    const challenge = await s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('makes a 43-character verifier', async () => {
    const { verifier, challenge } = await zaloPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(await s256Challenge(verifier));
  });

  it('builds the authorize URL', () => {
    const url = zaloAuthorizeUrl(env, 'test-state', 'test-challenge');
    expect(url).toBeInstanceOf(URL);
    expect(url.host).toBe('oauth.zaloapp.com');
    expect(url.pathname).toBe('/v4/permission');
    expect(url.searchParams.get('app_id')).toBe('test-zalo-app');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:8787/api/auth/zalo/callback');
    expect(url.searchParams.get('code_challenge')).toBe('test-challenge');
    expect(url.searchParams.get('state')).toBe('test-state');
  });

  it('exchanges the code', async () => {
    let capturedUrl = '';
    let capturedMethod = 'GET';
    let capturedHeaders = new Headers();
    let capturedBody = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input instanceof Request) {
        capturedUrl = input.url;
        capturedMethod = input.method;
        capturedHeaders = input.headers;
        capturedBody = await input.clone().text();
      } else {
        capturedUrl = String(input);
        capturedMethod = init?.method ?? 'GET';
        capturedHeaders = new Headers(init?.headers);
        if (typeof init?.body === 'string') {
          capturedBody = init.body;
        } else if (init?.body instanceof URLSearchParams) {
          capturedBody = init.body.toString();
        } else if (init?.body) {
          capturedBody = String(init.body);
        }
      }

      return Response.json({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: '3600',
      });
    });

    const token = await exchangeZaloCode(env, 'test-code', 'test-verifier');
    expect(token).toBe('at');

    expect(capturedUrl).toBe('https://oauth.zaloapp.com/v4/access_token');
    expect(capturedMethod).toBe('POST');
    expect(capturedHeaders.get('secret_key')).toBe('test-zalo-secret');
    expect(capturedHeaders.get('content-type')).toContain('application/x-www-form-urlencoded');

    const params = new URLSearchParams(capturedBody);
    expect(params.get('code')).toBe('test-code');
    expect(params.get('app_id')).toBe('test-zalo-app');
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code_verifier')).toBe('test-verifier');
  });

  it('treats an error inside a 200 as failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return Response.json(
        { error: -14002, error_name: 'Invalid code' },
        { status: 200 },
      );
    });

    await expect(exchangeZaloCode(env, 'bad-code', 'test-verifier')).rejects.toThrow(ZaloError);
  });

  it('treats non-2xx, bad JSON and a missing token as failure', async () => {
    // 1. Non-2xx
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      return new Response('Server error', { status: 500 });
    });
    await expect(exchangeZaloCode(env, 'test-code', 'test-verifier')).rejects.toThrow(ZaloError);

    // 2. Bad JSON
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      return new Response('<html>not-json</html>', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    await expect(exchangeZaloCode(env, 'test-code', 'test-verifier')).rejects.toThrow(ZaloError);

    // 3. Missing access_token
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      return Response.json({ refresh_token: 'rt', expires_in: '3600' }, { status: 200 });
    });
    await expect(exchangeZaloCode(env, 'test-code', 'test-verifier')).rejects.toThrow(ZaloError);
  });

  it('reads the profile', async () => {
    let capturedUrl = '';
    let capturedMethod = 'GET';
    let capturedHeaders = new Headers();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input instanceof Request) {
        capturedUrl = input.url;
        capturedMethod = input.method;
        capturedHeaders = input.headers;
      } else {
        capturedUrl = String(input);
        capturedMethod = init?.method ?? 'GET';
        capturedHeaders = new Headers(init?.headers);
      }

      return Response.json({
        id: '84123',
        name: 'Chi Nguyễn',
        picture: { data: { url: 'https://s120-ava-talk.zadn.vn/a.jpg' } },
        error: 0,
        message: 'Success',
      });
    });

    const profile = await fetchZaloProfile('at');

    expect(capturedUrl).toBe('https://graph.zalo.me/v2.0/me?fields=id,name,picture');
    expect(capturedMethod).toBe('GET');
    expect(capturedHeaders.get('access_token')).toBe('at');

    expect(profile).toEqual({
      sub: '84123',
      name: 'Chi Nguyễn',
      avatarUrl: 'https://s120-ava-talk.zadn.vn/a.jpg',
    });
  });

  it('a profile error in a 200 is failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return Response.json({ error: 452, message: 'Session key invalid' }, { status: 200 });
    });

    await expect(fetchZaloProfile('bad-token')).rejects.toThrow(ZaloError);
  });

  it('falls back to the id alone when Zalo withholds personal information', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('fields=id')) {
        return Response.json({ id: '84123', error: 0, message: 'Success' });
      }
      return Response.json({
        error: -2003,
        message: 'Personal information is limited due to IP address not inside Vietnam: 162.158.106.64',
      });
    });

    const profile = await fetchZaloProfile('at');

    expect(urls).toEqual([
      'https://graph.zalo.me/v2.0/me?fields=id,name,picture',
      'https://graph.zalo.me/v2.0/me?fields=id',
    ]);
    expect(profile).toEqual({ sub: '84123', name: 'Zalo', avatarUrl: null, nameWithheld: true });
  });

  it('fails with both errors when the id alone is refused too', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return String(input).endsWith('fields=id')
        ? Response.json({ error: -2003, message: 'id refused' })
        : Response.json({ error: -2003, message: 'profile refused' });
    });

    await expect(fetchZaloProfile('at')).rejects.toThrow(
      'Zalo profile error: profile refused; with the id alone: id refused',
    );
  });

  it('a numeric id is rejected (precision loss)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return Response.json({ id: 1234567890123456789, name: 'X' });
    });

    await expect(fetchZaloProfile('at')).rejects.toThrow(ZaloError);
  });
});
