import { asc, inArray, isNull, lt } from 'drizzle-orm';
import type { Env } from '../env';
import { getDb } from '../db/client';
import { feedback, feedbackRate } from '../db/schema';
import { nowIso } from '../lib/ids';
import { hourBucket } from './time';

const RETRY_BATCH = 50;
const RATE_BUCKET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Sends the rows to the Google Apps Script web app (docs/setup.md §4.8) and marks them delivered on
 * a 2xx. Never throws: D1 keeps undelivered rows and the hourly cron tries again.
 */
export async function deliverFeedback(env: Env, ids: string[]): Promise<void> {
  if (!env.FEEDBACK_SHEET_WEBHOOK_URL || ids.length === 0) return;
  try {
    const db = getDb(env);
    const found = await db.select().from(feedback).where(inArray(feedback.id, ids)).all();
    if (found.length === 0) return;

    const rows = found.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      type: r.type,
      message: r.message,
      screen: r.screen,
      device: r.device,
      lang: r.lang,
      appVersion: r.appVersion,
      contact: r.contact,
    }));
    const res = await fetch(env.FEEDBACK_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.FEEDBACK_SHEET_TOKEN ?? '', rows }),
    });
    if (!res.ok) {
      console.warn(`Feedback delivery failed with status ${res.status}`);
      return;
    }
    await db.update(feedback).set({ deliveredAt: nowIso() }).where(inArray(feedback.id, rows.map((r) => r.id)));
  } catch (err) {
    console.warn('Feedback delivery failed', err);
  }
}

/** Hourly: re-send the oldest undelivered rows and drop rate-limit buckets older than a day. */
export async function retryUndeliveredFeedback(env: Env, now: Date): Promise<void> {
  const db = getDb(env);
  await db.delete(feedbackRate).where(lt(feedbackRate.bucket, hourBucket(new Date(now.getTime() - RATE_BUCKET_TTL_MS))));

  const pending = await db
    .select({ id: feedback.id })
    .from(feedback)
    .where(isNull(feedback.deliveredAt))
    .orderBy(asc(feedback.createdAt))
    .limit(RETRY_BATCH)
    .all();
  await deliverFeedback(env, pending.map((r) => r.id));
}
