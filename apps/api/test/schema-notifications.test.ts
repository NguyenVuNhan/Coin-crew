import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { userNotificationSettings, notificationLogs } from '@cc/api-db/schema';

describe('Notification Schema', () => {
  it('defines user_notification_settings table structure', () => {
    expect(userNotificationSettings).toBeDefined();
    expect(userNotificationSettings.userId).toBeDefined();
    expect(userNotificationSettings.transactionCrud).toBeDefined();
    expect(userNotificationSettings.loanReminders).toBeDefined();
    expect(userNotificationSettings.monthlyNotice).toBeDefined();
    expect(userNotificationSettings.updatedAt).toBeDefined();
  });

  it('defines notification_logs table structure', () => {
    expect(notificationLogs).toBeDefined();
    expect(notificationLogs.id).toBeDefined();
    expect(notificationLogs.userId).toBeDefined();
    expect(notificationLogs.tripId).toBeDefined();
    expect(notificationLogs.type).toBeDefined();
    expect(notificationLogs.referenceId).toBeDefined();
    expect(notificationLogs.sentAt).toBeDefined();
  });

  it('verifies tables exist in D1 database', async () => {
    const userCols = await env.DB.prepare('PRAGMA table_info(user_notification_settings)').all();
    expect(userCols.results.map((r: any) => r.name)).toEqual([
      'user_id',
      'transaction_crud',
      'loan_reminders',
      'monthly_notice',
      'updated_at',
    ]);

    const logCols = await env.DB.prepare('PRAGMA table_info(notification_logs)').all();
    expect(logCols.results.map((r: any) => r.name)).toEqual([
      'id',
      'user_id',
      'trip_id',
      'type',
      'reference_id',
      'sent_at',
    ]);
  });
});

