import { describe, it, expect, vi } from 'vitest';
import { createApp, UPSTREAM_URL } from '../src/app';

describe('Zalo profile relay app', () => {
  it('exports UPSTREAM_URL', () => {
    expect(UPSTREAM_URL).toBe('https://graph.zalo.me/v2.0/me');
  });

  it("throws 'ZALO_RELAY_SECRET is required' when secret is empty", () => {
    expect(() => createApp({ secret: '' })).toThrow('ZALO_RELAY_SECRET is required');
  });

  it("/health 200 'ok' without auth, fetch not called", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const app = createApp({ secret: 'test-secret', fetch: fetchMock });

    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/me?fields=id without Authorization -> 401; with \'Bearer wrong\' -> 401; fetch not called', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const app = createApp({ secret: 'test-secret', fetch: fetchMock });

    // without Authorization
    const resWithoutAuth = await app.request('/me?fields=id');
    expect(resWithoutAuth.status).toBe(401);
    expect(await resWithoutAuth.json()).toEqual({ error: 'unauthorized' });

    // with Bearer wrong
    const resWrongSecret = await app.request('/me?fields=id', {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(resWrongSecret.status).toBe(401);
    expect(await resWrongSecret.json()).toEqual({ error: 'unauthorized' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('right secret, fields=email -> 400; no fields -> 400; fetch not called', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const app = createApp({ secret: 'test-secret', fetch: fetchMock });

    // fields=email
    const resBadFields = await app.request('/me?fields=email', {
      headers: { Authorization: 'Bearer test-secret' },
    });
    expect(resBadFields.status).toBe(400);
    expect(await resBadFields.json()).toEqual({ error: 'bad fields' });

    // no fields
    const resNoFields = await app.request('/me', {
      headers: { Authorization: 'Bearer test-secret' },
    });
    expect(resNoFields.status).toBe(400);
    expect(await resNoFields.json()).toEqual({ error: 'bad fields' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('right secret, fields=id, no X-Zalo-Access-Token -> 400; fetch not called', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const app = createApp({ secret: 'test-secret', fetch: fetchMock });

    const res = await app.request('/me?fields=id', {
      headers: { Authorization: 'Bearer test-secret' },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('right secret, fields=id,name,picture, X-Zalo-Access-Token: tok -> fetch called once with URL \'https://graph.zalo.me/v2.0/me?fields=id,name,picture\' and header access_token \'tok\'; response 200 with body {id:\'123\',name:\'An\'} passed through', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: '123', name: 'An' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const app = createApp({ secret: 'test-secret', fetch: fetchMock });

    const res = await app.request('/me?fields=id,name,picture', {
      headers: {
        Authorization: 'Bearer test-secret',
        'X-Zalo-Access-Token': 'tok',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('Expected fetch to have been called');

    const [url, init] = call;
    expect(url).toBe('https://graph.zalo.me/v2.0/me?fields=id,name,picture');
    expect(init?.method).toBe('GET');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.access_token).toBe('tok');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ id: '123', name: 'An' });
  });

  it('upstream 500 with JSON body {error:1} -> relay 500 same body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: 1 }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );
    const app = createApp({ secret: 'test-secret', fetch: fetchMock });

    const res = await app.request('/me?fields=id', {
      headers: {
        Authorization: 'Bearer test-secret',
        'X-Zalo-Access-Token': 'tok',
      },
    });

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 1 });
  });

  it("fetch rejects new TypeError('fail') -> 502; rejects DOMException('t','TimeoutError') -> 504; rejects DOMException('a','AbortError') -> 504", async () => {
    // TypeError -> 502
    const fetchTypeError = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fail'));
    const app1 = createApp({ secret: 'test-secret', fetch: fetchTypeError });
    const res1 = await app1.request('/me?fields=id', {
      headers: {
        Authorization: 'Bearer test-secret',
        'X-Zalo-Access-Token': 'tok',
      },
    });
    expect(res1.status).toBe(502);
    expect(await res1.json()).toEqual({ error: 'upstream unreachable' });

    // DOMException('t', 'TimeoutError') -> 504
    const fetchTimeout = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('t', 'TimeoutError'));
    const app2 = createApp({ secret: 'test-secret', fetch: fetchTimeout });
    const res2 = await app2.request('/me?fields=id', {
      headers: {
        Authorization: 'Bearer test-secret',
        'X-Zalo-Access-Token': 'tok',
      },
    });
    expect(res2.status).toBe(504);
    expect(await res2.json()).toEqual({ error: 'upstream timeout' });

    // DOMException('a', 'AbortError') -> 504
    const fetchAbort = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('a', 'AbortError'));
    const app3 = createApp({ secret: 'test-secret', fetch: fetchAbort });
    const res3 = await app3.request('/me?fields=id', {
      headers: {
        Authorization: 'Bearer test-secret',
        'X-Zalo-Access-Token': 'tok',
      },
    });
    expect(res3.status).toBe(504);
    expect(await res3.json()).toEqual({ error: 'upstream timeout' });
  });

  it('GET /anything -> 404', async () => {
    const app = createApp({ secret: 'test-secret' });
    const res = await app.request('/anything');
    expect(res.status).toBe(404);
  });

  it('log spy: after a successful /me, log called once, and no logged line contains \'tok\' or the secret', async () => {
    const logSpy = vi.fn<(line: string) => void>();
    const secret = 'super-secret-key-123';
    const token = 'my-zalo-token-456';

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: '123', name: 'An' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const app = createApp({
      secret,
      fetch: fetchMock,
      log: logSpy,
    });

    const res = await app.request('/me?fields=id,name,picture', {
      headers: {
        Authorization: `Bearer ${secret}`,
        'X-Zalo-Access-Token': token,
      },
    });

    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledTimes(1);

    const call = logSpy.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error('Expected log spy to have been called');

    const loggedLine = call[0];
    expect(loggedLine).toMatch(/^GET \/me 200 \d+ms$/);
    expect(loggedLine).not.toContain(secret);
    expect(loggedLine).not.toContain(token);
  });
});
