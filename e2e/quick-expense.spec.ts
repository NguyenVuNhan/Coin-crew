import { test, expect, type Browser } from '@playwright/test';

// Quick expense at 375px: Nhan adds a taxi without a group, split with a new name "Minh", sends Minh the request
// link; Minh opens it without an account, sees 120.000₫ and taps "I've paid"; Nhan confirms from the People tab.

/** The app starts in Vietnamese; these people picked English, so the steps read the English copy. */
async function englishContext(browser: Browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  return context;
}

test('a quick expense, a request link and a confirmed "I\'ve paid"', async ({ browser }) => {
  const nhanContext = await englishContext(browser);
  // The share sheet can't be driven from a test: keep what the page shares instead.
  await nhanContext.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared?: string }).__shared = data.url;
      },
    });
  });
  const nhan = await nhanContext.newPage();
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();

  const login = await nhan.request.post('/api/test/login', { data: { sub: 'e2e-nhan', name: 'Nhan', email: 'nhan@example.com' } });
  expect(login.ok()).toBe(true);
  await nhan.goto('/trips');
  await nhan.getByRole('checkbox', { name: 'I agree to the privacy notice' }).check();
  await nhan.getByRole('button', { name: 'Continue' }).click();

  // New expense, no group: only Nhan to start with; "Minh" is typed once and added as someone new.
  await nhan.getByTestId('home-new-expense').click();
  await expect(nhan.getByRole('heading', { name: 'New expense' })).toBeVisible();
  await nhan.getByLabel('What for').fill('Taxi');
  await nhan.getByLabel('Amount', { exact: true }).fill('240.000');
  await nhan.getByRole('button', { name: /^Split between/ }).click();
  await nhan.getByLabel('Add people').fill('Minh');
  await nhan.getByTestId('split-add-name').click();
  await expect(nhan.getByRole('button', { name: 'Remove Minh' })).toBeVisible();
  await nhan.getByRole('button', { name: 'Done' }).click();
  await nhan.getByRole('button', { name: 'Add expense' }).click();

  // Back on Home: Minh owes 120.000₫.
  await expect(nhan).toHaveURL(/\/trips$/);
  const minhRow = nhan.getByRole('link', { name: /Minh/ });
  await expect(minhRow).toContainText('120.000');
  await minhRow.click();
  await nhan.getByTestId('person-request').click();
  await expect.poll(() => nhan.evaluate(() => (window as unknown as { __shared?: string }).__shared)).toMatch(/\/r\/[^/]+$/);
  const link = (await nhan.evaluate(() => (window as unknown as { __shared?: string }).__shared))!;

  // Minh opens the link with no account: one request, a QR-less "pay directly" line (Nhan has no bank), I've paid.
  await minh.goto(new URL(link).pathname);
  await expect(minh.getByTestId('request-single')).toContainText('Nhan asked you for');
  await expect(minh.getByTestId('request-single')).toContainText('120.000');
  await expect(minh.getByText(/sign in/i)).toHaveCount(0);
  expect(await minh.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await minh.getByTestId('request-paid').click();
  await expect(minh.getByTestId('request-waiting')).toContainText('Waiting for Nhan to confirm');

  // Nhan confirms; Minh drops off the People tab.
  await nhan.goto('/trips');
  const waitingRow = nhan.getByRole('link', { name: /Minh/ });
  await expect(waitingRow).toContainText('Waiting for you to confirm');
  await waitingRow.click();
  await nhan.getByRole('button', { name: 'Confirm' }).click();
  await nhan.goto('/trips');
  await expect(nhan.getByText('No open debts')).toBeVisible();

  await nhanContext.close();
  await minhContext.close();
});
