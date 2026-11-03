import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // At most four test processes at once. With the default (11 on the owner's 12-thread Windows machine) about one
    // full run in three lost a worker ("Worker exited unexpectedly"): Node 24 crashes natively there while several
    // processes parse large scripts together, and every jsdom worker parses jsdom's 2.3 MB generated CSS file as it
    // starts. Four workers made 20 runs in a row clean on an idle machine, for about 6 s more per run.
    maxWorkers: 2,
  },
});
