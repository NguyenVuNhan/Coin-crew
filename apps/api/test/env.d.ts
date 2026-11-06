import type { Env as AppEnv } from '@cc/api-db/env';

declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {}
  }
}

export {};
