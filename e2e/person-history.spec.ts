import { test, expect, type Browser } from '@playwright/test';

// Issue #98 at 375px: the person screen lists the quick expenses and payments behind the total, and the
// request link explains which expenses its row covers.

async function englishContext(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  return context;
}

test('the person screen and the request link show what makes up the total', async ({ browser }) => {
  const context = await englishContext(browser);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared?: string }).__shared = data.url;
      },
    });
  });
  const page = await context.newPage();
  const login = await page.request.post('/api/test/login', { data: { sub: 'e2e-lien', name: 'Lien', email: 'lien@example.com' } });
  expect(login.ok()).toBe(true);
  await page.goto('/trips');
  await page.getByRole('checkbox', { name: 'I agree to the privacy notice' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  // One quick expense: Taxi 240.000, split equally with a new name "Tuan".
  await page.getByTestId('app-nav-bar').getByTestId('nav-add').click();
  await page.getByLabel('What for').fill('Taxi');
  await page.getByLabel('Amount', { exact: true }).fill('240.000');
  await page.getByRole('button', { name: /^Split between/ }).click();
  await page.getByLabel('Add people').fill('Tuan');
  await page.getByTestId('split-add-name').click();
  await expect(page.getByRole('button', { name: 'Remove Tuan' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page).toHaveURL(/\/trips$/);

  // The person screen: one ledger row "Quick expenses +120.000" and a total; tapping it opens the Taxi line in a sheet.
  await page.getByRole('link', { name: /Tuan/ }).click();
  const quick = page.getByTestId('person-item-' + (await firstItemTrip(page)));
  await expect(quick).toContainText('Quick expenses');
  await expect(quick).toContainText('+120.000');
  await expect(page.locator('.fsl-ledger__total')).toContainText('120.000');
  await quick.click();
  let sheet = page.getByRole('dialog');
  await expect(sheet.locator('.fsl-history__line')).toHaveCount(1);
  await expect(sheet.locator('.fsl-history__line').first()).toContainText('Taxi');
  await expect(sheet.locator('.fsl-history__line').first()).toContainText('+120.000');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Tuan hands over 20.000 in cash: the row drops to 100.000 and the sheet gains the payment line.
  await page.getByTestId('person-cash').click();
  await page.getByLabel('Amount').fill('20.000');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(quick).toContainText('+100.000');
  await expect(page.locator('.fsl-person__total')).toContainText('100.000');
  await quick.click();
  sheet = page.getByRole('dialog');
  await expect(sheet.locator('.fsl-history__line')).toHaveCount(2);
  await expect(sheet.locator('.fsl-history__line').first()).toContainText('Tuan paid you');
  await expect(sheet.locator('.fsl-history__line').first()).toContainText('−20.000');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // The request link: the pay layout, and "What this covers (1)" opens the ledger, whose row expands its lines.
  await page.getByTestId('person-request').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: string }).__shared)).toMatch(/\/r\/[^/]+$/);
  const link = (await page.evaluate(() => (window as unknown as { __shared?: string }).__shared))!;
  const guestContext = await englishContext(browser);
  const guest = await guestContext.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByRole('heading', { name: 'Pay Lien' })).toBeVisible();
  await expect(guest.getByTestId('request-paid')).toBeVisible();
  await guest.getByTestId('request-covers').click();
  const coversSheet = guest.getByRole('dialog');
  await expect(coversSheet.locator('.fsl-ledger__row')).toHaveCount(1);
  await coversSheet.locator('.fsl-ledger__row').first().click();
  await expect(coversSheet.locator('.fsl-ledger__row').first()).toHaveAttribute('aria-expanded', 'true');
  await expect(coversSheet.locator('.fsl-history__line')).toHaveCount(2);
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await guestContext.close();
  await context.close();
});

/** The trip id behind the first person item row (the quick-expense ledger). */
async function firstItemTrip(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.locator('[data-testid^="person-item-"]').first().getAttribute('data-testid');
  return (id ?? '').replace('person-item-', '');
}
