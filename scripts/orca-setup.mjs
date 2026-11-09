#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_ENV_FILES = [
  'apps/api/.dev.vars',
  'apps/zalo-relay/.env',
  'apps/zalo/.env',
  'apps/zalo/.env.production',
  '.claude/settings.local.json',
  '.impeccable/config.local.json',
];

function defaultGitExec(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export function resolveSourceDir(env = process.env, cwd = process.cwd(), gitExec = defaultGitExec) {
  if (env.ORCA_ROOT_PATH && env.ORCA_ROOT_PATH.trim()) {
    return path.resolve(env.ORCA_ROOT_PATH.trim());
  }

  try {
    const gitCommonDir = gitExec('git rev-parse --path-format=absolute --git-common-dir', cwd).trim();
    if (gitCommonDir) {
      const resolved = path.resolve(gitCommonDir);
      const parent = path.basename(resolved).toLowerCase() === '.git'
        ? path.dirname(resolved)
        : resolved;
      if (fs.existsSync(parent)) {
        return parent;
      }
    }
  } catch {
    // Git command failed or not a git repository
  }

  return null;
}

export function syncEnvironments(sourceDir, targetDir, fileList = DEFAULT_ENV_FILES) {
  if (!sourceDir || !targetDir) return [];

  const resolvedSource = path.resolve(sourceDir);
  const resolvedTarget = path.resolve(targetDir);

  if (resolvedSource.toLowerCase() === resolvedTarget.toLowerCase()) {
    return [];
  }

  const copied = [];
  for (const relPath of fileList) {
    const src = path.resolve(resolvedSource, relPath);
    const dst = path.resolve(resolvedTarget, relPath);

    if (fs.existsSync(src)) {
      const dstDir = path.dirname(dst);
      if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
      }
      fs.copyFileSync(src, dst);
      copied.push(relPath);
    }
  }

  return copied;
}

export function runSetup(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const exec = options.exec ?? ((cmd) => execSync(cmd, { cwd, stdio: 'inherit', env }));

  console.log(`\n========================================`);
  console.log(`  CoinCrew Orca Setup`);
  console.log(`========================================`);
  console.log(`Target directory: ${cwd}`);

  const sourceDir = resolveSourceDir(env, cwd);
  if (sourceDir && path.resolve(sourceDir).toLowerCase() !== path.resolve(cwd).toLowerCase()) {
    console.log(`Source repository: ${sourceDir}`);
    console.log(`Syncing environment files...`);
    const copied = syncEnvironments(sourceDir, cwd);
    if (copied.length > 0) {
      for (const file of copied) {
        console.log(`  ✔ Copied: ${file}`);
      }
    } else {
      console.log(`  (No environment files found in source repository to copy)`);
    }
  } else if (sourceDir && path.resolve(sourceDir).toLowerCase() === path.resolve(cwd).toLowerCase()) {
    console.log(`Running in source repository root; skipping environment copying.`);
  } else {
    console.warn(`Could not resolve source repository root; proceeding with build only.`);
  }

  console.log(`\n[1/3] Installing dependencies...`);
  exec('npm install');

  console.log(`\n[2/3] Applying local D1 database migrations...`);
  exec('npx -w @cc/api wrangler d1 migrations apply fsl --local');

  console.log(`\n[3/3] Building web application (@cc/web)...`);
  exec('npm run build -w @cc/web');

  console.log(`\n✔ CoinCrew workspace setup complete!\n`);
}

// Auto-run if executed directly as a script
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    runSetup();
  } catch (error) {
    console.error(`\n✖ Setup failed:`, error?.message || error);
    process.exit(1);
  }
}
