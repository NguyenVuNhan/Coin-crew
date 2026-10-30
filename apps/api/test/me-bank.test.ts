import { describe, it, expect } from 'vitest';
import type { MyBankResponse } from '@fsl/core';
import { call, json, memberSid } from './helpers';

describe('GET /api/me/bank', () => {
  it('signed out -> 401', async () => {
    const res = await call('/api/me/bank');
    expect(res.status).toBe(401);
  });

  it('signed in with no details -> 200 and null', async () => {
    const sid = await memberSid('u-no-bank', 'No Bank User');
    const res = await call('/api/me/bank', { headers: { Cookie: `sid=${sid}` } });
    expect(res.status).toBe(200);
    const body = await json<MyBankResponse | null>(res);
    expect(body).toBeNull();
  });

  it('after PUT /api/me/bank -> GET returns exactly those three fields; after a second PUT -> GET returns the new one', async () => {
    const sid = await memberSid('u-test-bank', 'Test Bank User');
    const headers = { Cookie: `sid=${sid}` };

    const putRes1 = await call('/api/me/bank', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bin: '970436',
        accountNumber: '0123456789',
        holderName: 'NGUYEN VAN A',
        consent: true,
      }),
    });
    expect(putRes1.status).toBe(204);

    const getRes1 = await call('/api/me/bank', { headers });
    expect(getRes1.status).toBe(200);
    const body1 = await json<MyBankResponse>(getRes1);
    expect(body1).toEqual({
      bin: '970436',
      accountNumber: '0123456789',
      holderName: 'NGUYEN VAN A',
    });

    const putRes2 = await call('/api/me/bank', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bin: '970436',
        accountNumber: '9876543210',
        holderName: 'NGUYEN VAN A',
        consent: true,
      }),
    });
    expect(putRes2.status).toBe(204);

    const getRes2 = await call('/api/me/bank', { headers });
    expect(getRes2.status).toBe(200);
    const body2 = await json<MyBankResponse>(getRes2);
    expect(body2).toEqual({
      bin: '970436',
      accountNumber: '9876543210',
      holderName: 'NGUYEN VAN A',
    });
  });
});
