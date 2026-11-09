import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  DEFAULT_ENV_FILES,
  resolveSourceDir,
  syncEnvironments,
} from './orca-setup.mjs';

test('DEFAULT_ENV_FILES contains expected target environments', () => {
  assert.ok(DEFAULT_ENV_FILES.includes('apps/api/.dev.vars'));
  assert.ok(DEFAULT_ENV_FILES.includes('apps/zalo-relay/.env'));
  assert.ok(DEFAULT_ENV_FILES.includes('apps/zalo/.env'));
  assert.ok(DEFAULT_ENV_FILES.includes('apps/zalo/.env.production'));
  assert.ok(DEFAULT_ENV_FILES.includes('.claude/settings.local.json'));
  assert.ok(DEFAULT_ENV_FILES.includes('.impeccable/config.local.json'));
});

test('resolveSourceDir returns ORCA_ROOT_PATH if present in env', () => {
  const env = { ORCA_ROOT_PATH: 'C:/repo/experience/coin-crew' };
  const result = resolveSourceDir(env, 'C:/Users/NvN/orca/workspaces/test');
  assert.equal(result, path.resolve('C:/repo/experience/coin-crew'));
});

test('resolveSourceDir falls back to git common dir parent if ORCA_ROOT_PATH missing', () => {
  const env = {};
  const mockGitExec = () => 'C:/repo/experience/coin-crew/.git\n';
  const result = resolveSourceDir(env, 'C:/Users/NvN/orca/workspaces/test', mockGitExec);
  assert.equal(result, path.resolve('C:/repo/experience/coin-crew'));
});

test('resolveSourceDir returns null if neither ORCA_ROOT_PATH nor git common dir is available', () => {
  const env = {};
  const mockGitExec = () => {
    throw new Error('fatal: not a git repository');
  };
  const result = resolveSourceDir(env, 'C:/tmp', mockGitExec);
  assert.equal(result, null);
});

test('syncEnvironments does nothing if sourceDir equals targetDir', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-setup-test-'));
  try {
    const copied = syncEnvironments(tempDir, tempDir, ['apps/api/.dev.vars']);
    assert.deepEqual(copied, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('syncEnvironments copies existing env files and creates nested directories', () => {
  const tempSource = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-setup-src-'));
  const tempTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-setup-dst-'));
  try {
    // Setup source files
    const srcApiDir = path.join(tempSource, 'apps', 'api');
    fs.mkdirSync(srcApiDir, { recursive: true });
    fs.writeFileSync(path.join(srcApiDir, '.dev.vars'), 'SECRET=123');

    const srcClaudeDir = path.join(tempSource, '.claude');
    fs.mkdirSync(srcClaudeDir, { recursive: true });
    fs.writeFileSync(path.join(srcClaudeDir, 'settings.local.json'), '{"theme":"dark"}');

    const filesToSync = [
      'apps/api/.dev.vars',
      'apps/zalo-relay/.env', // does not exist in src, should be skipped safely
      '.claude/settings.local.json',
    ];

    const copied = syncEnvironments(tempSource, tempTarget, filesToSync);

    assert.equal(copied.length, 2);
    assert.ok(copied.includes('apps/api/.dev.vars'));
    assert.ok(copied.includes('.claude/settings.local.json'));

    // Check target content
    const targetDevVars = fs.readFileSync(path.join(tempTarget, 'apps', 'api', '.dev.vars'), 'utf8');
    assert.equal(targetDevVars, 'SECRET=123');

    const targetClaudeSettings = fs.readFileSync(path.join(tempTarget, '.claude', 'settings.local.json'), 'utf8');
    assert.equal(targetClaudeSettings, '{"theme":"dark"}');

    // Verify non-existent file was not created
    assert.ok(!fs.existsSync(path.join(tempTarget, 'apps', 'zalo-relay', '.env')));
  } finally {
    fs.rmSync(tempSource, { recursive: true, force: true });
    fs.rmSync(tempTarget, { recursive: true, force: true });
  }
});

test('runSetup calls npm install, wrangler migrations, and npm build in sequence', () => {
  const executedCommands = [];
  const mockExec = (cmd) => {
    executedCommands.push(cmd);
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-setup-run-'));
  try {
    import('./orca-setup.mjs').then(({ runSetup }) => {
      runSetup({
        cwd: tempDir,
        env: { ORCA_ROOT_PATH: tempDir },
        exec: mockExec,
      });

      assert.deepEqual(executedCommands, [
        'npm install',
        'npx -w @cc/api wrangler d1 migrations apply fsl --local',
        'npm run build -w @cc/web',
      ]);
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

