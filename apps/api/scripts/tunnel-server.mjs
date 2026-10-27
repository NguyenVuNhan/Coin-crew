// Runs the local tunnel Worker on port 8789 and keeps its static asset table and D1 schema in sync:
// 1. Kills any orphaned tunnel-server.mjs / workerd / wrangler processes holding port 8789 or 9231.
// 2. Applies local D1 migrations to `.wrangler/tunnel` before starting (and whenever `apps/api/migrations` changes).
// 3. Watches `apps/web/src` and `apps/web/public` so UI edits automatically run `npm run build -w @fsl/web`,
//    which `wrangler dev` then hot-reloads in-place from `apps/api/public` without dropping port 8789.
import { execFileSync, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiDir, '../..');
const migrationsDir = path.join(apiDir, 'migrations');
const webSrcDir = path.join(repoRoot, 'apps', 'web', 'src');
const webPublicDir = path.join(repoRoot, 'apps', 'web', 'public');

const PORT = 8789;
const INSPECTOR_PORT = 9231;
const APP_ORIGIN = 'https://coin-crew-nvn.loca.lt';

let worker = null;
let shuttingDown = false;
let restarting = false;
let building = false;
let pendingBuild = false;

function killPriorInstances() {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | Where-Object { $_.CommandLine -match 'tunnel-server\\.mjs' -and $_.ProcessId -ne ${process.pid} }).ProcessId"`,
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

function freePort(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (pid && pid !== process.pid) {
        try {
          execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {}
      }
    }
  } catch {}
}

function stopWorker() {
  if (!worker) return;
  const proc = worker;
  worker = null;
  proc.removeAllListeners('exit');
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  } else {
    proc.kill();
  }
}

function applyMigrations() {
  execSync('npx wrangler d1 migrations apply fsl --local --persist-to .wrangler/tunnel', {
    cwd: apiDir,
    stdio: 'inherit',
  });
}

function startWorker() {
  if (shuttingDown) return;
  freePort(PORT);
  freePort(INSPECTOR_PORT);
  applyMigrations();

  worker = spawn(
    `npx wrangler dev --local --port ${PORT} --inspector-port ${INSPECTOR_PORT} --persist-to .wrangler/tunnel --var APP_ORIGIN:${APP_ORIGIN}`,
    {
      cwd: apiDir,
      stdio: 'inherit',
      shell: true,
    },
  );

  worker.on('exit', (code) => {
    if (shuttingDown || restarting) return;
    console.log(`${new Date().toISOString()} tunnel worker exited (${code}), restarting in 2s...`);
    worker = null;
    setTimeout(startWorker, 2_000);
  });
}

function restartWorker(reason) {
  if (shuttingDown || restarting) return;
  restarting = true;
  console.log(`\n${new Date().toISOString()} [tunnel:server] ${reason} — restarting wrangler dev to refresh schema...`);
  stopWorker();
  setTimeout(() => {
    restarting = false;
    startWorker();
  }, 500);
}

function runWebBuild() {
  if (shuttingDown) return;
  if (building) {
    pendingBuild = true;
    return;
  }
  building = true;
  console.log(`\n${new Date().toISOString()} [tunnel:server] Web source changed — rebuilding @fsl/web...`);
  const buildProc = spawn('npm run build -w @fsl/web', {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });
  buildProc.on('exit', () => {
    building = false;
    if (pendingBuild) {
      pendingBuild = false;
      runWebBuild();
    }
  });
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const triggerWebBuild = debounce(() => runWebBuild(), 600);
const triggerMigrationRestart = debounce(() => restartWorker('D1 migrations changed'), 600);

for (const dir of [webSrcDir, webPublicDir]) {
  if (fs.existsSync(dir)) {
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename || /\.test\.|__tests__/.test(filename)) return;
      triggerWebBuild();
    });
  }
}

if (fs.existsSync(migrationsDir)) {
  fs.watch(migrationsDir, () => triggerMigrationRestart());
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    stopWorker();
    process.exit(0);
  });
}

killPriorInstances();
startWorker();
