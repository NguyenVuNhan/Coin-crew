// The committed PNGs in apps/web/public/og are the source of truth: the SVGs use system fonts, so re-rendering on another machine may differ.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const names = ['trip', 'sport'];
const outDir = path.resolve(process.cwd(), 'apps/web/public/og');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 630 });

  for (const name of names) {
    const svgPath = path.resolve(process.cwd(), `scripts/og/${name}.svg`);
    const pngPath = path.resolve(outDir, `${name}.png`);
    await page.goto(pathToFileURL(svgPath).href);
    await page.screenshot({ path: pngPath });
    console.log(`Wrote ${pngPath}`);
  }
} finally {
  await browser.close();
}
