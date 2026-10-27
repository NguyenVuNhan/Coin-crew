// Keeps the local tunnel server (`npm run tunnel:server`, port 8789) public at a fixed loca.lt address, the one the
// Google sign-in callback is registered for. loca.lt's relay sometimes answers 502/503/504 or assigns a fallback
// subdomain if the previous socket hasn't closed yet, so stdout and the public address are checked and the client
// is restarted whenever needed.
import { execFileSync, execSync, spawn } from 'node:child_process';

const PORT = 8789;
const SUBDOMAIN = 'coin-crew-nvn';
const EXPECTED_URL = `https://${SUBDOMAIN}.loca.lt`;
const LOCAL_HEALTH_URL = `http://127.0.0.1:${PORT}/api/me`;
const HEALTH_URL = `${EXPECTED_URL}/api/me`;
const CHECK_EVERY_MS = 20_000;

let client = null;
let connected = false;
let checking = false;
let failures = 0;
let shuttingDown = false;

async function waitForLocalServer() {
  while (!shuttingDown) {
    try {
      const res = await fetch(LOCAL_HEALTH_URL, { signal: AbortSignal.timeout(3_000) });
      if (res.status > 0 && res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

function killOrphanTunnelClients() {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | Where-Object { ($_.CommandLine -match 'scripts[/\\\\]tunnel\\.mjs' -or $_.CommandLine -match 'localtunnel.*--subdomain ${SUBDOMAIN}' -or $_.CommandLine -match 'lt\\.js.*--subdomain ${SUBDOMAIN}') -and $_.ProcessId -ne ${process.pid} }).ProcessId"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (pid) {
        try {
          execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {}
      }
    }
  } catch {}
}

async function start() {
  if (shuttingDown || client) return;
  connected = false;
  failures = 0;
  killOrphanTunnelClients();
  const ready = await waitForLocalServer();
  if (!ready || shuttingDown) return;

  client = spawn(`npx --yes localtunnel@2.0.2 --port ${PORT} --local-host 127.0.0.1 --subdomain ${SUBDOMAIN}`, {
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: true,
  });

  client.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const match = text.match(/your url is:\s*(https?:\/\/\S+)/i);
    if (match) {
      if (match[1].trim() !== EXPECTED_URL) {
        console.log(
          `${new Date().toISOString()} localtunnel assigned ${match[1].trim()} instead of ${EXPECTED_URL}; waiting 10s for loca.lt to release ${SUBDOMAIN}...`,
        );
        stop();
      } else {
        connected = true;
        failures = 0;
      }
    }
  });

  client.on('exit', (code) => {
    connected = false;
    client = null;
    if (shuttingDown) return;
    console.log(`${new Date().toISOString()} tunnel client exited (${code}), starting it again in 10s`);
    setTimeout(start, 10_000);
  });
}

function stop() {
  connected = false;
  if (!client) return;
  // With a shell the pid is the shell's: on Windows only taskkill /T also ends the node process under it.
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(client.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  } else {
    client.kill();
  }
}

async function check() {
  if (!client || !connected || checking || shuttingDown) return;
  checking = true;
  let status = 0;
  try {
    const res = await fetch(HEALTH_URL, {
      headers: { 'bypass-tunnel-reminder': '1' },
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
  } catch {
    status = 0;
  } finally {
    checking = false;
  }
  if (!client || !connected) return;
  failures = status === 0 || status >= 500 ? failures + 1 : 0;
  if (failures >= 2) {
    console.log(`${new Date().toISOString()} ${HEALTH_URL} answered ${status || 'nothing'} twice, restarting the tunnel client`);
    failures = 0;
    stop();
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    if (client) client.removeAllListeners('exit');
    stop();
    process.exit(0);
  });
}

start();
setInterval(check, CHECK_EVERY_MS);
