import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// App code builds form controls from the shadcn parts in components/ui, never by hand (CLAUDE.md "Use real components").
const src = join(import.meta.dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(src, path).split(sep).join('/')];
  });
}

const code = walk(src).filter(
  (f) => f.endsWith('.tsx') && !f.startsWith('test/') && !f.includes('__tests__/') && !f.startsWith('components/ui/'),
);

/** Each raw tag in app code with its opening tag text, up to the first `>` that closes it. */
function tags(name: string): { at: string; tag: string }[] {
  return code.flatMap((f) => {
    const text = readFileSync(join(src, f), 'utf8');
    return [...text.matchAll(new RegExp(`<${name}\\b[\\s\\S]*?(?<!=)>`, 'g'))].map((m) => ({
      at: `${f}:${text.slice(0, m.index).split('\n').length}`,
      tag: m[0],
    }));
  });
}

/** Inputs no shadcn part covers: file pickers, the zoom slider, and borderless inputs inside a composite field. */
const RAW_INPUT_OK = [/type="file"/, /type="range"/, /fsl-split-sheet__input/, /fsl-ratings__search-input/];

describe('shadcn form controls', () => {
  it('text fields use Input', () => {
    expect(tags('input').filter(({ tag }) => !RAW_INPUT_OK.some((ok) => ok.test(tag))).map(({ at }) => at)).toEqual([]);
  });

  it('dropdowns use NativeSelect', () => {
    expect(tags('select').map(({ at }) => at)).toEqual([]);
  });

  it('field labels use Label', () => {
    expect(tags('label').map(({ at }) => at)).toEqual([]);
  });

  it('switches and tabs use Switch and Tabs', () => {
    const offenders = code.filter((f) => /role="(switch|tablist|tab|checkbox)"/.test(readFileSync(join(src, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
