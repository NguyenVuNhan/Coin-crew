import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'brand/google-signin-icon.png', 'brand/zalo-app-icon.png'],
      manifest: {
        name: 'CoinCrew (Tiền Đâu)',
        short_name: 'CoinCrew',
        description: 'Split trip expenses and settle up with VietQR.',
        theme_color: '#0f766e',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // Offline use is not required; never serve the API from the service worker.
      workbox: { skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true, navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  // The Worker in apps/api serves the built app as static assets.
  build: {
    outDir: '../api/public',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app, so they get chunks of their own: a deploy only
        // re-downloads the app's code, and no chunk passes Vite's 500 kB warning.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: { proxy: { '/api': 'http://localhost:8787' } },
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
