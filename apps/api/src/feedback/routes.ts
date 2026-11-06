import type { Context } from 'hono';
import { Hono } from 'hono';
import type { FeedbackType } from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import { feedback } from '@cc/api-db/schema';
import { getSessionUser, type UserRow } from '@cc/api-auth/session';
import { ApiError } from '@cc/api-util/errors';
import { newId } from '@cc/api-util/ids';
import { deliverFeedback } from './deliver';
import { checkFeedbackRate } from './rateLimit';
import { hourBucket } from './time';

const TYPES: readonly FeedbackType[] = ['bug', 'idea', 'other'];
const DEVICES = ['phone', 'desktop'] as const;
const LANGS = ['vi', 'en'] as const;
const SCREEN_RE = /^[a-z0-9-]{1,64}$/;
const MAX_MESSAGE = 2000;
const MAX_CONTACT = 100;
const MAX_VERSION = 40;

interface ValidFeedback {
  message: string;
  type: FeedbackType | null;
  screen: string;
  device: (typeof DEVICES)[number];
  lang: (typeof LANGS)[number];
  appVersion: string;
  contactMe: boolean;
  contactText: string | null;
}

function invalid(): never {
  throw new ApiError('VALIDATION', 422, 'Invalid request');
}

async function parseJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : invalid();
  } catch {
    return invalid();
  }
}

function validate(b: Record<string, unknown>): ValidFeedback {
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (message.length < 1 || message.length > MAX_MESSAGE) invalid();

  const type = b.type ?? null;
  if (type !== null && !TYPES.includes(type as FeedbackType)) invalid();

  if (typeof b.screen !== 'string' || !SCREEN_RE.test(b.screen)) invalid();
  if (!DEVICES.includes(b.device as never)) invalid();
  if (!LANGS.includes(b.lang as never)) invalid();
  if (typeof b.appVersion !== 'string' || b.appVersion.length < 1 || b.appVersion.length > MAX_VERSION) invalid();
  if (typeof b.contactMe !== 'boolean') invalid();

  let contactText: string | null = null;
  if (b.contactText !== undefined) {
    if (typeof b.contactText !== 'string') invalid();
    contactText = b.contactText.trim();
    if (contactText.length > MAX_CONTACT) invalid();
  }

  return {
    message,
    type: type as FeedbackType | null,
    screen: b.screen,
    device: b.device as ValidFeedback['device'],
    lang: b.lang as ValidFeedback['lang'],
    appVersion: b.appVersion,
    contactMe: b.contactMe,
    contactText: contactText || null,
  };
}

/** Signed-in: built from the session (client text ignored). Guest: their own text. No internal ids. */
function contactFor(input: ValidFeedback, user: UserRow | null): string | null {
  if (!input.contactMe) return null;
  if (user) return user.email ? `${user.name} <${user.email}>` : `${user.name} (Zalo)`;
  return input.contactText;
}

export function feedbackRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /feedback — signed-in users and guests alike.
  app.post('/feedback', async (c) => {
    const input = validate(await parseJson(c));
    const db = getDb(c.env);
    const now = new Date();
    await checkFeedbackRate(db, c.get('deviceHash'), now);
    const user = await getSessionUser(c);

    const id = newId();
    await db.insert(feedback).values({
      id,
      type: input.type,
      message: input.message,
      screen: input.screen,
      device: input.device,
      lang: input.lang,
      appVersion: input.appVersion,
      contact: contactFor(input, user),
      createdAt: hourBucket(now),
    });

    // Never make the sender wait on Google; the hourly cron retries anything that fails here.
    const delivery = deliverFeedback(c.env, [id]);
    try {
      c.executionCtx.waitUntil(delivery);
    } catch {
      await delivery; // no execution context (tests calling app.request directly)
    }

    return c.json({ ok: true }, 201);
  });

  return app;
}
