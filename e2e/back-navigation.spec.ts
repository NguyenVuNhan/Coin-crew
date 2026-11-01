import { test, expect, type Browser } from '@playwright/test';

/** The app starts in Vietnamese; these steps use English copy. */
async function englishContext(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  return context;
}

test('walks back navigation with history, scroll restoration, and fallback to parent', async ({ browser }) => {
  const context = await englishContext(browser);
  const page = await context.newPage();

  // 1. Sign in (as quick-expense does, a new sub e.g. 'e2e-back'), accept the privacy notice.
  const login = await page.request.post('/api/test/login', {
    data: { sub: 'e2e-back', name: 'Nhan', email: 'nhan-back@example.com' },
  });
  expect(login.ok()).toBe(true);

  await page.goto('/trips');
  await page.getByRole('checkbox', { name: 'I agree to the privacy notice' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/trips$/);

  // 2. Create a group, add the person "Minh" to it, and add enough expenses in the group (split with Minh)
  // that the group page is taller than the window.
  await page.goto('/groups');
  await page.getByRole('link', { name: 'New group' }).click();
  await page.getByLabel('Group name').fill('Đà Lạt');
  await page.getByPlaceholder('Name').nth(0).fill('Minh');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/);
  const initialTripUrl = page.url();

  // Add expenses in the group split with Minh.
  // First expense uses the empty state's "+ Add expense" link; subsequent ones use the bottom bar's "+" button.
  await page.getByRole('link', { name: '+ Add expense' }).click();
  await page.getByLabel('What for').fill('Homestay');
  await page.getByLabel('Amount', { exact: true }).fill('500.000');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page).toHaveURL(initialTripUrl);

  for (let i = 2; i <= 5; i++) {
    await page.getByTestId('app-nav-bar').getByTestId('nav-add').click();
    await page.getByLabel('What for').fill(`Expense ${i}`);
    await page.getByLabel('Amount', { exact: true }).fill('100.000');
    await page.getByRole('button', { name: 'Add expense' }).click();
    await expect(page).toHaveURL(initialTripUrl);
  }

  // 3. page.goto('/trips'). Click Minh's row: expect the URL /people/<something>; remember it.
  await page.goto('/trips');
  const minhRow = page.getByRole('link', { name: /Minh/ });
  await expect(minhRow).toBeVisible();
  await minhRow.click();
  await expect(page).toHaveURL(/\/people\/[^/]+$/);
  const personUrl = page.url();

  // 4. On the person page, open the group (the group's row/link on that page). Expect /t/<id>; remember it.
  const groupRow = page.locator('[data-testid^="person-item-"]').first();
  await expect(groupRow).toBeVisible();
  await groupRow.click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/);
  const tripUrl = page.url();

  // 5. Scroll down: await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)),
  // then read const y = await page.evaluate(() => window.scrollY) and expect(y).toBeGreaterThan(0).
  await page.setViewportSize({ width: 375, height: 480 });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  // 6. Click the last expense row (scroll it into view first if needed, keep the window scrolled).
  // Expect /t/<id>/expenses/<eid>.
  const lastExpense = page.locator('.fsl-expense-list__item').last().locator('.fsl-action-row__main');
  await lastExpense.scrollIntoViewIfNeeded();
  // Where the page is when the user leaves it: the place it must come back to.
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(0);
  await lastExpense.click();
  await expect(page).toHaveURL(/\/t\/[^/]+\/expenses\/[^/]+$/);

  // 7. Click the on-screen back button (page.getByRole('button', { name: 'Back' }) on phone).
  // Expect the URL /t/<id> again, and await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y).
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(tripUrl);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);

  // 8. Click the group page's header back (getByRole('link', { name: 'Back' })).
  // Expect the remembered /people/<key> URL.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(personUrl);

  // 9. await page.goBack(). Expect /trips.
  await page.goBack();
  await expect(page).toHaveURL(/\/trips$/);

  // 10. Open the group URL in a NEW page of the same context (so it has no history).
  // Click its back. Expect /groups.
  const fresh = await context.newPage();
  await fresh.goto(tripUrl);
  await fresh.getByRole('link', { name: 'Back' }).click();
  await expect(fresh).toHaveURL(/\/groups$/);
  await fresh.close();

  await context.close();
});
