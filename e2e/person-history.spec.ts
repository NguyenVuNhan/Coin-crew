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

  // The person screen: the Quick expenses row and, under it, the Taxi line adding 120.000.
  await page.getByRole('link', { name: /Tuan/ }).click();
  await expect(page.getByTestId('person-item-' + (await firstItemTrip(page)))).toContainText('Quick expenses');
  const history = page.getByTestId('person-history');
  await expect(history).toContainText('What makes this up');
  await expect(history.locator('.fsl-history__line')).toHaveCount(1);
  await expect(history.locator('.fsl-history__line').first()).toContainText('Taxi');
  await expect(history.locator('.fsl-history__line').first()).toContainText('+120.000');

  // Tuan hands over 20.000 in cash: a payment line appears and the lines still add up to the total.
  await page.getByTestId('person-cash').click();
  await page.getByLabel('Amount').fill('20.000');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(history.locator('.fsl-history__line')).toHaveCount(2);
  await expect(history.locator('.fsl-history__line').first()).toContainText('Tuan paid you');
  await expect(history.locator('.fsl-history__line').first()).toContainText('−20.000');
  await expect(page.locator('.fsl-person__total')).toContainText('100.000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // The request link: the row names the Taxi, and opens into the compact list.
  await page.getByTestId('person-request').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: string }).__shared)).toMatch(/\/r\/[^/]+$/);
  const link = (await page.evaluate(() => (window as unknown as { __shared?: string }).__shared))!;
  const guestContext = await englishContext(browser);
  const guest = await guestContext.newPage();
  await guest.goto(new URL(link).pathname);
  const covers = guest.locator('[data-testid^="request-covers-"]').first();
  await expect(covers).toContainText('Taxi');
  await covers.click();
  await expect(covers).toHaveAttribute('aria-expanded', 'true');
  await expect(guest.locator('.fsl-history__line')).toHaveCount(2);
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await guestContext.close();
  await context.close();
});

/** The trip id behind the first person item row (the quick-expense ledger). */
async function firstItemTrip(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.locator('[data-testid^="person-item-"]').first().getAttribute('data-testid');
  return (id ?? '').replace('person-item-', '');
}
