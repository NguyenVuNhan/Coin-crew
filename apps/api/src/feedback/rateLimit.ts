import { count, eq, sql } from 'drizzle-orm';
import type { Db } from '@cc/api-db/client';
import { feedback, feedbackRate } from '@cc/api-db/schema';
import { ApiError } from '@cc/api-util/errors';
import { sha256Hex } from '@cc/api-util/ids';
import { hourBucket } from './time';

export const FEEDBACK_PER_DEVICE_PER_HOUR = 5;
export const FEEDBACK_GLOBAL_PER_HOUR = 100;

/**
 * Guards against accidents and casual spam, not a determined attacker (a fresh device id is free).
 * Counts this device's attempt for the hour, then refuses past either limit.
 */
export async function checkFeedbackRate(db: Db, deviceHash: string, now: Date): Promise<void> {
  const bucket = hourBucket(now);

  const total = await db.select({ n: count() }).from(feedback).where(eq(feedback.createdAt, bucket)).get();
  if ((total?.n ?? 0) >= FEEDBACK_GLOBAL_PER_HOUR) {
    throw new ApiError('RATE_LIMITED', 429, 'Too much feedback right now. Please try again later.');
  }

  const key = await sha256Hex(deviceHash + bucket);
  const row = await db
    .insert(feedbackRate)
    .values({ key, bucket, count: 1 })
    .onConflictDoUpdate({ target: feedbackRate.key, set: { count: sql`${feedbackRate.count} + 1` } })
    .returning({ count: feedbackRate.count })
    .get();
  if (row.count > FEEDBACK_PER_DEVICE_PER_HOUR) {
    throw new ApiError('RATE_LIMITED', 429, 'You have sent a lot of feedback just now. Please try again later.');
  }
}
