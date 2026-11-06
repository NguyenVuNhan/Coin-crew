import type { D1Migration } from '@cloudflare/vitest-plugin';
import type { UserRow } from './types';

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_ORIGIN: string;
  ZALO_APP_ID?: string;
  ZALO_APP_SECRET?: string;
  ZALO_RELAY_URL?: string;
  ZALO_RELAY_SECRET?: string;
  E2E_LOGIN?: string;
  OPS_ALERT_WEBHOOK_URL?: string;
  /** Google Apps Script web app that appends feedback to the Sheet (docs/setup.md §4.8). */
  FEEDBACK_SHEET_WEBHOOK_URL?: string;
  FEEDBACK_SHEET_TOKEN?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  ZMP_ALLOWED_ORIGINS?: string;
  DEVICE_SECRET?: string;
  TEST_MIGRATIONS?: D1Migration[];
};

export type Vars = {
  deviceHash: string;
  user?: UserRow | null;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Vars;
};
