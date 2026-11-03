import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Keeps the Friendly redesign's rules from eroding: one stylesheet, theme colours only (spec 2026-10-28-shadcn-friendly-redesign).
// Walks the src folder of every web library under libs/web; file ids read "<library>/src/...".
const src = join(import.meta.dirname, '../../..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(src, path).split(sep).join('/')];
  });
}

const files = walk(src).filter((f) => /^[^/]+\/src\//.test(f));
const isTest = (f: string) => /^[^/]+\/src\/test\//.test(f) || f.includes('__tests__/');
const code = files.filter((f) => /\.tsx?$/.test(f) && !isTest(f));

/** Hex colours that are not styling: pixels painted onto a canvas for a saved picture. */
const CANVAS_PAINT = /(fillStyle|strokeStyle|shadowColor)\s*=\s*['"]#/;
/** Files that draw pictures (the QR code and the shareable cost image), where colours are pixels, not page styling. */
const IMAGE_PAINTERS = ['util/src/qr.ts'];

describe('style guard', () => {
  it('globals.css is the only stylesheet', () => {
    expect(files.filter((f) => f.endsWith('.css'))).toEqual(['ui/src/styles/globals.css']);
  });

  it('walks the real source tree', () => {
    expect(code.length).toBeGreaterThan(100);
  });

  it('no file in web-common imports CSS (the shells import globals.css)', () => {
    const importers = code.filter((f) => /import\s+['"][^'"]+\.css['"]/.test(readFileSync(join(src, f), 'utf8')));
    expect(importers).toEqual([]);
  });

  it('no raw hex colours in code', () => {
    const offenders = code.filter((f) => !IMAGE_PAINTERS.includes(f)).flatMap((f) =>
      readFileSync(join(src, f), 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${f}:${i + 1}` }))
        .filter(({ line }) => /['"`\s(]#[0-9a-fA-F]{3,8}\b/.test(line) && !CANVAS_PAINT.test(line) && !/^\s*(\/\/|\*)/.test(line))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });

  it('no old design tokens in code', () => {
    const offenders = code.filter((f) => /var\(--(color|space|text|leading|weight|radius|shadow|motion|ease|font|focus|content|bottom-bar)-/.test(readFileSync(join(src, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
