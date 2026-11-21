import { describe, expect, it } from 'vitest';
import { requestOrigin } from '@cc/api-util/origin';

const headers = (h: Record<string, string>) => (name: string) => h[name.toLowerCase()];

describe('requestOrigin', () => {
  it('uses the request URL when no proxy speaks', () => {
    expect(requestOrigin('http://localhost:8787/api/auth/google/start', headers({}))).toBe('http://localhost:8787');
  });

  it("follows a TLS-terminating proxy's forwarded proto and host", () => {
    const h = headers({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'coincrew-dev.example.me' });
    expect(requestOrigin('http://192.168.1.5:8787/api/auth/google/start', h)).toBe('https://coincrew-dev.example.me');
  });

  it('takes the first hop of a comma list', () => {
    const h = headers({ 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'a.example.com, b.internal' });
    expect(requestOrigin('http://b.internal/x', h)).toBe('https://a.example.com');
  });

  it('ignores a malformed forwarded host or proto', () => {
    const h = headers({ 'x-forwarded-proto': 'javascript', 'x-forwarded-host': 'evil.com/path' });
    expect(requestOrigin('https://app.coincrew.io/x', h)).toBe('https://app.coincrew.io');
  });
});
