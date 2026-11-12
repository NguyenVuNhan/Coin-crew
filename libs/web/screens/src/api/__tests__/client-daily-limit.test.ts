import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiClientError } from '@cc/web-data-access/client';
import { sessionStore } from '@cc/web-platform/session';

function respond(body: string, status: number, contentType: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status, headers: { 'Content-Type': contentType } })));
}

async function caught(): Promise<ApiClientError> {
  try {
    await apiFetch('/api/me');
  } catch (err) {
    return err as ApiClientError;
  }
  throw new Error('expected apiFetch to throw');
}

describe('apiFetch: Cloudflare daily limit', () => {
  afterEach(() => {
    sessionStore.reset();
    vi.unstubAllGlobals();
  });

  it("Cloudflare's plain-text 1027 answer becomes DAILY_LIMIT", async () => {
    respond('error code: 1027', 429, 'text/plain');
    expect((await caught()).code).toBe('DAILY_LIMIT');
  });

  it("Cloudflare's HTML 1027 page becomes DAILY_LIMIT", async () => {
    respond('<html><head><title>Worker exceeded resource limits</title></head><body><span>Error 1027</span></body></html>', 429, 'text/html');
    expect((await caught()).code).toBe('DAILY_LIMIT');
  });

  it('our own JSON DAILY_LIMIT still comes through', async () => {
    respond(JSON.stringify({ error: { code: 'DAILY_LIMIT', message: 'm' } }), 503, 'application/json');
    expect((await caught()).code).toBe('DAILY_LIMIT');
  });

  it('any other non-JSON error stays INTERNAL', async () => {
    respond('<html><body>Bad gateway</body></html>', 502, 'text/html');
    const err = await caught();
    expect(err.code).toBe('INTERNAL');
    expect(err.status).toBe(502);
  });
});
