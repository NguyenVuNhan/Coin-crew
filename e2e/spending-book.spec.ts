import { test, expect } from '@playwright/test';

// The spending book (Sổ chi tiêu), issue #112: off by default, turned on in the account menu, and then the main
// screen and the nav's first section change. Turning it off brings today's app back. Checked on a phone and a computer.

test('the spending book is off by default, turns on in the account menu, and turns off again', async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  const page = await context.newPage();

  const login = await page.request.post('/api/test/login', {
    data: { sub: 'e2e-book', name: 'Nhan', email: 'book@example.com' },
  });
  expect(login.ok()).toBe(true);
  await page.goto('/trips');
  await page.getByRole('checkbox', { name: 'I agree to the privacy notice' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Off: today's app, and the API refuses the personal routes.
  const bar = page.getByTestId('app-nav-bar');
  await expect(page.getByRole('heading', { name: 'Quick expenses' })).toBeVisible();
  await expect(bar.getByTestId('nav-home')).toHaveAccessibleName('Quick expenses');
  await expect(page.getByTestId('book-empty')).toHaveCount(0);
  expect((await page.request.get('/api/me/personal')).status()).toBe(403);

  // Turn it on in the account menu.
  await page.getByRole('button', { name: 'Account' }).click();
  const setting = page.getByTestId('account-book');
  await expect(setting).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: testInfo.outputPath('account-menu-off.png') });
  await setting.click();
  await expect(setting).toHaveAttribute('aria-checked', 'true');
  await expect(setting).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('account-menu-on.png') });
  await page.keyboard.press('Escape');

  // On: the main screen is the spending book, with what the person already has still there.
  await expect(page.getByRole('heading', { name: 'Spending book' })).toBeVisible();
  await expect(bar.getByTestId('nav-home')).toHaveAccessibleName('Spending book');
  await expect(page.getByTestId('book-empty')).toContainText('Start with a wallet');
  await expect(page.getByTestId('home-total')).toHaveCount(0);
  expect((await page.request.get('/api/me/personal')).status()).toBe(200);
  await page.screenshot({ path: testInfo.outputPath('book-phone.png'), fullPage: true });

  // Nothing is wider than the phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // The people list has its own page, and back returns to the book.
  await page.getByTestId('book-people-row').click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('people-phone.png'), fullPage: true });
  await page.goBack();
  await expect(page.getByTestId('book-empty')).toBeVisible();

  // A reload keeps it on, with no flash of the old screen once the phone remembers.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Spending book' })).toBeVisible();

  // On a computer the side panel names it too.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('app-nav-side').getByTestId('nav-home')).toHaveText('Spending book');
  await expect(page.getByTestId('book-people-row')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('book-computer.png') });
  await page.setViewportSize({ width: 375, height: 812 });

  // Turn it off: today's app is back, and /people is closed again.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByTestId('account-book').click();
  await expect(page.getByTestId('account-book')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Quick expenses' })).toBeVisible();
  await expect(page.getByTestId('home-total')).toBeVisible();
  await page.goto('/people');
  await expect(page).toHaveURL(/\/trips$/);
  expect((await page.request.get('/api/me/personal')).status()).toBe(403);

  await context.close();
});
