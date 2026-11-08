import type { Env } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  trips,
  participants,
  users,
  userNotificationSettings,
  notificationLogs,
} from '@cc/api-db/schema';
import { and, eq, gte, isNull, ne, or } from 'drizzle-orm';
import { getSnapshot } from '../../trips/snapshot';
import { createEmailService } from '../emailService';
import {
  renderLoanReminderEmail,
  type LoanReminderGroup,
  type CreditorDebt,
} from '../templates/loanReminderEmail';
import { newId } from '@cc/api-util/ids';

type UserWithEmail = typeof users.$inferSelect & { email: string };

interface CandidateTripGroup {
  tripId: string;
  tripName: string;
  groupToken: string;
  totalDebt: number;
  debts: CreditorDebt[];
  defaultLang: string;
}

export async function sendWeeklyLoanReminders(env: Env, now: Date = new Date()): Promise<void> {
  const db = getDb(env);

  // Active trips: not archived and not preset = 'direct'
  const activeTrips = await db
    .select()
    .from(trips)
    .where(
      and(
        isNull(trips.archivedAt),
        or(isNull(trips.preset), ne(trips.preset, 'direct')),
      ),
    );

  if (activeTrips.length === 0) return;

  const userDebtsMap = new Map<
    string,
    { user: UserWithEmail; candidateGroups: CandidateTripGroup[] }
  >();

  for (const trip of activeTrips) {
    const snapshot = await getSnapshot(db, trip);
    const tripParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.tripId, trip.id));

    for (const p of tripParticipants) {
      if (!p.userId) continue;

      const balance = snapshot.balances[p.id] ?? 0;
      if (balance >= 0) continue; // Debtor eligibility: net balance < 0

      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, p.userId))
        .get();

      if (!user || !user.email || user.email.trim() === '') continue;
      const userWithEmail: UserWithEmail = { ...user, email: user.email };

      const settings = await db
        .select()
        .from(userNotificationSettings)
        .where(eq(userNotificationSettings.userId, user.id))
        .get();

      if (settings && settings.loanReminders === 0) continue;

      const debts: CreditorDebt[] = snapshot.suggestions
        .filter((s) => s.fromId === p.id)
        .map((s) => ({
          creditorName: snapshot.people.find((person) => person.id === s.toId)?.name ?? 'Unknown',
          amount: s.amount,
        }));

      let userEntry = userDebtsMap.get(user.id);
      if (!userEntry) {
        userEntry = { user: userWithEmail, candidateGroups: [] };
        userDebtsMap.set(user.id, userEntry);
      }

      const existingGroup = userEntry.candidateGroups.find((g) => g.tripId === trip.id);
      if (existingGroup) {
        existingGroup.totalDebt += Math.abs(balance);
        existingGroup.debts.push(...debts);
      } else {
        userEntry.candidateGroups.push({
          tripId: trip.id,
          tripName: trip.name,
          groupToken: trip.groupToken,
          totalDebt: Math.abs(balance),
          debts,
          defaultLang: trip.defaultLang,
        });
      }
    }
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const emailService = createEmailService(env);
  const nowIsoString = now.toISOString();

  for (const [userId, { user, candidateGroups }] of userDebtsMap.entries()) {
    const qualifyingGroups: CandidateTripGroup[] = [];

    for (const group of candidateGroups) {
      const recentLog = await db
        .select()
        .from(notificationLogs)
        .where(
          and(
            eq(notificationLogs.userId, userId),
            eq(notificationLogs.tripId, group.tripId),
            eq(notificationLogs.type, 'loan_reminder'),
            gte(notificationLogs.sentAt, sevenDaysAgo),
          ),
        )
        .get();

      if (!recentLog) {
        qualifyingGroups.push(group);
      }
    }

    // If user has no qualifying debt in ANY group after filtering, send no email (Review Focus #5)
    if (qualifyingGroups.length === 0) continue;

    const emailGroups: LoanReminderGroup[] = qualifyingGroups.map((g) => ({
      tripName: g.tripName,
      groupToken: g.groupToken,
      totalDebt: g.totalDebt,
      debts: g.debts,
    }));

    const allEn = qualifyingGroups.every((g) => g.defaultLang === 'en');
    const emailContent = renderLoanReminderEmail({
      recipientName: user.name,
      groups: emailGroups,
      appOrigin: env.APP_ORIGIN || 'https://app.coincrew.io',
      lang: allEn ? 'en' : 'vi',
    });

    const sendRes = await emailService.send({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (sendRes.success) {
      for (const g of qualifyingGroups) {
        await db.insert(notificationLogs).values({
          id: newId(),
          userId,
          tripId: g.tripId,
          type: 'loan_reminder',
          referenceId: g.tripId,
          sentAt: nowIsoString,
        });
      }
    }
  }
}
