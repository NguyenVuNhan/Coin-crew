// The committed PNGs in apps/web/public/icons and apple-touch-icon.png are the source of truth: icon.svg uses system fonts, so re-rendering on another machine may differ.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const JADE = '#0f766e';
const publicDir = path.resolve(process.cwd(), 'apps/web/public');
const svg = readFileSync(path.resolve(publicDir, 'icon.svg'), 'utf8');
mkdirSync(path.resolve(publicDir, 'icons'), { recursive: true });

// scale is the share of the canvas the SVG fills; the maskable icon keeps to the 80% safe zone.
const targets = [
  { file: 'icons/icon-192.png', size: 192, scale: 1 },
  { file: 'icons/icon-512.png', size: 512, scale: 1 },
  { file: 'icons/icon-maskable-512.png', size: 512, scale: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size, scale } of targets) {
    await page.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * scale);
    // Opaque Jade behind the icon, so iOS shows no black corners and maskable crops stay on-brand.
    await page.setContent(
      `<html><body style="margin:0;width:${size}px;height:${size}px;background:${JADE};display:flex;align-items:center;justify-content:center">` +
        `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body></html>`,
    );
    const pngPath = path.resolve(publicDir, file);
    await page.screenshot({ path: pngPath });
    console.log(`Wrote ${pngPath}`);
  }
} finally {
  await browser.close();
}
