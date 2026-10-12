import { test, expect, type Page } from '@playwright/test';

// Golden path at 375px: Minh (member) creates a trip and adds the homestay; Chi joins from the group link
// without an account, adds street food (waits for approval), pays Minh with VietQR and Minh confirms.
// Expected money: homestay 800.000 and bánh tráng 180.000, each split 4 ways, leave Chi owing Minh 65.000₫.

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
}

test('split a trip and settle up with VietQR', async ({ browser }) => {
  const minhContext = await browser.newContext();
  const minh = await minhContext.newPage();
  const chiContext = await browser.newContext();
  const chi = await chiContext.newPage();

  // Minh signs in (test-only route), accepts the privacy notice and creates the trip.
  const login = await minh.request.post('/api/test/login', { data: { sub: 'e2e-minh', name: 'Minh', email: 'minh@example.com' } });
  expect(login.ok()).toBe(true);
  await minh.goto('/trips');
  await minh.getByRole('checkbox', { name: 'I agree to the privacy notice' }).check();
  await minh.getByRole('button', { name: 'Continue' }).click();
  await minh.getByRole('link', { name: 'New trip' }).click();
  await minh.getByLabel('Trip name').fill('Đà Lạt');
  await expect(minh.getByLabel('Your name')).toHaveValue('Minh');
  const others = minh.getByPlaceholder('Name');
  await others.nth(0).fill('An');
  await minh.getByRole('button', { name: 'Add person' }).click();
  await others.nth(1).fill('Bình');
  await minh.getByRole('button', { name: 'Add person' }).click();
  await others.nth(2).fill('Chi');
  await minh.getByText('Your bank details (optional)').click();
  await minh.getByLabel('Bank').selectOption('970407');
  await minh.getByLabel('Account number').fill('19031234565678');
  await minh.getByLabel('Account holder name').fill('Nguyen Van Minh');
  await noSidewaysScroll(minh);
  await minh.getByRole('button', { name: 'Create trip' }).click();
  await expect(minh).toHaveURL(/\/t\/[^/]+$/);
  const tripUrl = minh.url();

  // Minh's own expense counts straight away.
  await minh.getByRole('link', { name: '+ Add expense' }).click();
  await minh.getByLabel('What for').fill('Homestay Bloom');
  await minh.getByLabel('Amount').fill('800.000');
  await minh.getByRole('button', { name: 'Add expense' }).click();
  await expect(minh).toHaveURL(tripUrl);
  await expect(minh.getByText('Homestay Bloom')).toBeVisible();
  const groupLink = await minh.getByLabel('Group link').inputValue();
  await noSidewaysScroll(minh);

  // Chi opens the group link, picks their name and adds an expense that waits for approval.
  await chi.goto(groupLink);
  await expect(chi).toHaveURL(/\/who$/);
  await chi.getByRole('radio', { name: /Chi/ }).click();
  await chi.getByRole('button', { name: 'Continue as Chi' }).click();
  await expect(chi.getByText('Viewing as Chi')).toBeVisible();
  await noSidewaysScroll(chi);
  await chi.getByRole('link', { name: '+ Add expense' }).click();
  await chi.getByLabel('What for').fill('Bánh tráng nướng');
  await chi.getByLabel('Amount').fill('180.000');
  await chi.getByRole('button', { name: 'Send for approval' }).click();
  await expect(chi.getByText('Viewing as Chi')).toBeVisible();
  await expect(chi.getByText('Waiting').first()).toBeVisible();

  // Minh approves it.
  await minh.reload();
  const approvals = minh.getByRole('region', { name: 'Needs approval' });
  await expect(approvals.getByText('Chi added Bánh tráng nướng')).toBeVisible();
  await approvals.getByRole('button', { name: 'Approve' }).first().click();
  await expect(approvals).toHaveCount(0);

  // Chi pays Minh with VietQR.
  await chi.reload();
  await expect(chi.getByText('You owe Minh')).toBeVisible();
  await chi.getByRole('link', { name: 'Pay with VietQR' }).click();
  await expect(chi.getByRole('img', { name: /VietQR code to pay Minh 65\.000₫/ })).toBeVisible();
  await expect(chi.getByText(/^DALAT [2-9A-HJ-NP-Z]{4}$/)).toBeVisible();
  await expect(chi.getByText('Keep this note unchanged so the payment can be matched.')).toBeVisible();
  await noSidewaysScroll(chi);
  await chi.getByRole('button', { name: "I've already paid" }).click();
  await expect(chi.getByText('Waiting for Minh to confirm')).toBeVisible();

  // Minh confirms the money arrived.
  await minh.reload();
  const confirmCard = minh.getByRole('region', { name: 'Needs approval' });
  await expect(confirmCard.getByText("Chi says it's paid. Did it arrive?")).toBeVisible();
  await confirmCard.getByRole('button', { name: 'Confirm' }).click();
  await expect(minh.getByText('Paid ✓')).toBeVisible();

  // Chi is settled.
  await chi.goto(tripUrl);
  await expect(chi.getByText("You're all settled")).toBeVisible();

  await minhContext.close();
  await chiContext.close();
});
