#!/usr/bin/env node
// `npm run tunnel`: the DSM reverse proxy (TUNNEL_ORIGIN in .env.tunnel.local, see docs/setup.md 3.1).
// `npm run tunnel:ngrok`: the ngrok fallback for when this machine is away from the DSM's network.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NGROK_ORIGIN = 'https://sawfish-dear-heron.ngrok-free.app';
export const LOCAL_FILE = '.env.tunnel.local';

export function readTunnelOrigin(text) {
  const match = /^\s*TUNNEL_ORIGIN\s*=\s*["']?([^"'\s#]+)/m.exec(text ?? '');
  return match ? match[1].replace(/\/+$/, '') : null;
}

export function tunnelCommand(provider, origin) {
  const web = '"npm run dev -w @cc/web"';
  if (provider === 'ngrok') {
    const api = `"npm run dev -w @cc/api -- --var APP_ORIGIN:${NGROK_ORIGIN}"`;
    return `concurrently --kill-others ${web} ${api} "ngrok http 8787 --url ${NGROK_ORIGIN}"`;
  }
  // The DSM reaches this machine over the LAN, so wrangler must listen beyond localhost.
  return `concurrently --kill-others ${web} "npm run dev -w @cc/api -- --ip 0.0.0.0 --var APP_ORIGIN:${origin}"`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const provider = process.argv[2] === 'ngrok' ? 'ngrok' : 'dsm';
  const root = fileURLToPath(new URL('..', import.meta.url));
  const file = new URL(`../${LOCAL_FILE}`, import.meta.url);
  const origin = provider === 'dsm' && fs.existsSync(file) ? readTunnelOrigin(fs.readFileSync(file, 'utf8')) : null;
  if (provider === 'dsm' && !origin) {
    console.error(`No TUNNEL_ORIGIN in ${LOCAL_FILE} (see docs/setup.md 3.1). Away from home? Run npm run tunnel:ngrok.`);
    process.exit(1);
  }
  console.log(`Tunnel: ${provider === 'ngrok' ? NGROK_ORIGIN : origin}`);
  execSync('npm run build -w @cc/web', { cwd: root, stdio: 'inherit' });
  execSync(tunnelCommand(provider, origin), { cwd: root, stdio: 'inherit' });
}
