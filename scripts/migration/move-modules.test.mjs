import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { moveModules, repairImports } from './move-modules.mjs';

function createRepo(extraFiles = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-move-test-'));
  const baseFiles = {
    'package.json': JSON.stringify({ workspaces: ['libs/*/*'] }, null, 2),
    'libs/web/screens/package.json': JSON.stringify({
      name: '@x/screens',
      exports: { '.': './src/index.ts' },
    }, null, 2),
    'libs/web/screens/src/index.ts': 'export const screens = true;',
    'libs/web/util/package.json': JSON.stringify({
      name: '@x/util',
      exports: { './*': './src/*.ts' },
    }, null, 2),
    'libs/web/i18n/package.json': JSON.stringify({
      name: '@x/i18n',
      exports: { '.': './src/index.ts', './vi': './src/vi.ts' },
    }, null, 2),
    'libs/web/i18n/src/index.ts': 'export const t = (s) => s;',
    'libs/web/i18n/src/vi.ts': 'export default {};',
  };

  const allFiles = { ...baseFiles, ...extraFiles };
  for (const [relPath, content] of Object.entries(allFiles)) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
  }

  function exists(relPath) {
    return fs.existsSync(path.join(root, relPath));
  }

  return { root, read, exists };
}

describe('moveModules', () => {
  it('rewrites an importer in the old project to the package subpath', async () => {
    // screens/src/components/Row.tsx: import { fmt } from '../lib/time'; move lib/time.ts -> util/src/time.ts
    const { root, read } = createRepo({
      'libs/web/screens/src/lib/time.ts': 'export const fmt = () => "";',
      'libs/web/screens/src/components/Row.tsx': "import { fmt } from '../lib/time';",
    });

    await moveModules({
      root,
      git: false,
      scan: ['libs'],
      moves: [{ from: 'libs/web/screens/src/lib/time.ts', to: 'libs/web/util/src/time.ts' }],
    });

    expect(read('libs/web/screens/src/components/Row.tsx')).toContain("from '@x/util/time'");
  });

  it('keeps a relative import between two files moved together', async () => {
    // lib/activityText.ts imports './tripText'; both move to util/src/
    const { root, read } = createRepo({
      'libs/web/screens/src/lib/tripText.ts': 'export const trip = "trip";',
      'libs/web/screens/src/lib/activityText.ts': "import { trip } from './tripText';",
    });

    await moveModules({
      root,
      git: false,
      scan: ['libs'],
      moves: [
        { from: 'libs/web/screens/src/lib/tripText.ts', to: 'libs/web/util/src/tripText.ts' },
        { from: 'libs/web/screens/src/lib/activityText.ts', to: 'libs/web/util/src/activityText.ts' },
      ],
    });

    expect(read('libs/web/util/src/activityText.ts')).toContain("from './tripText'");
  });

  it("leaves a moved file's package import of a lower package unchanged", async () => {
    // screens/src/lib/time.ts has "import { t } from '@x/i18n';" ; move time.ts -> util/src/time.ts
    const { root, read } = createRepo({
      'libs/web/screens/src/lib/time.ts': "import { t } from '@x/i18n';\nexport const time = t('now');",
    });

    await moveModules({
      root,
      git: false,
      scan: ['libs'],
      moves: [{ from: 'libs/web/screens/src/lib/time.ts', to: 'libs/web/util/src/time.ts' }],
    });

    expect(read('libs/web/util/src/time.ts')).toContain("from '@x/i18n'");
  });

  it('rewrites vi.mock and vi.importActual specifiers', async () => {
    const { root, read } = createRepo({
      'libs/web/screens/src/lib/time.ts': 'export const time = 123;',
      'libs/web/screens/src/components/Row.test.ts': [
        "vi.mock('../lib/time');",
        "const actual = await vi.importActual<typeof import('../lib/time')>('../lib/time');",
      ].join('\n'),
    });

    await moveModules({
      root,
      git: false,
      scan: ['libs'],
      moves: [{ from: 'libs/web/screens/src/lib/time.ts', to: 'libs/web/util/src/time.ts' }],
    });

    const text = read('libs/web/screens/src/components/Row.test.ts');
    expect(text).toContain("vi.mock('@x/util/time'");
    expect(text).toContain("vi.importActual<typeof import('@x/util/time')>('@x/util/time')");
  });

  it('keeps a ?raw query', async () => {
    // "import viRaw from '../i18n/vi.ts?raw'" where vi.ts moves into i18n -> "from '@x/i18n/vi?raw'"
    const { root, read } = createRepo({
      'libs/web/screens/src/i18n/vi.ts': 'export default {};',
      'libs/web/screens/src/components/Row.tsx': "import viRaw from '../i18n/vi.ts?raw';",
    });

    await moveModules({
      root,
      git: false,
      scan: ['libs'],
      moves: [{ from: 'libs/web/screens/src/i18n/vi.ts', to: 'libs/web/i18n/src/vi.ts' }],
    });

    expect(read('libs/web/screens/src/components/Row.tsx')).toContain("from '@x/i18n/vi?raw'");
  });

  it('resolves the @/ alias', async () => {
    // aliases: { '@/': 'libs/web/screens/src/' }; "from '@/lib/utils'", utils.ts moves to util/src -> "from '@x/util/utils'"
    const { root, read } = createRepo({
      'libs/web/screens/src/lib/utils.ts': 'export const utils = 1;',
      'libs/web/screens/src/components/Row.tsx': "import { utils } from '@/lib/utils';",
    });

    await moveModules({
      root,
      git: false,
      scan: ['libs'],
      aliases: { '@/': 'libs/web/screens/src/' },
      moves: [{ from: 'libs/web/screens/src/lib/utils.ts', to: 'libs/web/util/src/utils.ts' }],
    });

    expect(read('libs/web/screens/src/components/Row.tsx')).toContain("from '@x/util/utils'");
  });

  it('throws before moving anything when a moved file imports something that stays in a package without a matching export', async () => {
    // move screens/src/lib/time.ts -> util/src/time.ts while time.ts imports '../config' (stays in screens, which exports only ".")
    const { root, exists } = createRepo({
      'libs/web/screens/src/config.ts': 'export const config = {};',
      'libs/web/screens/src/lib/time.ts': "import { config } from '../config';",
    });

    await expect(
      moveModules({
        root,
        git: false,
        scan: ['libs'],
        moves: [{ from: 'libs/web/screens/src/lib/time.ts', to: 'libs/web/util/src/time.ts' }],
      })
    ).rejects.toThrow(/No export of @x\/screens matches/);

    expect(exists('libs/web/screens/src/lib/time.ts')).toBe(true);
  });

  it('throws on an unresolvable relative or alias specifier', async () => {
    // a scanned file imports './missing' -> rejects.toThrow(/Cannot resolve '.\/missing'/)
    const { root } = createRepo({
      'libs/web/screens/src/components/Row.tsx': "import { missing } from './missing';",
    });

    await expect(
      moveModules({
        root,
        git: false,
        scan: ['libs'],
        moves: [],
      })
    ).rejects.toThrow(/Cannot resolve '.\/missing'/);
  });

  it('leaves unrelated specifiers byte-identical', async () => {
    // a file importing 'react', 'node:fs', './Sibling' (neither moved) is unchanged: expect(after).toBe(before)
    const { root, read } = createRepo({
      'libs/web/screens/src/components/Sibling.ts': 'export const s = 1;',
      'libs/web/screens/src/components/Row.tsx': "import React from 'react';\nimport fs from 'node:fs';\nimport { s } from './Sibling';\n",
    });

    const before = read('libs/web/screens/src/components/Row.tsx');
    await moveModules({
      root,
      git: false,
      scan: ['libs'],
      moves: [],
    });
    const after = read('libs/web/screens/src/components/Row.tsx');

    expect(after).toBe(before);
  });

  it("resolves a NodeNext '.js' specifier to its '.ts' file", async () => {
    // relay-style "import { app } from './app.js'" where only app.ts exists: resolvable, so untouched
    const { root, read } = createRepo({
      'libs/web/screens/src/app.ts': 'export const app = 1;',
      'libs/web/screens/src/server.ts': "import { app } from './app.js';\n",
    });

    const before = read('libs/web/screens/src/server.ts');
    await moveModules({ root, git: false, scan: ['libs'], moves: [] });
    await repairImports({ root, history: [], scan: ['libs'] });

    expect(read('libs/web/screens/src/server.ts')).toBe(before);
  });
});

describe('repairImports', () => {
  it('rewrites a stale import in a file added under a moved folder', async () => {
    // history: [{from:'packages/screens/', to:'libs/web/screens/'}, {from:'libs/web/screens/src/lib/time.ts', to:'libs/web/util/src/time.ts'}]
    // libs/web/screens/src/components/New.tsx (new file, written against the old layout) imports '../lib/time'
    const { root, read } = createRepo({
      'libs/web/util/src/time.ts': 'export const time = 1;',
      'libs/web/screens/src/components/New.tsx': "import { time } from '../lib/time';",
    });

    await repairImports({
      root,
      scan: ['libs'],
      history: [
        { from: 'packages/screens/', to: 'libs/web/screens/' },
        { from: 'libs/web/screens/src/lib/time.ts', to: 'libs/web/util/src/time.ts' },
      ],
    });

    expect(read('libs/web/screens/src/components/New.tsx')).toContain("from '@x/util/time'");
  });

  it('rewrites a stale import between two files that moved together', async () => {
    // libs/web/util/src/activityText.ts gained "import { x } from '../lib/tripText'" (old-layout path); tripText moved alongside
    const { root, read } = createRepo({
      'libs/web/util/src/tripText.ts': 'export const trip = 1;',
      'libs/web/util/src/activityText.ts': "import { x } from '../lib/tripText';",
    });

    await repairImports({
      root,
      scan: ['libs'],
      history: [
        { from: 'libs/web/screens/src/lib/activityText.ts', to: 'libs/web/util/src/activityText.ts' },
        { from: 'libs/web/screens/src/lib/tripText.ts', to: 'libs/web/util/src/tripText.ts' },
      ],
    });

    expect(read('libs/web/util/src/activityText.ts')).toContain("from './tripText'");
  });

  it('leaves resolvable specifiers alone', async () => {
    // a file whose imports all resolve is byte-identical afterwards
    const { root, read } = createRepo({
      'libs/web/screens/src/components/Sibling.ts': 'export const sib = 1;',
      'libs/web/screens/src/components/Row.tsx': "import { sib } from './Sibling';\n",
    });

    const before = read('libs/web/screens/src/components/Row.tsx');
    await repairImports({
      root,
      scan: ['libs'],
      history: [],
    });
    const after = read('libs/web/screens/src/components/Row.tsx');

    expect(after).toBe(before);
  });

  it('throws listing every import it cannot place', async () => {
    // a file imports '../lib/nowhere' -> rejects.toThrow(/New\.tsx: '..\/lib\/nowhere'/)
    const { root } = createRepo({
      'libs/web/screens/src/components/New.tsx': "import { nowhere } from '../lib/nowhere';",
    });

    await expect(
      repairImports({
        root,
        scan: ['libs'],
        history: [],
      })
    ).rejects.toThrow(/New\.tsx: '..\/lib\/nowhere'/);
  });
});
