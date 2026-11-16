import { test, expect } from '@playwright/test';

// The spending book (Sổ chi tiêu), issue #112: off by default; turned on in the account menu, which leads straight to
// the first-wallet popup; then the main screen shows the total. Turning it off brings today's app back and keeps the
// wallet. Checked on a phone and a computer.

test('the spending book: turn it on, create the first wallet, turn it off and on again', async ({ browser }, testInfo) => {
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
  expect((await page.request.get('/api/me/personal/wallets')).status()).toBe(403);

  // Turn it on in the account menu: the menu closes and the first-wallet popup opens.
  await page.getByRole('button', { name: 'Account' }).click();
  const setting = page.getByTestId('account-book');
  await expect(setting).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: testInfo.outputPath('account-menu-off.png') });
  await setting.click();

  const popup = page.getByRole('dialog', { name: 'Your first wallet' });
  await expect(popup).toBeVisible();
  await expect(page.getByTestId('account-book')).toHaveCount(0);
  await expect(popup.getByLabel('Wallet name')).toHaveValue('Cash');
  await page.screenshot({ path: testInfo.outputPath('first-wallet-popup.png') });

  // Close it: the empty state explains, and its button brings the popup back.
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Spending book' })).toBeVisible();
  await expect(bar.getByTestId('nav-home')).toHaveAccessibleName('Spending book');
  await expect(page.getByTestId('book-empty')).toContainText('Start with a wallet');
  await page.screenshot({ path: testInfo.outputPath('book-empty-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create your first wallet' }).click();
  await expect(popup).toBeVisible();

  // Create the wallet.
  await popup.getByLabel('How much do you have now?').fill('2.320.000');
  await page.screenshot({ path: testInfo.outputPath('first-wallet-filled.png') });
  await popup.getByRole('button', { name: 'Create wallet' }).click();
  await expect(popup).toHaveCount(0);
  const total = page.getByTestId('book-total');
  await expect(total).toContainText('2.320.000₫');
  await expect(total).toContainText('Cash');
  await expect(page.getByTestId('book-empty')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('book-phone.png'), fullPage: true });

  // Nothing is wider than the phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // A second wallet is refused until wallets get their own page.
  const second = await page.request.post('/api/me/personal/wallets', { data: { name: 'Bank', startAmount: 1 } });
  expect(second.status()).toBe(409);

  // The people list has its own page, and back returns to the book.
  await page.getByTestId('book-people-row').click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  await page.goBack();
  await expect(total).toBeVisible();

  // A reload keeps it on, and the popup does not come back.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Spending book' })).toBeVisible();
  await expect(total).toContainText('2.320.000₫');
  await expect(popup).toHaveCount(0);

  // On a computer the side panel names it too.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('app-nav-side').getByTestId('nav-home')).toHaveText('Spending book');
  await expect(total).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('book-computer.png') });
  await page.setViewportSize({ width: 375, height: 812 });

  // Turn it off: today's app is back, and the personal routes are closed again.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByTestId('account-book').click();
  await expect(page.getByTestId('account-book')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Quick expenses' })).toBeVisible();
  await expect(page.getByTestId('home-total')).toBeVisible();
  await page.goto('/people');
  await expect(page).toHaveURL(/\/trips$/);
  expect((await page.request.get('/api/me/personal/wallets')).status()).toBe(403);

  // Turn it on again: the wallet is still there, so no popup.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByTestId('account-book').click();
  await expect(page.getByTestId('book-total')).toContainText('2.320.000₫');
  await expect(popup).toHaveCount(0);

  await context.close();
});
