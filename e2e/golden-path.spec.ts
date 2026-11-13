import { test, expect, type Browser, type Page } from '@playwright/test';

// Golden path at 375px: Minh (member) creates a trip and adds the homestay; Chi joins from the group link
// without an account, adds street food (waits for approval), pays Minh with VietQR and Minh confirms.
// Expected money: homestay 800.000 and bánh tráng 180.000, each split 4 ways, leave Chi owing Minh 65.000₫.

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
}

/** The app starts in Vietnamese; these people picked English, so the steps read the English copy. */
async function englishContext(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  return context;
}

test('a first visit is in Vietnamese, whatever the browser language', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('button', { name: 'Chuyển sang English' })).toBeVisible();
  await context.close();
});

test('split a trip and settle up with VietQR', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  const chiContext = await englishContext(browser);
  const chi = await chiContext.newPage();

  // Minh signs in (test-only route), accepts the privacy notice and creates the trip.
  const login = await minh.request.post('/api/test/login', { data: { sub: 'e2e-minh', name: 'Minh', email: 'minh@example.com' } });
  expect(login.ok()).toBe(true);
  await minh.goto('/groups');
  await minh.getByRole('checkbox', { name: 'I agree to the privacy notice' }).check();
  await minh.getByRole('button', { name: 'Continue' }).click();
  await minh.getByRole('link', { name: 'New group' }).click();
  await minh.getByLabel('Group name').fill('Đà Lạt');
  const nameToAdd = minh.getByLabel('Name to add');
  for (const name of ['An', 'Bình', 'Chi']) {
    await nameToAdd.fill(name);
    await nameToAdd.press('Enter');
  }
  await minh.getByText('Your bank details (optional)').click();
  await minh.getByRole('combobox', { name: 'Bank' }).click();
  await minh.getByPlaceholder('Search banks').fill('Techcombank');
  await minh.getByRole('option', { name: /^Techcombank —/ }).first().click();
  await expect(minh.getByRole('combobox', { name: 'Bank' })).toContainText('Techcombank');
  await minh.getByLabel('Account number').fill('19031234565678');
  await minh.getByLabel('Account holder name').fill('Nguyen Van Minh');
  await noSidewaysScroll(minh);
  await minh.getByRole('button', { name: 'Create group' }).click();
  await expect(minh).toHaveURL(/\/t\/[^/]+$/);
  const tripUrl = minh.url();

  // Minh's own expense counts straight away.
  await minh.getByRole('link', { name: '+ Add expense' }).click();
  await minh.getByLabel('What for').fill('Homestay Bloom');
  await minh.getByLabel('Amount', { exact: true }).fill('800.000');
  await minh.getByRole('button', { name: 'Add expense' }).click();
  await expect(minh).toHaveURL(tripUrl);
  await expect(minh.getByText('Homestay Bloom')).toBeVisible();
  await noSidewaysScroll(minh);

  // Once the trip has an expense, the group link lives in People's Invite sheet,
  // one tap from the group page.
  await minh.getByRole('link', { name: /^\d+ people in this group$/ }).click();
  await expect(minh).toHaveURL(/\/people$/);
  await minh.getByRole('button', { name: 'Invite' }).click();
  const invite = minh.getByRole('dialog', { name: 'Invite' });
  const groupLink = await invite.getByLabel('Group link').inputValue();
  expect(groupLink).toMatch(/\/j\/[^/]+$/);
  await noSidewaysScroll(minh);
  await minh.keyboard.press('Escape');
  await expect(invite).toHaveCount(0);
  await minh.getByRole('link', { name: 'Back' }).click();
  await expect(minh).toHaveURL(tripUrl);

  // Chi opens the group link and picks their name. A guest only reaches their pay pages (owner, 2026-11-12):
  // owing one person, Chi lands straight on the QR to pay Minh (800.000₫ homestay ÷ 4 = 200.000₫).
  await chi.goto(groupLink);
  await expect(chi).toHaveURL(/\/who(\?.*)?$/);
  await chi.getByRole('radio', { name: /Chi/ }).click();
  await chi.getByRole('button', { name: 'Continue as Chi' }).click();
  await expect(chi.getByRole('img', { name: /VietQR code to pay Minh 200\.000₫/ })).toBeVisible();
  await expect(chi.getByText('Log in to see the group')).toBeVisible();
  await expect(chi.getByText('CHI DA LAT SETTLE')).toBeVisible();
  await expect(chi.getByText('Keep this note unchanged so the payment can be matched.')).toBeVisible();
  await noSidewaysScroll(chi);
  await chi.getByRole('button', { name: "I've paid" }).click();
  // Exact: the status live region repeats both lines in one sentence for screen readers.
  await expect(chi.getByText('Payment sent · 200.000₫', { exact: true })).toBeVisible();
  await expect(chi.getByText('Waiting for Minh to confirm it arrived. This page updates by itself.', { exact: true })).toBeVisible();
  await noSidewaysScroll(chi);

  // Minh confirms the money arrived.
  await minh.reload();
  const confirmCard = minh.getByRole('region', { name: 'Needs approval' });
  await expect(confirmCard.getByText('Chi says they paid you 200.000₫')).toBeVisible();
  await expect(confirmCard.getByText('Did it arrive?')).toBeVisible();
  await noSidewaysScroll(minh);
  await confirmCard.getByRole('button', { name: 'Confirm' }).click();
  await expect(confirmCard).toHaveCount(0);
  await minh.getByRole('tab', { name: 'Payments' }).click();
  await expect(minh.getByText('Paid ✓')).toBeVisible();
  await noSidewaysScroll(minh);

  // Chi is settled with Minh: the group's address opens what Chi owes, which is nothing now.
  await chi.goto(tripUrl);
  await expect(chi.getByText("You're all set")).toBeVisible();
  await noSidewaysScroll(chi);

  await minhContext.close();
  await chiContext.close();
});
