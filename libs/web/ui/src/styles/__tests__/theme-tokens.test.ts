import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_IDS, type ThemeId } from '@cc/core';

const css = readFileSync(join(import.meta.dirname, '../globals.css'), 'utf8');

function extractProperties(blockContent: string): Record<string, string> {
  const stripped = blockContent.replace(/\/\*[\s\S]*?\*\//g, '');
  const decls: Record<string, string> = {};
  const propRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(stripped)) !== null) {
    decls[match[1]!] = match[2]!.trim();
  }
  return decls;
}

function getThemeBlock(cssContent: string, themeId: ThemeId): string | null {
  const regex = new RegExp(`(?::root\\s*,\\s*)?\\[data-theme=['"]${themeId}['"]\\]\\s*\\{([^}]+)\\}`, 'm');
  const match = cssContent.match(regex);
  return match?.[1] ?? null;
}

function getRootBlock(cssContent: string): string | null {
  const match = cssContent.match(/(?:^|\})\s*:root\s*\{([^}]+)\}/m);
  return match?.[1] ?? null;
}

function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim();
  const clean = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function relativeLuminance(hex: string): number {
  const [r8, g8, b8] = parseHex(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getHue(hex: string): number {
  const [r8, g8, b8] = parseHex(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h = 0;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

function hueDistance(hex1: string, hex2: string): number {
  const h1 = getHue(hex1);
  const h2 = getHue(hex2);
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

const THEMEABLE_TOKENS = [
  '--background',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--ring',
] as const;

const MONEY_COLOURS = ['#047857', '#be123c', '#b45309'] as const;

describe('theme tokens in globals.css', () => {
  it('every theme has a block, jade included', () => {
    const jadeBlockMatch = css.match(/:root\s*,\s*\[data-theme=['"]jade['"]\]\s*\{([^}]+)\}/m);
    expect(jadeBlockMatch).not.toBeNull();

    for (const id of THEME_IDS) {
      const block = getThemeBlock(css, id);
      expect(block, `theme block for ${id} must exist`).not.toBeNull();
    }
  });

  it('themes set only the six themeable tokens', () => {
    for (const id of THEME_IDS) {
      const block = getThemeBlock(css, id);
      expect(block).not.toBeNull();
      const props = extractProperties(block!);
      const propNames = Object.keys(props).sort();
      expect(propNames).toEqual([...THEMEABLE_TOKENS].sort());

      for (const prop of propNames) {
        expect(prop).not.toMatch(/^--(success|danger|warning|avatar-)/);
      }
    }
  });

  it('every theme passes AA', () => {
    const rootBlock = getRootBlock(css);
    expect(rootBlock).not.toBeNull();
    const rootProps = extractProperties(rootBlock!);
    const foreground = rootProps['--foreground']!;
    const mutedForeground = rootProps['--muted-foreground']!;
    expect(foreground).toBe('#1c1917');
    expect(mutedForeground).toBe('#57534e');

    for (const id of THEME_IDS) {
      const block = getThemeBlock(css, id);
      expect(block).not.toBeNull();
      const tokens = extractProperties(block!);

      const primary = tokens['--primary']!;
      const primaryFg = tokens['--primary-foreground']!;
      const secondary = tokens['--secondary']!;
      const secondaryFg = tokens['--secondary-foreground']!;
      const wash = tokens['--background']!;

      // primary-foreground / primary
      expect(contrastRatio(primaryFg, primary)).toBeGreaterThanOrEqual(4.5);
      // primary on white
      expect(contrastRatio(primary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
      // primary on wash
      expect(contrastRatio(primary, wash)).toBeGreaterThanOrEqual(4.5);
      // primary on secondary
      expect(contrastRatio(primary, secondary)).toBeGreaterThanOrEqual(4.5);
      // secondary-foreground / secondary
      expect(contrastRatio(secondaryFg, secondary)).toBeGreaterThanOrEqual(4.5);
      // foreground on wash
      expect(contrastRatio(foreground, wash)).toBeGreaterThanOrEqual(4.5);
      // muted-foreground on wash
      expect(contrastRatio(mutedForeground, wash)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('no new theme looks like a money colour', () => {
    const newThemes: ThemeId[] = ['orchid', 'sky', 'indigo'];
    for (const id of newThemes) {
      const block = getThemeBlock(css, id);
      expect(block).not.toBeNull();
      const tokens = extractProperties(block!);
      const primary = tokens['--primary']!;

      for (const money of MONEY_COLOURS) {
        const dist = hueDistance(primary, money);
        expect(
          dist,
          `hue distance between ${id} (${primary}) and money colour (${money}) must be >= 30°`,
        ).toBeGreaterThanOrEqual(30);
      }
    }
  });
});
