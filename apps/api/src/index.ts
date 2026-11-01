import { createApp } from './app';
import type { Env } from './env';
import { checkUsage } from './ops/usage';
import { retryUndeliveredFeedback } from './feedback/deliver';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = new Date();
    ctx.waitUntil(checkUsage(env, now));
    ctx.waitUntil(retryUndeliveredFeedback(env, now));
  },
} satisfies ExportedHandler<Env>;
