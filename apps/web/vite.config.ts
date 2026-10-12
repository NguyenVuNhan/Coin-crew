import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Finance Sheet Lover',
        short_name: 'FSL',
        description: 'Split trip expenses and settle up with VietQR.',
        theme_color: '#0f766e',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      // Offline use is not required; never serve the API from the service worker.
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  // The Worker in apps/api serves the built app as static assets.
  build: { outDir: '../api/public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
