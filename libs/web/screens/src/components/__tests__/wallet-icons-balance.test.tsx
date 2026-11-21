import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENCY_CODES } from '@cc/core';
import { WalletIcon, type WalletIconSize } from '../WalletIcon';
import { CurrencyBadge } from '../CurrencyBadge';
import {
  WALLET_ICON_PACKAGES,
  WALLET_PASTEL_TONES,
  resolveWalletIcon,
  searchWalletIcons,
  walletIconClass,
} from '../../lib/walletIcon';

const ASSETS_ROOT = join(import.meta.dirname, '../../assets');
const WALLET_ICONS_DIR = join(ASSETS_ROOT, 'wallet-icons');
const CURRENCY_ICONS_DIR = join(ASSETS_ROOT, 'currency-icons');

function collectSvgFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectSvgFiles(full));
    } else if (name.endsWith('.svg')) {
      out.push(full);
    }
  }
  return out.sort();
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function addPoint(box: BBox, x: number, y: number): void {
  if (Number.isNaN(x) || Number.isNaN(y)) return;
  if (x < box.minX) box.minX = x;
  if (y < box.minY) box.minY = y;
  if (x > box.maxX) box.maxX = x;
  if (y > box.maxY) box.maxY = y;
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

function tokenizePath(d: string): string[] {
  const tokens: string[] = [];
  const re = /([a-zA-Z])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

function parsePathBounds(d: string, box: BBox): void {
  const tokens = tokenizePath(d);
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCpX = 0;
  let prevCpY = 0;
  let prevCmd = '';

  const isCmd = (tok: string) => /^[a-zA-Z]$/.test(tok);
  const nextNum = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (isCmd(tokens[i]!)) {
      cmd = tokens[i++]!;
      if (cmd === 'Z' || cmd === 'z') {
        cx = sx;
        cy = sy;
        prevCmd = cmd;
        continue;
      }
    }

    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    if (upper === 'M') {
      const x = nextNum() + (rel ? cx : 0);
      const y = nextNum() + (rel ? cy : 0);
      cx = x;
      cy = y;
      sx = x;
      sy = y;
      addPoint(box, cx, cy);
      prevCmd = cmd;
      cmd = rel ? 'l' : 'L';
    } else if (upper === 'L') {
      const x = nextNum() + (rel ? cx : 0);
      const y = nextNum() + (rel ? cy : 0);
      cx = x;
      cy = y;
      addPoint(box, cx, cy);
      prevCmd = cmd;
    } else if (upper === 'H') {
      cx = nextNum() + (rel ? cx : 0);
      addPoint(box, cx, cy);
      prevCmd = cmd;
    } else if (upper === 'V') {
      cy = nextNum() + (rel ? cy : 0);
      addPoint(box, cx, cy);
      prevCmd = cmd;
    } else if (upper === 'C') {
      const x1 = nextNum() + (rel ? cx : 0);
      const y1 = nextNum() + (rel ? cy : 0);
      const x2 = nextNum() + (rel ? cx : 0);
      const y2 = nextNum() + (rel ? cy : 0);
      const x = nextNum() + (rel ? cx : 0);
      const y = nextNum() + (rel ? cy : 0);
      for (let t = 0; t <= 1.001; t += 0.2) {
        addPoint(box, cubicAt(cx, x1, x2, x, Math.min(1, t)), cubicAt(cy, y1, y2, y, Math.min(1, t)));
      }
      prevCpX = x2;
      prevCpY = y2;
      cx = x;
      cy = y;
      prevCmd = cmd;
    } else if (upper === 'S') {
      const hasPrev = prevCmd.toUpperCase() === 'C' || prevCmd.toUpperCase() === 'S';
      const x1 = hasPrev ? 2 * cx - prevCpX : cx;
      const y1 = hasPrev ? 2 * cy - prevCpY : cy;
      const x2 = nextNum() + (rel ? cx : 0);
      const y2 = nextNum() + (rel ? cy : 0);
      const x = nextNum() + (rel ? cx : 0);
      const y = nextNum() + (rel ? cy : 0);
      for (let t = 0; t <= 1.001; t += 0.2) {
        addPoint(box, cubicAt(cx, x1, x2, x, Math.min(1, t)), cubicAt(cy, y1, y2, y, Math.min(1, t)));
      }
      prevCpX = x2;
      prevCpY = y2;
      cx = x;
      cy = y;
      prevCmd = cmd;
    } else if (upper === 'Q') {
      const x1 = nextNum() + (rel ? cx : 0);
      const y1 = nextNum() + (rel ? cy : 0);
      const x = nextNum() + (rel ? cx : 0);
      const y = nextNum() + (rel ? cy : 0);
      for (let t = 0; t <= 1.001; t += 0.2) {
        addPoint(box, quadAt(cx, x1, x, Math.min(1, t)), quadAt(cy, y1, y, Math.min(1, t)));
      }
      prevCpX = x1;
      prevCpY = y1;
      cx = x;
      cy = y;
      prevCmd = cmd;
    } else if (upper === 'T') {
      const hasPrev = prevCmd.toUpperCase() === 'Q' || prevCmd.toUpperCase() === 'T';
      const x1 = hasPrev ? 2 * cx - prevCpX : cx;
      const y1 = hasPrev ? 2 * cy - prevCpY : cy;
      const x = nextNum() + (rel ? cx : 0);
      const y = nextNum() + (rel ? cy : 0);
      for (let t = 0; t <= 1.001; t += 0.2) {
        addPoint(box, quadAt(cx, x1, x, Math.min(1, t)), quadAt(cy, y1, y, Math.min(1, t)));
      }
      prevCpX = x1;
      prevCpY = y1;
      cx = x;
      cy = y;
      prevCmd = cmd;
    } else if (upper === 'A') {
      let rx = Math.abs(nextNum());
      let ry = Math.abs(nextNum());
      const phi = (nextNum() * Math.PI) / 180;
      const largeArc = nextNum() !== 0;
      const sweep = nextNum() !== 0;
      const x = nextNum() + (rel ? cx : 0);
      const y = nextNum() + (rel ? cy : 0);
      addPoint(box, cx, cy);
      addPoint(box, x, y);
      if (rx > 0 && ry > 0 && (cx !== x || cy !== y)) {
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);
        const dx2 = (cx - x) / 2;
        const dy2 = (cy - y) / 2;
        const x1p = cosPhi * dx2 + sinPhi * dy2;
        const y1p = -sinPhi * dx2 + cosPhi * dy2;
        const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
        if (lambda > 1) {
          const s = Math.sqrt(lambda);
          rx *= s;
          ry *= s;
        }
        const rx2 = rx * rx;
        const ry2 = ry * ry;
        const num = Math.max(0, rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p);
        const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
        const factor = den === 0 ? 0 : (largeArc === sweep ? -1 : 1) * Math.sqrt(num / den);
        const cxp = factor * ((rx * y1p) / ry);
        const cyp = factor * (-(ry * x1p) / rx);
        const centerX = cosPhi * cxp - sinPhi * cyp + (cx + x) / 2;
        const centerY = sinPhi * cxp + cosPhi * cyp + (cy + y) / 2;
        const vecAngle = (ux: number, uy: number, vx: number, vy: number) => {
          const dot = ux * vx + uy * vy;
          const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
          const ratio = len === 0 ? 1 : Math.max(-1, Math.min(1, dot / len));
          return (ux * vy - uy * vx < 0 ? -1 : 1) * Math.acos(ratio);
        };
        const t1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
        let dt = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
        if (!sweep && dt > 0) dt -= Math.PI * 2;
        if (sweep && dt < 0) dt += Math.PI * 2;
        for (let step = 1; step < 12; step++) {
          const a = t1 + (dt * step) / 12;
          const px = cosPhi * rx * Math.cos(a) - sinPhi * ry * Math.sin(a) + centerX;
          const py = sinPhi * rx * Math.cos(a) + cosPhi * ry * Math.sin(a) + centerY;
          addPoint(box, px, py);
        }
      }
      cx = x;
      cy = y;
      prevCmd = cmd;
    } else {
      i++;
    }
  }
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m?.[1];
}

function measureSvgBounds(svgText: string): { viewBoxN: number; box: BBox } {
  const vbMatch = /viewBox\s*=\s*"0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/.exec(svgText);
  expect(vbMatch).not.toBeNull();
  const w = Number(vbMatch![1]);
  const h = Number(vbMatch![2]);
  expect(w).toBe(h);
  expect(w).toBeGreaterThanOrEqual(24);

  const box: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const tagRe = /<([a-zA-Z0-9-]+)\b([^>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(svgText)) !== null) {
    const tagName = match[1]!.toLowerCase();
    const attrs = match[2]!;
    if (tagName === 'path') {
      const d = attr(attrs, 'd');
      if (d) parsePathBounds(d, box);
    } else if (tagName === 'circle') {
      const cx = Number(attr(attrs, 'cx') ?? 0);
      const cy = Number(attr(attrs, 'cy') ?? 0);
      const r = Number(attr(attrs, 'r') ?? 0);
      addPoint(box, cx - r, cy - r);
      addPoint(box, cx + r, cy + r);
    } else if (tagName === 'ellipse') {
      const cx = Number(attr(attrs, 'cx') ?? 0);
      const cy = Number(attr(attrs, 'cy') ?? 0);
      const rx = Number(attr(attrs, 'rx') ?? 0);
      const ry = Number(attr(attrs, 'ry') ?? 0);
      addPoint(box, cx - rx, cy - ry);
      addPoint(box, cx + rx, cy + ry);
    } else if (tagName === 'rect') {
      const x = Number(attr(attrs, 'x') ?? 0);
      const y = Number(attr(attrs, 'y') ?? 0);
      const rw = Number(attr(attrs, 'width') ?? 0);
      const rh = Number(attr(attrs, 'height') ?? 0);
      addPoint(box, x, y);
      addPoint(box, x + rw, y + rh);
    } else if (tagName === 'line') {
      const x1 = Number(attr(attrs, 'x1') ?? 0);
      const y1 = Number(attr(attrs, 'y1') ?? 0);
      const x2 = Number(attr(attrs, 'x2') ?? 0);
      const y2 = Number(attr(attrs, 'y2') ?? 0);
      addPoint(box, x1, y1);
      addPoint(box, x2, y2);
    } else if (tagName === 'polygon' || tagName === 'polyline') {
      const pts = attr(attrs, 'points') ?? '';
      const nums = pts.match(/[-+]?(?:\d*\.\d+|\d+\.?)/g)?.map(Number) ?? [];
      for (let k = 0; k + 1 < nums.length; k += 2) {
        addPoint(box, nums[k]!, nums[k + 1]!);
      }
    }
  }
  return { viewBoxN: w, box };
}

describe('pure-vector SVG wallet & currency icons', () => {
  const walletSvgFiles = collectSvgFiles(WALLET_ICONS_DIR);
  const currencySvgFiles = collectSvgFiles(CURRENCY_ICONS_DIR);
  const allSvgFiles = [...walletSvgFiles, ...currencySvgFiles];

  it('ships 43 wallet icon SVGs and pure-vector currency badge SVGs', () => {
    expect(walletSvgFiles.length).toBe(43);
    expect(currencySvgFiles.length).toBeGreaterThanOrEqual(45);
  });

  it('has zero <text>, <tspan>, or font-family dependencies and valid square viewBoxes', () => {
    const allowedTags = new Set([
      'svg',
      'g',
      'path',
      'circle',
      'rect',
      'polygon',
      'polyline',
      'line',
      'ellipse',
    ]);

    for (const file of allSvgFiles) {
      const rel = relative(ASSETS_ROOT, file).split(sep).join('/');
      const raw = readFileSync(file, 'utf8');
      expect(raw, `${rel} must contain <svg`).toContain('<svg');
      expect(raw, `${rel} must not contain <text`).not.toMatch(/<text\b/i);
      expect(raw, `${rel} must not contain <tspan`).not.toMatch(/<tspan\b/i);
      expect(raw, `${rel} must not contain font-family`).not.toMatch(/font-family/i);

      const tagMatches = [...raw.matchAll(/<([a-zA-Z0-9-]+)\b/g)].map((m) => m[1]!.toLowerCase());
      for (const tag of tagMatches) {
        expect(allowedTags.has(tag), `${rel} uses disallowed tag <${tag}>`).toBe(true);
      }

      const vbMatch = /viewBox\s*=\s*"0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/.exec(raw);
      expect(vbMatch, `${rel} must declare square viewBox="0 0 N N"`).not.toBeNull();
      const n = Number(vbMatch![1]);
      expect(n, `${rel} viewBox width must equal height`).toBe(Number(vbMatch![2]));
      expect(n, `${rel} viewBox N must be >= 24`).toBeGreaterThanOrEqual(24);
    }
  });

  it('keeps every SVG visually balanced, centered (±20%), unclipped, and >= 35% canvas coverage', () => {
    const failures: string[] = [];
    for (const file of allSvgFiles) {
      const rel = relative(ASSETS_ROOT, file).split(sep).join('/');
      const raw = readFileSync(file, 'utf8');
      const { viewBoxN: n, box } = measureSvgBounds(raw);

      if (box.minX < 0 || box.minY < 0 || box.maxX > n || box.maxY > n) {
        failures.push(`${rel}: clipped [${box.minX.toFixed(1)},${box.minY.toFixed(1)}..${box.maxX.toFixed(1)},${box.maxY.toFixed(1)}] outside [0,${n}]`);
      }
      const width = box.maxX - box.minX;
      const height = box.maxY - box.minY;
      if (width < n * 0.35 || height < n * 0.35) {
        failures.push(`${rel}: too small ${width.toFixed(2)}x${height.toFixed(2)} (< ${(n * 0.35).toFixed(2)})`);
      }
      const centerX = (box.minX + box.maxX) / 2;
      const centerY = (box.minY + box.maxY) / 2;
      const half = n / 2;
      if (Math.abs(centerX - half) > half * 0.2 || Math.abs(centerY - half) > half * 0.2) {
        failures.push(`${rel}: off-center (${centerX.toFixed(2)},${centerY.toFixed(2)}) vs (${half},${half})`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('walletIcon registry, WalletIcon, and CurrencyBadge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines all 7 packages and pastel tones', () => {
    expect(WALLET_ICON_PACKAGES.map((p) => p.id)).toEqual([
      'basic',
      'bank',
      'ewallet',
      'save',
      'inv',
      'life',
      'fam',
    ]);
    expect(WALLET_PASTEL_TONES).toEqual(['1', '2', '3', '4', '5', '6', 't', 'n']);
  });

  it('resolves every icon across all 7 packages without broken img src or silent fallback', () => {
    for (const pkg of WALLET_ICON_PACKAGES) {
      expect(pkg.items.length).toBeGreaterThan(0);
      const expectedKind = pkg.id === 'basic' ? 'basic' : pkg.id === 'bank' ? 'bank' : 'svg';
      for (const item of pkg.items) {
        const resolved = resolveWalletIcon(item.id);
        expect(resolved.kind, `${item.id} must resolve as ${expectedKind}`).toBe(expectedKind);

        const { container } = render(<WalletIcon icon={item.id} size="md" />);
        const img = container.querySelector('img');
        if (resolved.kind === 'basic') {
          expect(resolved.toneClass).toBeTruthy();
          expect(img).toBeNull();
          expect(container.querySelector('svg')).not.toBeNull();
        } else {
          expect(resolved.src).toBeTruthy();
          expect(img?.getAttribute('src')).toBeTruthy();
        }
      }
    }
  });

  it('renders legacy bg-avatar-1..6 and null/unknown fallback cleanly at all sizes', () => {
    const sizes: WalletIconSize[] = ['xs', 'sm', 'md', 'lg'];
    for (const tone of ['1', '2', '3', '4', '5', '6'] as const) {
      const legacy = `bg-avatar-${tone}`;
      expect(walletIconClass(legacy)).toBe(`bg-avatar-${tone} text-avatar-${tone}-fg`);
      for (const size of sizes) {
        const { container } = render(<WalletIcon icon={legacy} size={size} />);
        expect(container.firstElementChild?.className).toContain(`bg-avatar-${tone}`);
        expect(container.querySelector('svg')).not.toBeNull();
      }
    }

    for (const fallbackInput of [null, undefined, '', 'unknown:pkg:item']) {
      for (const size of sizes) {
        const { container } = render(<WalletIcon icon={fallbackInput} size={size} />);
        expect(container.firstElementChild?.className).toContain('bg-avatar-5');
        expect(container.querySelector('svg')).not.toBeNull();
      }
    }
  });

  it('falls back bank:nab and bank:vib to android-*.webp when on iOS', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );

    for (const id of ['bank:nab', 'bank:vib']) {
      const resolved = resolveWalletIcon(id);
      expect(resolved.kind).toBe('bank');
      if (resolved.kind === 'bank') {
        expect(resolved.src).toContain('android-');
      }
      const { container } = render(<WalletIcon icon={id} size="sm" />);
      const img = container.querySelector('img');
      expect(img?.getAttribute('src')).toContain('android-');
    }
  });

  it('supports category-aware and keyword search in searchWalletIcons', () => {
    const invItems = WALLET_ICON_PACKAGES.find((p) => p.id === 'inv')!.items;
    const invHits = searchWalletIcons('đầu tư');
    expect(invHits.map((i) => i.id)).toEqual(invItems.map((i) => i.id));

    const bankItems = WALLET_ICON_PACKAGES.find((p) => p.id === 'bank')!.items;
    const bankHits = searchWalletIcons('ngan hang').map((i) => i.id);
    for (const b of bankItems) {
      expect(bankHits).toContain(b.id);
    }
    expect(bankHits.some((id) => id.startsWith('basic:bank'))).toBe(true);

    const vcbHits = searchWalletIcons('vcb');
    expect(vcbHits.some((i) => i.id === 'bank:vcb')).toBe(true);
  });

  it('renders CurrencyBadge with pure-vector SVG for all 55 CURRENCY_CODES', () => {
    expect(CURRENCY_CODES.length).toBe(55);
    for (const code of CURRENCY_CODES) {
      const { container } = render(<CurrencyBadge code={code} />);
      const img = container.querySelector('img');
      expect(img, `CurrencyBadge(${code}) must render an <img>`).not.toBeNull();
      expect(img?.getAttribute('src'), `CurrencyBadge(${code}) src must be non-empty`).toBeTruthy();
      expect(container.firstElementChild?.className).toContain('bg-muted');
    }

    const { container: selectedSm } = render(<CurrencyBadge code="VND" selected size="sm" />);
    expect(selectedSm.firstElementChild?.className).toContain('bg-secondary');
    expect(selectedSm.firstElementChild?.className).toContain('size-8');
  });
});
