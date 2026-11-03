// Proves the import rules in eslint.config.mjs fire: each case adds one forbidden import, lints through Nx, restores the file.
// Run: npx vitest run scripts/migration/rules.test.mjs
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function lint() {
  const r = spawnSync('npx nx run-many -t lint --output-style=static', {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, NX_DAEMON: 'false', FORCE_COLOR: '0' },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function lintWith(file, line) {
  const original = readFileSync(file, 'utf8');
  try {
    writeFileSync(file, `${original}\n${line}\n`);
    return lint();
  } finally {
    writeFileSync(file, original);
  }
}

const violations = [
  ['ui importing data-access', 'libs/web/ui/src/components/Button.tsx', "import '@cc/web-data-access/client';", /type:ui/],
  ['platform importing ui', 'libs/web/platform/src/browser.ts', "import '@cc/web-ui/lib/utils';", /type:platform/],
  ['data-access importing ui', 'libs/web/data-access/src/focus.ts', "import '@cc/web-ui/lib/utils';", /type:data-access/],
  ['util importing ui', 'libs/web/util/src/time.ts', "import '@cc/web-ui/lib/utils';", /type:util|Circular dependency/],
  ['api-db importing api-auth', 'libs/api/db/src/client.ts', "import '@cc/api-auth/session';", /type:data-access|Circular dependency/],
  ['web importing api', 'libs/web/screens/src/config.ts', "import '@cc/api-util/ids';", /scope:web/],
  ['zmp-sdk outside apps/zalo', 'libs/web/platform/src/browser.ts', "import 'zmp-sdk';", /Only apps\/zalo may import zmp-sdk/],
];

describe('import rules', () => {
  it.each(violations)('rejects %s', (_name, file, line, message) => {
    const { code, out } = lintWith(file, line);
    expect(code).not.toBe(0);
    expect(out).toMatch(message);
  }, 300_000);

  it('passes on the clean tree', () => {
    expect(lint().code).toBe(0);
  }, 300_000);
});
