import type { Context } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  participants,
  transactions,
  transactionShares,
  users,
  trips,
  userNotificationSettings,
  notificationLogs,
} from '@cc/api-db/schema';
import { createEmailService } from './emailService';
import { renderTransactionEmail } from './templates/transactionEmail';
import { renderPaymentEmail } from './templates/paymentEmail';
import { newId, nowIso } from '@cc/api-util/ids';
import { getSessionUser } from '@cc/api-auth/session';

export interface DispatchActor {
  actorUserId?: string | null;
  actorParticipantId?: string | null;
}

async function runExpenseDispatch(
  c: Context<AppBindings>,
  event: 'approved' | 'updated' | 'deleted',
  expenseRootId: string,
  actor?: DispatchActor,
): Promise<void> {
  const db = getDb(c.env);

  let tx = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.rootId, expenseRootId), eq(transactions.isLatest, 1)))
    .get();

  if (!tx) {
    tx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.rootId, expenseRootId))
      .orderBy(desc(transactions.createdAt))
      .get();
  }

  if (!tx) return;

  const trip = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tx.tripId))
    .get();

  if (!trip) return;

  let resolvedActorUserId = actor?.actorUserId;
  let resolvedActorParticipantId = actor?.actorParticipantId;
  if (!resolvedActorUserId && !resolvedActorParticipantId) {
    try {
      const sessionUser = await getSessionUser(c);
      if (sessionUser) {
        resolvedActorUserId = sessionUser.id;
      }
    } catch {
      // ignore
    }
  }

  const shares = await db
    .select()
    .from(transactionShares)
    .where(eq(transactionShares.transactionId, tx.id));

  let payerName: string | undefined;
  if (tx.payerId) {
    const payerParticipant = await db
      .select()
      .from(participants)
      .where(and(eq(participants.id, tx.payerId), eq(participants.tripId, trip.id)))
      .get();
    payerName = payerParticipant?.name;
  }

  // Participants involved: in transaction_shares with amount > 0, plus payer if not author
  const participantSharesMap = new Map<string, number>();
  for (const s of shares) {
    if (s.amount > 0) {
      participantSharesMap.set(s.participantId, s.amount);
    }
  }
  if (tx.payerId && !participantSharesMap.has(tx.payerId)) {
    participantSharesMap.set(tx.payerId, 0);
  }

  const candidatePids = Array.from(participantSharesMap.keys());
  if (candidatePids.length === 0) return;

  const candidateParticipants = await db
    .select()
    .from(participants)
    .where(and(eq(participants.tripId, trip.id), inArray(participants.id, candidatePids)));

  const emailService = createEmailService(c.env);
  const processedUserIds = new Set<string>();

  for (const p of candidateParticipants) {
    // Exclude if matches actor participant ID
    if (resolvedActorParticipantId && p.id === resolvedActorParticipantId) {
      continue;
    }
    // Exclude if no linked user
    if (!p.userId) {
      continue;
    }
    // Exclude if matches actor user ID
    if (resolvedActorUserId && p.userId === resolvedActorUserId) {
      continue;
    }
    // Deduplicate recipients
    if (processedUserIds.has(p.userId)) {
      continue;
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, p.userId))
      .get();

    if (!user) continue;

    // Silently skip if user has no email address
    if (!user.email || user.email.trim() === '') {
      continue;
    }

    // Check user notification settings
    const settings = await db
      .select()
      .from(userNotificationSettings)
      .where(eq(userNotificationSettings.userId, user.id))
      .get();

    if (settings && settings.transactionCrud === 0) {
      continue;
    }

    processedUserIds.add(user.id);

    const userShare = participantSharesMap.get(p.id) ?? 0;

    const emailContent = renderTransactionEmail({
      tripName: trip.name,
      groupToken: trip.groupToken,
      action: event,
      description: tx.description,
      totalAmount: tx.amount,
      userShare,
      payerName,
      currency: tx.currency,
      appOrigin: c.env.APP_ORIGIN || 'https://app.coincrew.io',
      lang: trip.defaultLang === 'en' ? 'en' : 'vi',
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
        userId: user.id,
        tripId: trip.id,
        type: 'transaction_crud',
        referenceId: expenseRootId,
        sentAt: nowIso(),
      });
    }
  }
}

async function runPaymentDispatch(
  c: Context<AppBindings>,
  event: 'says_paid' | 'confirmed',
  paymentId: string,
  actor?: DispatchActor,
): Promise<void> {
  const db = getDb(c.env);

  const tx = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, paymentId), eq(transactions.type, 'payment')))
    .get();

  if (!tx || !tx.toId) return;

  const trip = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tx.tripId))
    .get();

  if (!trip) return;

  let resolvedActorUserId = actor?.actorUserId;
  let resolvedActorParticipantId = actor?.actorParticipantId;
  if (!resolvedActorUserId && !resolvedActorParticipantId) {
    try {
      const sessionUser = await getSessionUser(c);
      if (sessionUser) {
        resolvedActorUserId = sessionUser.id;
      }
    } catch {
      // ignore
    }
  }

  const payer = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, tx.payerId), eq(participants.tripId, trip.id)))
    .get();

  const payee = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, tx.toId), eq(participants.tripId, trip.id)))
    .get();

  if (!payer || !payee) return;

  // For payments: recipient (toId) when says_paid, payer (payerId) when confirmed
  const targetParticipant = event === 'says_paid' ? payee : payer;

  if (resolvedActorParticipantId && targetParticipant.id === resolvedActorParticipantId) {
    return;
  }
  if (!targetParticipant.userId) {
    return;
  }
  if (resolvedActorUserId && targetParticipant.userId === resolvedActorUserId) {
    return;
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, targetParticipant.userId))
    .get();

  if (!user || !user.email || user.email.trim() === '') {
    return;
  }

  const settings = await db
    .select()
    .from(userNotificationSettings)
    .where(eq(userNotificationSettings.userId, user.id))
    .get();

  if (settings && settings.transactionCrud === 0) {
    return;
  }

  const emailService = createEmailService(c.env);
  const emailContent = renderPaymentEmail({
    tripName: trip.name,
    groupToken: trip.groupToken,
    action: event,
    amount: tx.amountConfirmed ?? tx.amount,
    payerName: payer.name,
    payeeName: payee.name,
    note: tx.description || undefined,
    appOrigin: c.env.APP_ORIGIN || 'https://app.coincrew.io',
    lang: trip.defaultLang === 'en' ? 'en' : 'vi',
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
      userId: user.id,
      tripId: trip.id,
      type: 'transaction_crud',
      referenceId: paymentId,
      sentAt: nowIso(),
    });
  }
}

export async function dispatchExpenseNotification(
  c: Context<AppBindings>,
  event: 'approved' | 'updated' | 'deleted',
  expenseRootId: string,
  actor?: DispatchActor,
): Promise<void> {
  const promise = runExpenseDispatch(c, event, expenseRootId, actor).catch((err) => {
    console.error('[dispatchExpenseNotification] failed:', err);
  });

  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    await promise;
  }
}

export async function dispatchPaymentNotification(
  c: Context<AppBindings>,
  event: 'says_paid' | 'confirmed',
  paymentId: string,
  actor?: DispatchActor,
): Promise<void> {
  const promise = runPaymentDispatch(c, event, paymentId, actor).catch((err) => {
    console.error('[dispatchPaymentNotification] failed:', err);
  });

  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    await promise;
  }
}
