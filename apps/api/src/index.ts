import { createApp } from './app';
import type { Env } from '@cc/api-db/env';
import { checkUsage } from './ops/usage';
import { retryUndeliveredFeedback } from './feedback/deliver';
import { sendWeeklyLoanReminders } from './notifications/cron/loanReminders';
import { sendMonthlyNotices } from './notifications/cron/monthlyNotice';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = new Date();
    ctx.waitUntil(checkUsage(env, now));
    ctx.waitUntil(retryUndeliveredFeedback(env, now));
    ctx.waitUntil(sendWeeklyLoanReminders(env, now));
    ctx.waitUntil(sendMonthlyNotices(env, now));
  },
} satisfies ExportedHandler<Env>;
