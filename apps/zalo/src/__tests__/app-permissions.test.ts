import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { clientFor, parseRequestArgs } from '../../scripts/app-permissions.mjs';

describe('app-permissions script', () => {
  it('prefers partner credentials and sends them as Bearer headers', () => {
    const c = clientFor({ ZMP_PARTNER_API_KEY: 'k', ZMP_PARTNER_ID: 'p', ZMP_OPENAPI_KEY: 'o', ZALO_APP_ID: 'z' });
    expect(c).toEqual({
      kind: 'partner',
      base: 'https://openapi.mini.zalo.me/partners/apps',
      headers: { 'X-Partner-Api-Key': 'Bearer k', 'X-Partner-Id': 'p' },
    });
  });

  it('falls back to owner credentials, and to null without any', () => {
    expect(clientFor({ ZMP_OPENAPI_KEY: 'o', ZALO_APP_ID: 'z' })?.headers).toEqual({ 'X-Api-Key': 'Bearer o', 'X-Zalo-AppID': 'z' });
    expect(clientFor({})).toBeNull();
  });

  it('builds the request body from ids, note and consent text', () => {
    expect(parseRequestArgs(['25', '38', '--note', 'bank', '--consent', 'Mở app ngân hàng'])).toEqual({
      permissions: [
        { permissionId: 25, consentText: 'Mở app ngân hàng' },
        { permissionId: 38, consentText: 'Mở app ngân hàng' },
      ],
      note: 'bank',
    });
    expect(() => parseRequestArgs([])).toThrow(/at least one/);
    expect(() => parseRequestArgs(['abc'])).toThrow(/Unexpected/);
  });
});
