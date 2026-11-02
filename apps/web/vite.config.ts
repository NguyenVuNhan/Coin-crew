import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

/** Short git sha of the build, sent with feedback so reports can be matched to a deploy. */
function appVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // shadcn files in @fsl/web-common import `@/…`, which points into that package.
  resolve: { alias: { '@': fileURLToPath(new URL('../../packages/web-common/src', import.meta.url)) } },
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
        background_color: '#f6f7f4',
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
});
