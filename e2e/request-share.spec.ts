import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// Issue #93: "Request payment" on the balance card and "Share bill & QR" on a normal expense.
const MINH_BANK = { bin: '970407', accountNumber: '19031234565678', holderName: 'Nguyen Van Minh' };

/** A phone (touch, no mouse) whose share sheet records what it was given; the picture comes back as a data URL. */
async function phoneContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 375, height: 812 } });
  await context.addInitScript(() => {
    localStorage.setItem('lang', 'en');
    const w = window as unknown as { __shared: { text?: string; image?: string }[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        const image = file
          ? await new Promise<string>((resolve) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result));
              r.readAsDataURL(file);
            })
          : undefined;
        w.__shared.push({ text: data.text, image });
      },
    });
  });
  return context;
}

async function signIn(page: Page, sub: string, name: string) {
  expect((await page.request.post('/api/test/login', { data: { sub, name, email: `${sub}@example.com` } })).ok()).toBe(true);
  expect((await page.request.post('/api/me/consent')).ok()).toBe(true);
}

async function setUpTrip(page: Page) {
  const tripRes = await page.request.post('/api/trips', {
    data: { name: 'Đà Lạt', preset: 'trip', defaultLang: 'en', people: ['An', 'Chi'], myBank: MINH_BANK },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();
  const view = await (await page.request.get(`/api/trips/${tripId}`)).json();
  const pid = (n: string) => view.people.find((p: { name: string; id: string }) => p.name === n)!.id;
  const me = view.me.participantId;
  const exp = await page.request.post(`/api/trips/${tripId}/expenses`, {
    data: {
      description: 'Homestay',
      amount: 900000,
      spentOn: '2026-11-10',
      payerId: me,
      mode: 'equal',
      entries: [me, pid('An'), pid('Chi')].map((participantId) => ({ participantId, value: 1 })),
    },
  });
  expect(exp.ok()).toBe(true);
  const { expenseId } = await exp.json();
  return { tripId, token: view.links.group as string, expenseId: expenseId as string };
}

function savePicture(dataUrl: string, path: string) {
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

test('phone: request payment shares the roster picture and the owe link', async ({ browser }) => {
  const context = await phoneContext(browser);
  const page = await context.newPage();
  await signIn(page, 'rs-phone-minh', 'Minh');
  const { tripId, token, expenseId } = await setUpTrip(page);

  await page.goto(`/t/${tripId}`);
  const request = page.locator('.fsl-balance__request');
  await expect(request).toBeEnabled();
  await request.click();
  await expect.poll(() => page.evaluate(() => (window as never as { __shared: unknown[] }).__shared.length)).toBe(1);
  const [shared] = await page.evaluate(() => (window as never as { __shared: { text: string; image: string }[] }).__shared);
  expect(shared!.text).toContain('An 300.000₫');
  expect(shared!.text).toContain('Chi 300.000₫');
  expect(shared!.text).toContain(`/j/${token}/owe`);
  expect(shared!.image).toMatch(/^data:image\/png;base64,/);
  if (process.env.SHARE_SHOTS) savePicture(shared!.image, `${process.env.SHARE_SHOTS}/request.png`);

  await page.goto(`/t/${tripId}/expenses/${expenseId}`);
  const bill = page.getByRole('button', { name: 'Share bill & QR' });
  await expect(bill).toBeEnabled();
  await bill.click();
  await expect.poll(() => page.evaluate(() => (window as never as { __shared: unknown[] }).__shared.length)).toBe(1);
  const [billShared] = await page.evaluate(() => (window as never as { __shared: { text: string; image: string }[] }).__shared);
  expect(billShared!.text.startsWith('Homestay: 900.000₫, 300.000₫ each.\nQR & details: ')).toBe(true);
  expect(billShared!.text.endsWith(`/j/${token}/e/${expenseId}`)).toBe(true);
  expect(billShared!.image).toMatch(/^data:image\/png;base64,/);
  if (process.env.SHARE_SHOTS) savePicture(billShared!.image, `${process.env.SHARE_SHOTS}/bill.png`);

  await context.close();
});

test('PC: request payment copies the message and opens the picture sheet with desktop copy', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  const page = await context.newPage();
  await signIn(page, 'rs-pc-minh', 'Minh');
  const { tripId, token } = await setUpTrip(page);

  await page.goto(`/t/${tripId}`);
  const request = page.locator('.fsl-balance__request');
  await expect(request).toBeEnabled();
  await request.click();
  const sheet = page.locator('.fsl-save-image');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Right-click the picture');
  await expect(sheet).not.toContainText('Zalo');
  await expect(sheet.locator('.fsl-save-image__img')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/j/${token}/owe`);
  if (process.env.SHARE_SHOTS) await page.screenshot({ path: `${process.env.SHARE_SHOTS}/pc-sheet.png` });

  await context.close();
});
