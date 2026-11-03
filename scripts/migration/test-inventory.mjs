// Records the test inventory across workspace packages by running Vitest and writing assertion results to JSON.
// Usage: node scripts/migration/test-inventory.mjs <out.json> [--skip-build] [--project <dir>]...
//   --project limits the run to those workspace dirs (e.g. libs/web/screens); --skip-build reuses the last web build.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const onlyProjects = args.flatMap((a, i) => (args[i - 1] === '--project' ? [a.replace(/\\/g, '/').replace(/\/$/, '')] : []));
const outFile = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--project');
if (!outFile) {
  console.error('Usage: node scripts/migration/test-inventory.mjs <out.json> [--skip-build] [--project <dir>]...');
  process.exit(1);
}

const repoRoot = process.cwd();

// 1. Build apps/web (no-sdk-in-web reads its output)
if (!skipBuild) {
  const buildResult = spawnSync('npm run build -w apps/web', {
    cwd: repoRoot,
    shell: true,
    stdio: 'inherit',
  });

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

// 2. Discover workspace directories containing vitest.config.ts
const rootPkgPath = path.join(repoRoot, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const workspacePatterns = rootPkg.workspaces || [];

function expandSegments(currentDir, segments) {
  if (segments.length === 0) {
    if (fs.existsSync(currentDir) && fs.statSync(currentDir).isDirectory()) {
      return [currentDir];
    }
    return [];
  }
  const [first, ...rest] = segments;
  if (first === '*') {
    if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
      return [];
    }
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        results.push(...expandSegments(path.join(currentDir, entry.name), rest));
      }
    }
    return results;
  } else {
    const nextDir = path.join(currentDir, first);
    if (!fs.existsSync(nextDir) || !fs.statSync(nextDir).isDirectory()) {
      return [];
    }
    return expandSegments(nextDir, rest);
  }
}

const candidateDirs = new Set();
for (const pattern of workspacePatterns) {
  const segments = pattern.replace(/\\/g, '/').replace(/^\.\//, '').split('/').filter(Boolean);
  const matched = expandSegments(repoRoot, segments);
  for (const m of matched) {
    candidateDirs.add(m);
  }
}

const testDirs = [];
for (const absDir of candidateDirs) {
  const configPath = path.join(absDir, 'vitest.config.ts');
  if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
    const relDir = path.relative(repoRoot, absDir).replace(/\\/g, '/');
    if (onlyProjects.length === 0 || onlyProjects.includes(relDir)) testDirs.push({ absDir, relDir });
  }
}

testDirs.sort((a, b) => (a.relDir < b.relDir ? -1 : a.relDir > b.relDir ? 1 : 0));

// 3. Run vitest in each directory and collect assertions
const allAssertions = [];
const failedDirs = [];

for (const { absDir, relDir } of testDirs) {
  const tmpFile = path.resolve(
    os.tmpdir(),
    `vitest-inv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  const tmpFilePosix = tmpFile.replace(/\\/g, '/');
  const cmd = `npx vitest run --reporter=json --outputFile="${tmpFilePosix}"`;

  spawnSync(cmd, {
    cwd: absDir,
    shell: true,
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  if (!fs.existsSync(tmpFile)) {
    console.error(relDir);
    failedDirs.push(relDir);
    continue;
  }

  let report;
  try {
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    report = JSON.parse(raw);
  } catch {
    console.error(relDir);
    failedDirs.push(relDir);
    continue;
  } finally {
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch {}
  }

  let dirCount = 0;
  for (const tr of report.testResults || []) {
    const testFileBase = path.posix.basename(tr.name.replace(/\\/g, '/'));
    for (const ar of tr.assertionResults || []) {
      allAssertions.push(`${testFileBase} :: ${ar.fullName} :: ${ar.status}`);
      dirCount++;
    }
  }

  console.log(`${relDir}: ${dirCount} tests`);
}

console.log(`Total: ${allAssertions.length} tests`);

// 4. Output results
allAssertions.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const resolvedOut = path.resolve(repoRoot, outFile);
fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
fs.writeFileSync(resolvedOut, JSON.stringify(allAssertions, null, 2) + '\n', 'utf-8');

if (failedDirs.length > 0) {
  process.exit(1);
}
