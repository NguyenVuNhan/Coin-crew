import type { D1Migration } from '@cloudflare/vitest-plugin';

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_ORIGIN: string;
  E2E_LOGIN?: string;
  OPS_ALERT_WEBHOOK_URL?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  TEST_MIGRATIONS?: D1Migration[];
};

export type Vars = {
  deviceHash: string;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Vars;
};
