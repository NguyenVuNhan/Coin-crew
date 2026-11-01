import { test, expect, type Browser, type Page } from '@playwright/test';

// Group fund at 375px: Xanh (organiser of a badminton group) puts 200.000₫ from two walk-ins into the fund,
// then pays 150.000₫ of drinks from it. The fund pill drops to 50.000₫ and the drinks row reads "Paid from group fund",
// while Xanh's own balance stays settled.

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
}

/** The app starts in Vietnamese; Xanh picked English, so the steps read the English copy. */
async function englishContext(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  return context;
}

test('an admin fills and spends the group fund', async ({ browser }) => {
  const context = await englishContext(browser);
  const page = await context.newPage();

  // Xanh signs in (test-only route), accepts the privacy notice and creates the sport group.
  const login = await page.request.post('/api/test/login', { data: { sub: 'e2e-fund-xanh', name: 'Xanh', email: 'xanh@example.com' } });
  expect(login.ok()).toBe(true);
  await page.goto('/groups');
  await page.getByRole('checkbox', { name: 'I agree to the privacy notice' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'New group' }).click();
  await page.getByRole('radio', { name: 'Sport group' }).click();
  await page.getByLabel('Group name').fill('Cầu lông Thứ 5');
  await expect(page.getByLabel('Your name')).toHaveValue('Xanh');
  await page.getByPlaceholder('Name').nth(0).fill('Lan');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/);
  const tripUrl = page.url();

  // Two walk-ins paid 100.000₫ each: Xanh puts it in the fund from the add screen's Fund income tab.
  await page.getByRole('link', { name: '+ Add expense' }).click();
  await page.getByRole('tab', { name: 'Fund income' }).click();
  await expect(page).toHaveURL(/[?&]type=income/);
  await page.getByLabel('Amount', { exact: true }).fill('200k');
  await page.getByLabel('Note').fill('Thu 2 khách vãng lai');
  await noSidewaysScroll(page);
  await page.getByRole('button', { name: 'Add to fund' }).click();
  await expect(page).toHaveURL(tripUrl);
  await expect(page.getByRole('button', { name: 'Group fund, 200.000₫' })).toBeVisible();
  await expect(page.getByText('Added to fund · by you')).toBeVisible();
  await expect(page.getByText('+200.000₫')).toBeVisible();
  await noSidewaysScroll(page);

  // Drinks after the game come out of the fund: nobody owes a share.
  await page.getByTestId('app-nav-bar').getByTestId('nav-add').click();
  await page.getByLabel('What for').fill('Nước sau trận');
  await page.getByLabel('Paid by').selectOption({ label: 'Group fund · 200.000₫' });
  await page.getByLabel('Amount', { exact: true }).fill('150k');
  await expect(page.getByText('Fund after this: 50.000₫')).toBeVisible();
  await noSidewaysScroll(page);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page).toHaveURL(tripUrl);
  await expect(page.getByRole('button', { name: 'Group fund, 50.000₫' })).toBeVisible();
  await expect(page.getByText('Paid from group fund')).toBeVisible();
  // The fund paid, not Xanh: their balance doesn't move.
  await expect(page.getByText("You're all settled")).toBeVisible();
  await noSidewaysScroll(page);

  await context.close();
});
