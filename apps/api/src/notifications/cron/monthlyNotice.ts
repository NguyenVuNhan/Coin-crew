import type { Env } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  trips,
  participants,
  transactions,
  transactionShares,
  users,
  userNotificationSettings,
  notificationLogs,
} from '@cc/api-db/schema';
import { and, eq, inArray, isNull, like, ne, or } from 'drizzle-orm';
import { getSnapshot } from '../../trips/snapshot';
import { createEmailService } from '../emailService';
import {
  renderMonthlyNoticeEmail,
  type MonthlyNoticeGroup,
} from '../templates/monthlyNoticeEmail';
import { newId } from '@cc/api-util/ids';

export function getPrecedingMonth(date: Date): { year: number; month: number; ymString: string } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const ymString = `${year}-${String(month).padStart(2, '0')}`;
  return { year, month, ymString };
}

export async function sendMonthlyNotices(
  env: Env,
  now: Date = new Date(),
  options?: { force?: boolean },
): Promise<void> {
  // Runs on 1st of month at 01:00 UTC (08:00 AM ICT) unless force is specified
  if (!options?.force && (now.getUTCDate() !== 1 || now.getUTCHours() !== 1)) {
    return;
  }

  const db = getDb(env);
  const { ymString } = getPrecedingMonth(now);

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

  type UserWithEmail = typeof users.$inferSelect & { email: string };

  const userGroupsMap = new Map<
    string,
    { user: UserWithEmail; groups: MonthlyNoticeGroup[] }
  >();

  for (const trip of activeTrips) {
    // Query transactions in preceding month
    const monthTxs = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, trip.id),
          like(transactions.spentOn, `${ymString}%`),
        ),
      );

    // Inactive groups with 0 transactions in that month are excluded
    if (monthTxs.length === 0) {
      continue;
    }

    const approvedExpenses = monthTxs.filter(
      (tx) => tx.type === 'expense' && tx.isLatest === 1 && tx.status === 'approved',
    );
    const totalGroupSpend = approvedExpenses.reduce((sum, tx) => sum + tx.amount, 0);

    const snapshot = await getSnapshot(db, trip);
    const tripParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.tripId, trip.id));

    const expenseIds = approvedExpenses.map((tx) => tx.id);
    const shares =
      expenseIds.length > 0
        ? await db
            .select()
            .from(transactionShares)
            .where(inArray(transactionShares.transactionId, expenseIds))
        : [];

    for (const p of tripParticipants) {
      if (!p.userId) continue;

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

      if (settings && settings.monthlyNotice === 0) continue;

      const userSpend = approvedExpenses
        .filter((tx) => tx.payerId === p.id)
        .reduce((sum, tx) => sum + tx.amount, 0);

      const userShare = shares
        .filter((s) => s.participantId === p.id)
        .reduce((sum, s) => sum + s.amount, 0);

      const closingBalance = snapshot.balances[p.id] ?? 0;

      let userEntry = userGroupsMap.get(user.id);
      if (!userEntry) {
        userEntry = { user: userWithEmail, groups: [] };
        userGroupsMap.set(user.id, userEntry);
      }

      const existingGroup = userEntry.groups.find((g) => g.groupToken === trip.groupToken);
      if (existingGroup) {
        existingGroup.userSpend += userSpend;
        existingGroup.userShare = (existingGroup.userShare ?? 0) + userShare;
        existingGroup.closingBalance += closingBalance;
      } else {
        userEntry.groups.push({
          tripName: trip.name,
          groupToken: trip.groupToken,
          totalGroupSpend,
          userSpend,
          userShare,
          closingBalance,
        });
      }
    }
  }

  const emailService = createEmailService(env);
  const nowIsoString = now.toISOString();

  for (const [userId, { user, groups }] of userGroupsMap.entries()) {
    if (groups.length === 0) continue;

    // Check if monthly notice for this month was already sent to this user
    const alreadySent = await db
      .select()
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.userId, userId),
          eq(notificationLogs.type, 'monthly_notice'),
          eq(notificationLogs.referenceId, ymString),
        ),
      )
      .get();

    if (alreadySent) continue;

    const emailContent = renderMonthlyNoticeEmail({
      month: ymString,
      recipientName: user.name,
      groups,
      appOrigin: env.APP_ORIGIN || 'https://app.coincrew.io',
      lang: 'vi',
    });

    const sendRes = await emailService.send({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (sendRes.success) {
      await db.insert(notificationLogs).values({
        id: newId(),
        userId,
        tripId: null,
        type: 'monthly_notice',
        referenceId: ymString,
        sentAt: nowIsoString,
      });
    }
  }
}
