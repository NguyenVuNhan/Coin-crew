// Keeps the local tunnel server (`npm run tunnel:server`, port 8789) public at a fixed loca.lt address, the one the
// Google sign-in callback is registered for. loca.lt's relay sometimes answers 502/503/504 while the client still
// runs, so the public address is checked every 20s and the client restarted after two failed checks in a row.
import { execFileSync, spawn } from 'node:child_process';

const PORT = 8789;
const SUBDOMAIN = 'coin-crew-nvn';
const HEALTH_URL = `https://${SUBDOMAIN}.loca.lt/api/me`;
const CHECK_EVERY_MS = 20_000;

let client = null;
let failures = 0;

function start() {
  client = spawn(`npx --yes localtunnel@2.0.2 --port ${PORT} --local-host 127.0.0.1 --subdomain ${SUBDOMAIN}`, {
    stdio: 'inherit',
    shell: true,
  });
  client.on('exit', (code) => {
    console.log(`${new Date().toISOString()} tunnel client exited (${code}), starting it again`);
    client = null;
    setTimeout(start, 2_000);
  });
}

function stop() {
  if (!client) return;
  // With a shell the pid is the shell's: on Windows only taskkill /T also ends the node process under it.
  if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(client.pid), '/T', '/F'], { stdio: 'ignore' });
  else client.kill();
}

async function check() {
  let status = 0;
  try {
    const res = await fetch(HEALTH_URL, { headers: { 'bypass-tunnel-reminder': '1' }, signal: AbortSignal.timeout(15_000) });
    status = res.status;
  } catch {
    status = 0;
  }
  failures = status === 0 || status >= 500 ? failures + 1 : 0;
  if (failures >= 2) {
    console.log(`${new Date().toISOString()} ${HEALTH_URL} answered ${status || 'nothing'} twice, restarting the tunnel client`);
    failures = 0;
    stop();
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (client) client.removeAllListeners('exit');
    stop();
    process.exit(0);
  });
}

start();
setInterval(check, CHECK_EVERY_MS);
