import { Hono } from 'hono';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  participants,
  users,
  userNotificationSettings,
  notificationLogs,
} from '@cc/api-db/schema';
import { and, eq, gte } from 'drizzle-orm';
import { assertWritable, resolveActor } from '@cc/api-auth/actor';
import { ApiError } from '@cc/api-util/errors';
import { getSnapshot } from '../trips/snapshot';
import { createEmailService } from './emailService';
import {
  renderLoanReminderEmail,
  type CreditorDebt,
} from './templates/loanReminderEmail';
import { newId, nowIso } from '@cc/api-util/ids';

export function adminNotificationRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.post('/trips/:id/remind-debtors', async (c) => {
    const tripId = c.req.param('id');
    const db = getDb(c.env);

    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    const isGroupAdmin = Boolean(actor.isAdmin) || Boolean(actor.isOrganiser);
    if (!isGroupAdmin) {
      throw new ApiError('FORBIDDEN', 403, 'Admin access required');
    }

    const trip = actor.trip;
    const snapshot = await getSnapshot(db, trip);

    const tripParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.tripId, trip.id));

    interface DebtorData {
      userId: string;
      user: typeof users.$inferSelect;
      totalDebt: number;
      participantIds: string[];
    }

    const debtorMap = new Map<string, DebtorData>();

    for (const p of tripParticipants) {
      if (!p.userId) continue;

      const bal = snapshot.balances[p.id] ?? 0;
      if (bal >= 0) continue; // Only negative balance qualifies

      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, p.userId))
        .get();

      if (!user || !user.email || user.email.trim() === '') continue;

      const settings = await db
        .select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, user.id))
        .get();

      if (settings && settings.loanReminders === 0) continue;

      let debtor = debtorMap.get(user.id);
      if (!debtor) {
        debtor = {
          userId: user.id,
          user,
          totalDebt: 0,
          participantIds: [],
        };
        debtorMap.set(user.id, debtor);
      }
      debtor.totalDebt += Math.abs(bal);
      debtor.participantIds.push(p.id);
    }

    let sentCount = 0;
    let throttledCount = 0;
    const emailService = createEmailService(c.env);

    // 1-hour debounce check
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    for (const debtor of debtorMap.values()) {
      const recentLog = await db
        .select()
        .from(notificationLogs)
        .where(
          and(
            eq(notificationLogs.userId, debtor.userId),
            eq(notificationLogs.tripId, trip.id),
            eq(notificationLogs.type, 'loan_reminder'),
            gte(notificationLogs.sentAt, oneHourAgo),
          ),
        )
        .get();

      if (recentLog) {
        throttledCount++;
        continue;
      }

      const debts: CreditorDebt[] = snapshot.suggestions
        .filter((s) => debtor.participantIds.includes(s.fromId))
        .map((s) => ({
          creditorName: snapshot.people.find((person) => person.id === s.toId)?.name ?? 'Unknown',
          amount: s.amount,
        }));

      const emailContent = renderLoanReminderEmail({
        recipientName: debtor.user.name,
        groups: [
          {
            tripName: trip.name,
            groupToken: trip.groupToken,
            totalDebt: debtor.totalDebt,
            debts,
          },
        ],
        appOrigin: c.env.APP_ORIGIN || 'https://app.coincrew.io',
        lang: trip.defaultLang === 'en' ? 'en' : 'vi',
      });

      if (!debtor.user.email) continue;
      const sendRes = await emailService.send({
        to: debtor.user.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (sendRes.success) {
        await db.insert(notificationLogs).values({
          id: newId(),
          userId: debtor.userId,
          tripId: trip.id,
          type: 'loan_reminder',
          referenceId: trip.id,
          sentAt: nowIso(),
        });
        sentCount++;
      }
    }

    return c.json({ sentCount, throttledCount });
  });

  return app;
}
