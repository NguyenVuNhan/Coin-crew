import { describe, it, expect } from 'vitest';
import type { UserNotificationSettings } from '@cc/core';
import { call, json, memberSid } from './helpers';

describe('Notification Settings API Routes', () => {
  describe('GET /api/me/notifications', () => {
    it('requires auth (returns 401 UNAUTHENTICATED when signed out)', async () => {
      const res = await call('/api/me/notifications');
      expect(res.status).toBe(401);
      const body = await json<{ error: { code: string } }>(res);
      expect(body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns default enabled settings when no row exists for user', async () => {
      const sid = await memberSid('u-notif-default', 'Notif Default User');
      const res = await call('/api/me/notifications', {
        headers: { Cookie: `sid=${sid}` },
      });
      expect(res.status).toBe(200);
      const body = await json<{ settings: UserNotificationSettings }>(res);
      expect(body.settings).toEqual({
        transactionCrud: true,
        loanReminders: true,
        monthlyNotice: true,
      });
    });
  });

  describe('PATCH /api/me/notifications', () => {
    it('requires auth (returns 401 UNAUTHENTICATED when signed out)', async () => {
      const res = await call('/api/me/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionCrud: false }),
      });
      expect(res.status).toBe(401);
      const body = await json<{ error: { code: string } }>(res);
      expect(body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects invalid body or field types with 422 VALIDATION', async () => {
      const sid = await memberSid('u-notif-validation', 'Validation User');
      const headers = {
        Cookie: `sid=${sid}`,
        'Content-Type': 'application/json',
      };

      const resInvalidField = await call('/api/me/notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ transactionCrud: 'not-a-boolean' }),
      });
      expect(resInvalidField.status).toBe(422);
      const body1 = await json<{ error: { code: string } }>(resInvalidField);
      expect(body1.error.code).toBe('VALIDATION');

      const resInvalidArray = await call('/api/me/notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify([1, 2, 3]),
      });
      expect(resInvalidArray.status).toBe(422);
      const body2 = await json<{ error: { code: string } }>(resInvalidArray);
      expect(body2.error.code).toBe('VALIDATION');
    });

    it('updates settings and returns updated settings, and subsequent GET reflects updates', async () => {
      const sid = await memberSid('u-notif-patch', 'Notif Patch User');
      const headers = {
        Cookie: `sid=${sid}`,
        'Content-Type': 'application/json',
      };

      // 1. Partial update: transactionCrud: false
      const patchRes1 = await call('/api/me/notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ transactionCrud: false }),
      });
      expect(patchRes1.status).toBe(200);
      const patchBody1 = await json<{ settings: UserNotificationSettings }>(patchRes1);
      expect(patchBody1.settings).toEqual({
        transactionCrud: false,
        loanReminders: true,
        monthlyNotice: true,
      });

      // 2. Subsequent GET returns persisted updated settings
      const getRes1 = await call('/api/me/notifications', {
        headers: { Cookie: `sid=${sid}` },
      });
      expect(getRes1.status).toBe(200);
      const getBody1 = await json<{ settings: UserNotificationSettings }>(getRes1);
      expect(getBody1.settings).toEqual({
        transactionCrud: false,
        loanReminders: true,
        monthlyNotice: true,
      });

      // 3. Second update: turn off loanReminders as well
      const patchRes2 = await call('/api/me/notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ loanReminders: false }),
      });
      expect(patchRes2.status).toBe(200);
      const patchBody2 = await json<{ settings: UserNotificationSettings }>(patchRes2);
      expect(patchBody2.settings).toEqual({
        transactionCrud: false,
        loanReminders: false,
        monthlyNotice: true,
      });

      // 4. Third update: turn monthlyNotice off and transactionCrud back on
      const patchRes3 = await call('/api/me/notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ monthlyNotice: false, transactionCrud: true }),
      });
      expect(patchRes3.status).toBe(200);
      const patchBody3 = await json<{ settings: UserNotificationSettings }>(patchRes3);
      expect(patchBody3.settings).toEqual({
        transactionCrud: true,
        loanReminders: false,
        monthlyNotice: false,
      });

      // 5. Subsequent GET returns latest settings
      const getRes2 = await call('/api/me/notifications', {
        headers: { Cookie: `sid=${sid}` },
      });
      expect(getRes2.status).toBe(200);
      const getBody2 = await json<{ settings: UserNotificationSettings }>(getRes2);
      expect(getBody2.settings).toEqual({
        transactionCrud: true,
        loanReminders: false,
        monthlyNotice: false,
      });
    });
  });
});
