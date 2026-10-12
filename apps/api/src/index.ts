import { createApp } from './app';
import type { Env } from './env';
import { checkUsage } from './ops/usage';

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkUsage(env, new Date()));
  },
} satisfies ExportedHandler<Env>;
