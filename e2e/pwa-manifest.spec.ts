import { test, expect } from '@playwright/test';

test('manifest makes the app installable and starts on Home', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m).toMatchObject({ start_url: '/trips', scope: '/', id: '/', display: 'standalone', theme_color: '#0f766e', background_color: '#f6f7f4' });
  const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const path of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/apple-touch-icon.png']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
});

test('index.html carries the iOS home-screen tags', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'CoinCrew');
});
