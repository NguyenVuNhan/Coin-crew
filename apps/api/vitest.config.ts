import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            GOOGLE_CLIENT_ID: 'test-client-id',
            GOOGLE_CLIENT_SECRET: 'test-client-secret',
            APP_ORIGIN: 'http://localhost:8787',
            ZALO_APP_ID: 'test-zalo-app',
            ZALO_APP_SECRET: 'test-zalo-secret',
            DEVICE_SECRET: 'test-device-secret',
            ZMP_ALLOWED_ORIGINS: 'https://h5.zdn.vn,http://localhost:3000',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/setup.ts'], include: ['test/**/*.test.ts'] },
  };
});
