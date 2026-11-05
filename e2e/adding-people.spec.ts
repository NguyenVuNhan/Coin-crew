import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
}

async function englishContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('lang', 'en'));
  return context;
}

async function loginAndConsent(page: Page, sub: string, name: string) {
  const loginRes = await page.request.post('/api/test/login', {
    data: { sub, name, email: `${sub}@example.com` },
  });
  expect(loginRes.ok()).toBe(true);
  const consentRes = await page.request.post('/api/me/consent');
  expect(consentRes.ok()).toBe(true);
}

test('an organiser adds a sport roster fast', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const page = await minhContext.newPage();
  await loginAndConsent(page, 'ap-t1-minh', 'Minh');

  await page.goto('/groups');
  await page.getByRole('link', { name: 'New group' }).click();
  await page.getByRole('radio', { name: 'Sport group' }).click();
  await page.getByLabel('Group name').fill('Thursday Badminton');

  const createAddField = page.getByLabel('Name to add');
  await createAddField.fill('Lan');
  await page.getByRole('button', { name: '+ Female', exact: true }).click();
  await createAddField.fill('Minh Anh');
  await createAddField.press('Enter');

  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/);

  await page.goto(`${page.url()}/people`);
  const peopleAddField = page.getByLabel('Name to add');
  await expect(peopleAddField).toBeVisible();

  await peopleAddField.fill('Hùng');
  await peopleAddField.press('Enter');
  await peopleAddField.fill('Tú');
  await peopleAddField.press('Enter');

  await peopleAddField.focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text', 'Quân\nVy');
    document.activeElement?.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });

  const rows = page.locator('li.fsl-people__item');
  await expect(rows.locator('.fsl-people__name')).toHaveText([
    'Minh',
    'Lan',
    'Minh Anh',
    'Hùng',
    'Tú',
    'Quân',
    'Vy',
  ]);

  await page.getByRole('button', { name: 'Gender for Tú: Male' }).click();
  await expect(page.getByRole('button', { name: 'Gender for Tú: Female' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Gender for Tú: Male' })).toBeVisible();

  await peopleAddField.fill('A'.repeat(40));
  await noSidewaysScroll(page);

  await minhContext.close();
});

test('a look-alike is added and offered as a merge', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const page = await minhContext.newPage();
  await loginAndConsent(page, 'ap-t2-minh', 'Minh');

  const tripRes = await page.request.post('/api/trips', {
    data: {
      name: 'Look-alike',
      preset: 'trip',
      defaultLang: 'en',
      people: ['Bình'],
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  await page.goto(`/t/${tripId}/people`);
  const addField = page.getByLabel('Name to add');
  await expect(addField).toBeVisible();

  await addField.fill('Binh');
  await addField.press('Enter');

  const rows = page.locator('li.fsl-people__item');
  await expect(rows.locator('.fsl-people__name', { hasText: /^Binh$/ })).toBeVisible();
  const likeHint = page.locator('.fsl-people__like');
  await expect(likeHint).toContainText('Like Bình?');

  page.once('dialog', (d) => d.accept());
  await likeHint.getByRole('button', { name: 'Merge' }).click();

  await expect(rows.filter({ hasText: 'Bình' })).toHaveCount(1);
  await expect(rows.locator('.fsl-people__name', { hasText: /^Binh$/ })).toHaveCount(0);

  await minhContext.close();
});

test('signing out forgets who this phone was', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'ap-t3-minh', 'Minh');

  const tripRes = await minh.request.post('/api/trips', {
    data: {
      name: 'Forget Me Trip',
      preset: 'trip',
      defaultLang: 'en',
      people: ['Chi'],
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  const viewRes = await minh.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok()).toBe(true);
  const view = await viewRes.json();
  const token = view.links.group;

  const guestContext = await englishContext(browser);
  const page = await guestContext.newPage();

  await page.goto(`/j/${token}`);
  await expect(page).toHaveURL(/\/who(\?.*)?$/);
  await page.getByRole('radio', { name: /Chi/ }).click();
  await page.getByRole('button', { name: 'Continue as Chi' }).click();
  await expect(page.getByText('Viewing as Chi')).toBeVisible();

  await loginAndConsent(page, 'ap-t3-chi', 'Chi');
  await page.goto('/groups');
  await page.getByRole('button', { name: 'Account' }).click();
  const accountDialog = page.getByRole('dialog', { name: 'Account' });
  await expect(accountDialog).toBeVisible();
  await accountDialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/t/${tripId}`);
  await expect(page.getByText("You don't have access to this group")).toBeVisible();
  await expect(page.getByText('Viewing as Chi')).toHaveCount(0);

  await page.goto(`/j/${token}`);
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Chi/ })).toBeVisible();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);

  await minhContext.close();
  await guestContext.close();
});
