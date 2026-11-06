import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Zalo's runtime does not read index.html: it loads the files listed in app-config.json. This writes
 * app-config.json from ./app-config.base.json plus the built entry, chunks and CSS (what the official
 * zmp-vite-plugin does; that plugin only supports Vite 4-5) into dist/ and into the project root,
 * because `zmp-cli deploy` reads the asset lists from the root file (it stays gitignored).
 */
function zaloAppConfig(): Plugin {
  return {
    name: 'coincrew-zalo-app-config',
    apply: 'build',
    writeBundle(options, bundle) {
      const base = JSON.parse(readFileSync(new URL('./app-config.base.json', import.meta.url), 'utf8')) as Record<string, unknown>;
      const files = Object.values(bundle);
      const entries = files.filter((f) => f.type === 'chunk' && f.isEntry);
      const imported = new Set<string>();
      const walk = (name: string) => {
        const chunk = bundle[name];
        if (!chunk || chunk.type !== 'chunk') return;
        for (const dep of chunk.imports) {
          if (!imported.has(dep)) {
            imported.add(dep);
            walk(dep);
          }
        }
      };
      entries.forEach((e) => walk(e.fileName));
      const config = {
        ...base,
        listCSS: files.filter((f) => f.type === 'asset' && f.fileName.endsWith('.css')).map((f) => f.fileName),
        listSyncJS: entries.map((f) => f.fileName),
        listAsyncJS: [...imported],
      };
      const json = JSON.stringify(config, null, 2);
      writeFileSync(`${options.dir}/app-config.json`, json);
      writeFileSync(new URL('./app-config.json', import.meta.url), json);
    },
  };
}

/** Short git sha of the build, sent with feedback so reports can be matched to a deploy. */
function appVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_');
  if (command === 'build' && !env.VITE_API_ORIGIN) {
    throw new Error('Set VITE_API_ORIGIN (the Worker origin, e.g. https://coin-crew.<subdomain>.workers.dev) to build the Mini App.');
  }
  return {
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    plugins: [react(), tailwindcss(), zaloAppConfig()],
    base: command === 'serve' ? '/' : './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rolldownOptions: {
        output: {
          entryFileNames: 'assets/[name].[hash].module.js',
          chunkFileNames: 'assets/[name].[hash].module.js',
          // Same split as apps/web: libraries change less often than the app, so a deploy only re-downloads app code.
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
              { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
            ],
          },
        },
      },
    },
    server: { port: 3000, proxy: { '/api': 'http://localhost:8787' } },
  };
});
