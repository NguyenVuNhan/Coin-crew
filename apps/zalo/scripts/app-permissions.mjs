#!/usr/bin/env node
/**
 * Lists and requests Zalo Mini App permissions through Zalo's Open API
 * (https://docs.zaloplatforms.com/docs/MA/openApis/partner/apis/appPermission).
 *
 *   npm run permissions -w @fsl/zalo                       # list, with each one's status
 *   npm run permissions -w @fsl/zalo -- list outapp        # only names/actions matching "outapp"
 *   npm run permissions -w @fsl/zalo -- request 25 38 --note "…" --consent "…"
 *
 * Reads apps/zalo/.env (and the process environment):
 *   APP_ID                                   the Mini App id (already used by zmp-cli)
 *   ZMP_PARTNER_API_KEY + ZMP_PARTNER_ID     partner credentials (X-Partner-Api-Key / X-Partner-Id), or
 *   ZMP_OPENAPI_KEY + ZALO_APP_ID            owner Open API key (X-Api-Key / X-Zalo-AppID)
 * Endpoints and headers follow the official SDK, zmp-openapi-nodejs 2.4.3.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOMAIN = 'https://openapi.mini.zalo.me';

function loadEnv() {
  const env = {};
  try {
    const file = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../.env'), 'utf8');
    for (const line of file.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // no .env: rely on the process environment
  }
  return { ...env, ...process.env };
}

/** The base path and headers for whichever credentials are configured. */
export function clientFor(env) {
  if (env.ZMP_PARTNER_API_KEY && env.ZMP_PARTNER_ID) {
    return {
      kind: 'partner',
      base: `${DOMAIN}/partners/apps`,
      headers: { 'X-Partner-Api-Key': `Bearer ${env.ZMP_PARTNER_API_KEY}`, 'X-Partner-Id': env.ZMP_PARTNER_ID },
    };
  }
  if (env.ZMP_OPENAPI_KEY && env.ZALO_APP_ID) {
    return {
      kind: 'owner',
      base: `${DOMAIN}/apps`,
      headers: { 'X-Api-Key': `Bearer ${env.ZMP_OPENAPI_KEY}`, 'X-Zalo-AppID': env.ZALO_APP_ID },
    };
  }
  return null;
}

/** Splits `request 25 38 --note x --consent y` into ids and options. */
export function parseRequestArgs(args) {
  const ids = [];
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--note' || a === '--consent') {
      opts[a.slice(2)] = args[++i];
    } else if (/^\d+$/.test(a)) {
      ids.push(Number(a));
    } else {
      throw new Error(`Unexpected argument: ${a}`);
    }
  }
  if (ids.length === 0) throw new Error('Give at least one permission id, e.g. `request 25`.');
  return {
    permissions: ids.map((permissionId) => (opts.consent ? { permissionId, consentText: opts.consent } : { permissionId })),
    ...(opts.note ? { note: opts.note } : {}),
  };
}

async function call(client, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { ...client.headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok || (typeof json.err === 'number' && json.err !== 0)) {
    throw new Error(`HTTP ${res.status}, err ${json.err}: ${json.msg ?? text.slice(0, 300)}`);
  }
  return json.data ?? json;
}

async function main() {
  const env = loadEnv();
  const appId = env.APP_ID;
  if (!appId) throw new Error('APP_ID is missing (apps/zalo/.env).');
  const client = clientFor(env);
  if (!client) {
    throw new Error(
      'No Open API credentials. Set ZMP_PARTNER_API_KEY + ZMP_PARTNER_ID, or ZMP_OPENAPI_KEY + ZALO_APP_ID, in apps/zalo/.env.',
    );
  }
  const [cmd = 'list', ...rest] = process.argv.slice(2);

  if (cmd === 'list') {
    const filter = (rest[0] ?? '').toLowerCase();
    const data = await call(client, 'GET', `${client.base}/${appId}/permissions`);
    const rows = (data.permissions ?? []).filter((p) =>
      !filter || `${p.name} ${p.action} ${p.description}`.toLowerCase().includes(filter),
    );
    for (const p of rows) {
      console.log(`${String(p.permissionId).padStart(4)}  ${p.status.padEnd(16)}  ${p.action ?? ''}  ${p.name ?? ''}`);
    }
    console.log(`\n${rows.length} of ${data.total ?? rows.length} permissions (${client.kind} credentials).`);
    return;
  }

  if (cmd === 'request') {
    const body = parseRequestArgs(rest);
    const data = await call(client, 'POST', `${client.base}/${appId}/request-permission`, body);
    const ok = data.successPermissions ?? [];
    console.log(`Requested: ${ok.join(', ') || 'none'}`);
    const missed = body.permissions.map((p) => p.permissionId).filter((id) => !ok.includes(id));
    if (missed.length) console.log(`Not accepted: ${missed.join(', ')} (already requested or approved?)`);
    return;
  }

  throw new Error(`Unknown command "${cmd}". Use "list" or "request".`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
