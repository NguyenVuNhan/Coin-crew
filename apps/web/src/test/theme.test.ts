import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(src, path), 'utf8');

describe('Friendly theme (spec: shadcn Friendly redesign)', () => {
  it('defines the Friendly theme', () => {
    const css = read('styles/globals.css');
    for (const decl of [
      '--background: #f6f7f4',
      '--primary: #0f766e',
      '--secondary: #ccfbf1',
      '--secondary-foreground: #134e4a',
      '--foreground: #1c1917',
      '--muted-foreground: #57534e',
      '--success: #047857',
      '--danger: #be123c',
      '--warning: #b45309',
      '--radius: 1.25rem',
    ]) {
      expect(css).toContain(decl);
    }
  });

  it('loads Be Vietnam Pro with the vietnamese subset', () => {
    const main = read('main.tsx');
    for (const weight of [400, 500, 600, 700]) {
      expect(main).toContain(`@fontsource/be-vietnam-pro/vietnamese-${weight}.css`);
      expect(main).toContain(`@fontsource/be-vietnam-pro/latin-${weight}.css`);
    }
  });
});
