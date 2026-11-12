// Runs before `wrangler d1 migrations apply --remote` (npm run deploy / db:migrate:remote).
// Stops the deploy when the live d1_migrations table and migrations/ disagree, or when run off main.
// Set ALLOW_REMOTE_MIGRATE=1 to skip the checks once you have confirmed it is safe.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMigrationProblems } from './migration-guard.mjs';

if (process.env.ALLOW_REMOTE_MIGRATE === '1') {
  console.warn('ALLOW_REMOTE_MIGRATE=1: skipping the remote migration checks.');
  process.exit(0);
}

// wrangler's package exports hide bin/, so look it up along Node's node_modules search path.
const wrangler = createRequire(import.meta.url)
  .resolve.paths('wrangler')
  ?.map((dir) => join(dir, 'wrangler', 'bin', 'wrangler.js'))
  .find((file) => existsSync(file));
if (!wrangler) {
  console.error('Could not find wrangler. Run npm install first.');
  process.exit(1);
}
const config = fileURLToPath(new URL('../wrangler.deploy.jsonc', import.meta.url));

/** Runs one query on the live database and returns its rows. */
function query(sql) {
  const out = execFileSync(
    process.execPath,
    [wrangler, 'd1', 'execute', 'fsl', '--remote', '--config', config, '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

function currentBranch() {
  // Cloudflare Workers Builds sets WORKERS_CI_BRANCH; locally ask git.
  if (process.env.WORKERS_CI_BRANCH) return process.env.WORKERS_CI_BRANCH;
  try {
    const name = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    return name && name !== 'HEAD' ? name : null;
  } catch {
    return null;
  }
}

const files = readdirSync(new URL('../migrations', import.meta.url)).filter((name) => name.endsWith('.sql'));
const hasTable = query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'").length > 0;
const applied = hasTable ? query('SELECT name FROM d1_migrations ORDER BY id').map((row) => row.name) : [];

const problems = findMigrationProblems({ applied, files, branch: currentBranch() });
if (problems.length > 0) {
  console.error('Remote migrations stopped:');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('Set ALLOW_REMOTE_MIGRATE=1 to override once you have checked it is safe.');
  process.exit(1);
}
console.log(`Remote migrations check passed (${applied.length} applied, ${files.length - applied.length} pending).`);
