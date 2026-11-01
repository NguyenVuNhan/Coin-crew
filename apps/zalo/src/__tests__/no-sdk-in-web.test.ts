import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The web bundle must not carry zmp-sdk (spec: anti-goal "the web bundle grows because of Mini App code").
const assets = join(import.meta.dirname, '../../../api/public/assets');

describe('web bundle', () => {
  it.skipIf(!existsSync(assets))('contains no zmp-sdk code (run `npm run build -w @fsl/web` first)', () => {
    const js = readdirSync(assets).filter((f) => f.endsWith('.js'));
    expect(js.length).toBeGreaterThan(0);
    const offenders = js.filter((f) => /zmp-sdk|openShareSheet|saveImageToGallery/.test(readFileSync(join(assets, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
