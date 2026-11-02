import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchZaloProfile } from '../src/auth/zalo';

const relayEnv = { ZALO_RELAY_URL: 'https://relay.example', ZALO_RELAY_SECRET: 's3cret' };
const fullProfile = { id: '123', name: 'An', picture: { data: { url: 'https://a/p.jpg' } } };

type Call = { url: string; headers: Headers };

function mockFetch(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const call = {
      url: input instanceof Request ? input.url : String(input),
      headers: new Headers(input instanceof Request ? input.headers : init?.headers),
    };
    calls.push(call);
    return handler(call);
  });
  return calls;
}

const isRelay = (c: Call) => c.url.startsWith('https://relay.example');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchZaloProfile through the DSM relay', () => {
  it('uses the relay and never sends the token as access_token to it', async () => {
    const calls = mockFetch(() => Response.json(fullProfile));
    const profile = await fetchZaloProfile('tok', relayEnv);

    expect(profile).toEqual({ sub: '123', name: 'An', avatarUrl: 'https://a/p.jpg' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://relay.example/me?fields=id,name,picture');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer s3cret');
    expect(calls[0]!.headers.get('x-zalo-access-token')).toBe('tok');
    expect(calls[0]!.headers.get('access_token')).toBeNull();
  });

  it('Mini App sign-in: the relay gets the appsecret proof as X-Zalo-Appsecret-Proof', async () => {
    const calls = mockFetch(() => Response.json(fullProfile));
    await fetchZaloProfile('tok', relayEnv, { appSecret: 'app-secret' });

    expect(calls).toHaveLength(1);
    expect(isRelay(calls[0]!)).toBe(true);
    expect(calls[0]!.headers.get('x-zalo-appsecret-proof')).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0]!.headers.get('appsecret_proof')).toBeNull();
  });

  it('Mini App sign-in: falling back to Zalo directly still sends appsecret_proof', async () => {
    const calls = mockFetch((c) => (isRelay(c) ? new Response('bad', { status: 502 }) : Response.json(fullProfile)));
    await fetchZaloProfile('tok', relayEnv, { appSecret: 'app-secret' });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers.get('appsecret_proof')).toBe(calls[0]!.headers.get('x-zalo-appsecret-proof'));
  });

  it('copes with a trailing slash on the relay URL', async () => {
    const calls = mockFetch(() => Response.json(fullProfile));
    await fetchZaloProfile('tok', { ...relayEnv, ZALO_RELAY_URL: 'https://relay.example/' });
    expect(calls[0]!.url).toBe('https://relay.example/me?fields=id,name,picture');
  });

  it('marks the name withheld when the relay returns only the id', async () => {
    const calls = mockFetch(() => Response.json({ id: '123' }));
    const profile = await fetchZaloProfile('tok', relayEnv);
    expect(profile).toEqual({ sub: '123', name: 'Zalo', avatarUrl: null, nameWithheld: true });
    expect(calls).toHaveLength(1);
  });

  it('falls back to Zalo directly when the relay answers 502', async () => {
    const calls = mockFetch((c) =>
      isRelay(c) ? new Response('bad gateway', { status: 502 }) : Response.json(fullProfile),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const profile = await fetchZaloProfile('tok', relayEnv);

    expect(profile).toEqual({ sub: '123', name: 'An', avatarUrl: 'https://a/p.jpg' });
    expect(calls[1]!.url).toBe('https://graph.zalo.me/v2.0/me?fields=id,name,picture');
    expect(calls[1]!.headers.get('access_token')).toBe('tok');
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('tok');
    expect(logged).not.toContain('s3cret');
  });

  it('falls back when the relay is unreachable', async () => {
    const calls = mockFetch((c) => {
      if (isRelay(c)) throw new TypeError('network down');
      return Response.json(fullProfile);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const profile = await fetchZaloProfile('tok', relayEnv);
    expect(profile.name).toBe('An');
    expect(calls.map((c) => isRelay(c))).toEqual([true, false]);
  });

  it('falls back when the relay passes on a Zalo error', async () => {
    const calls = mockFetch((c) =>
      isRelay(c)
        ? Response.json({ error: -501, message: 'IP address not inside Vietnam' })
        : Response.json(fullProfile),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const profile = await fetchZaloProfile('tok', relayEnv);
    expect(profile.name).toBe('An');
    expect(calls).toHaveLength(2);
  });

  it.each([
    ['no env', undefined],
    ['URL only', { ZALO_RELAY_URL: 'https://relay.example' }],
    ['secret only', { ZALO_RELAY_SECRET: 's3cret' }],
    ['empty values', { ZALO_RELAY_URL: '', ZALO_RELAY_SECRET: '' }],
  ])('skips the relay with %s', async (_label, env) => {
    const calls = mockFetch(() => Response.json(fullProfile));
    await fetchZaloProfile('tok', env);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://graph.zalo.me/v2.0/me?fields=id,name,picture');
  });
});
