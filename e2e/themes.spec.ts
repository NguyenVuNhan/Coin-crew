import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Rewrite Part 4 (spec §7): a personal theme outside groups, a group's colours inside it, for guests too.

async function englishContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  return context;
}

async function loginAndConsent(page: Page, sub: string, name: string) {
  const loginRes = await page.request.post('/api/test/login', { data: { sub, name, email: `${sub}@example.com` } });
  expect(loginRes.ok()).toBe(true);
  const consentRes = await page.request.post('/api/me/consent');
  expect(consentRes.ok()).toBe(true);
}

const themeOf = (page: Page) => page.locator('html');

test('a personal theme sticks, and a group’s colours win inside it, for guests too', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'th-minh', 'Minh');

  // Minh picks Orchid from the account menu; it saves straight away and survives a reload.
  await minh.goto('/groups');
  await minh.getByRole('button', { name: 'Account' }).click();
  await minh.getByRole('button', { name: /^Theme/ }).click();
  await minh.getByRole('radio', { name: 'Orchid' }).click();
  await expect(themeOf(minh)).toHaveAttribute('data-theme', 'orchid');
  await expect(minh.getByRole('radio', { name: 'Orchid' })).toHaveAttribute('aria-checked', 'true');
  await minh.reload();
  await expect(themeOf(minh)).toHaveAttribute('data-theme', 'orchid');

  // Minh's group, with Sky as the group's colours.
  const tripRes = await minh.request.post('/api/trips', {
    data: { name: 'Sky Trip', preset: 'trip', defaultLang: 'en', people: ['Chi'] },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();
  await minh.goto(`/t/${tripId}/settings`);
  await minh.getByRole('button', { name: /^Group colours/ }).click();
  await minh.getByRole('radio', { name: 'Sky' }).click();
  await expect(themeOf(minh)).toHaveAttribute('data-theme', 'sky');
  await minh.keyboard.press('Escape');

  // Leaving the group brings Minh's own theme back.
  await minh.goto('/groups');
  await expect(themeOf(minh)).toHaveAttribute('data-theme', 'orchid');

  // A guest who opens the group link sees the group's colours, and Jade outside it.
  const view = await (await minh.request.get(`/api/trips/${tripId}`)).json();
  const guestContext = await englishContext(browser);
  const guest = await guestContext.newPage();
  await guest.goto(`/j/${view.links.group}`);
  await guest.getByRole('radio', { name: /Chi/ }).click();
  await guest.getByRole('button', { name: 'Continue as Chi' }).click();
  await expect(guest.getByText('Viewing as Chi')).toBeVisible();
  await expect(themeOf(guest)).toHaveAttribute('data-theme', 'sky');
  await guest.goto('/');
  await expect(themeOf(guest)).toHaveAttribute('data-theme', 'jade');

  await guestContext.close();
  await minhContext.close();
});
