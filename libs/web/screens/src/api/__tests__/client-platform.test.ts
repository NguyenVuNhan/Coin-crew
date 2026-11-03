import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../client';
import { sessionStore } from '../../platform/session';
import { fakePlatform } from '../../test/fakePlatform';

describe('client-platform', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    sessionStore.reset();
    vi.unstubAllGlobals();
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('web: same-origin request with cookies and no bearer', async () => {
    await apiFetch('/api/me');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/me');
    expect(init?.credentials).toBe('include');
    const headers = new Headers(init?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('web: device id still comes from localStorage', async () => {
    localStorage.setItem('deviceId', 'd1');
    await apiFetch('/api/me');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('X-Device-Restore')).toBe('d1');
  });

  it('zmp: absolute URL, bearer and no cookies', async () => {
    const p = fakePlatform();
    p.store.set('sessionToken', 's1');
    await sessionStore.init(p);

    await apiFetch('/api/me');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/api/me');
    expect(init?.credentials).toBe('omit');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer s1');
  });

  it('zmp: X-Device-Id is saved through the platform', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Id': 'd9',
          },
        }),
      ),
    );
    const p = fakePlatform();
    await sessionStore.init(p);

    await apiFetch('/api/me');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(p.calls['storage.set']).toContainEqual(['deviceId', 'd9']);
  });

  it('401 clears the session token', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'x' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const p = fakePlatform();
    p.store.set('sessionToken', 's1');
    await sessionStore.init(p);
    expect(sessionStore.token()).toBe('s1');

    await expect(apiFetch('/api/me')).rejects.toThrow();
    expect(sessionStore.token()).toBeNull();
    expect(p.calls['storage.remove']).toContainEqual(['sessionToken']);
  });
});
