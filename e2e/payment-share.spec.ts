import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const MINH_BANK = {
  bin: '970407',
  accountNumber: '19031234565678',
  holderName: 'Nguyen Van Minh',
};

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

test('pay link: a guest who owes one person lands on the QR', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'ps-t1-minh', 'Minh');

  const tripRes = await minh.request.post('/api/trips', {
    data: {
      name: 'Trip 1',
      preset: 'trip',
      defaultLang: 'en',
      people: ['Chi'],
      myBank: MINH_BANK,
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  const viewRes = await minh.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok()).toBe(true);
  const view = await viewRes.json();
  const token = view.links.group;
  const minhPid = view.me.participantId;
  const chiPid = view.people.find((p: { name: string; id: string }) => p.name === 'Chi')!.id;

  const expenseRes = await minh.request.post(`/api/trips/${tripId}/expenses`, {
    data: {
      description: 'Dinner',
      amount: 300000,
      spentOn: '2026-11-05',
      payerId: minhPid,
      mode: 'equal',
      entries: [
        { participantId: minhPid, value: 1 },
        { participantId: chiPid, value: 1 },
      ],
    },
  });
  expect(expenseRes.ok()).toBe(true);

  const guestContext = await englishContext(browser);
  const guest = await guestContext.newPage();

  await guest.goto(`/j/${token}/owe`);
  await expect(guest).toHaveURL(/\/who(\?.*)?$/);
  await guest.getByRole('radio', { name: /Chi/ }).click();
  await guest.getByRole('button', { name: 'Continue as Chi' }).click();

  await expect(guest.getByRole('img', { name: /VietQR code to pay Minh/ })).toBeVisible();
  await expect(guest).toHaveURL(/\/pay\//);
  await expect(guest.getByRole('link', { name: 'See the group' })).toBeVisible();

  await minhContext.close();
  await guestContext.close();
});

test('pay link: a guest who owes two people sees both and pays one', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'ps-t2-minh', 'Minh');

  const tripRes = await minh.request.post('/api/trips', {
    data: {
      name: 'Trip 2',
      preset: 'trip',
      defaultLang: 'en',
      people: ['Bình', 'Chi'],
      myBank: MINH_BANK,
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  const viewRes = await minh.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok()).toBe(true);
  const view = await viewRes.json();
  const token = view.links.group;
  const minhPid = view.me.participantId;
  const binhPid = view.people.find((p: { name: string; id: string }) => p.name === 'Bình')!.id;
  const chiPid = view.people.find((p: { name: string; id: string }) => p.name === 'Chi')!.id;

  const exp1Res = await minh.request.post(`/api/trips/${tripId}/expenses`, {
    data: {
      description: 'Hotel',
      amount: 400000,
      spentOn: '2026-11-05',
      payerId: minhPid,
      mode: 'equal',
      entries: [
        { participantId: minhPid, value: 1 },
        { participantId: binhPid, value: 1 },
        { participantId: chiPid, value: 1 },
      ],
    },
  });
  expect(exp1Res.ok()).toBe(true);

  const exp2Res = await minh.request.post(`/api/trips/${tripId}/expenses`, {
    data: {
      description: 'Taxi',
      amount: 200000,
      spentOn: '2026-11-05',
      payerId: binhPid,
      mode: 'equal',
      entries: [
        { participantId: binhPid, value: 1 },
        { participantId: chiPid, value: 1 },
      ],
    },
  });
  expect(exp2Res.ok()).toBe(true);

  const guestContext = await englishContext(browser);
  const guest = await guestContext.newPage();

  await guest.goto(`/j/${token}/owe`);
  await expect(guest).toHaveURL(/\/who(\?.*)?$/);
  await guest.getByRole('radio', { name: /Chi/ }).click();
  await guest.getByRole('button', { name: 'Continue as Chi' }).click();

  await expect(guest.getByRole('heading', { name: 'Chi, you owe' })).toBeVisible();
  const payMinhLink = guest.getByRole('link', { name: 'Pay Minh' });
  const payBinhLink = guest.getByRole('link', { name: 'Pay Bình' });
  await expect(payMinhLink).toBeVisible();
  await expect(payBinhLink).toBeVisible();

  await payMinhLink.click();
  await expect(guest.getByRole('img', { name: /VietQR code to pay Minh/ })).toBeVisible();

  await minhContext.close();
  await guestContext.close();
});

test('the ordinary invite link still opens the group page', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'ps-t3-minh', 'Minh');

  const tripRes = await minh.request.post('/api/trips', {
    data: {
      name: 'Trip 3',
      preset: 'trip',
      defaultLang: 'en',
      people: ['Chi'],
      myBank: MINH_BANK,
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  const viewRes = await minh.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok()).toBe(true);
  const view = await viewRes.json();
  const token = view.links.group;

  const guestContext = await englishContext(browser);
  const guest = await guestContext.newPage();

  await guest.goto(`/j/${token}`);
  await expect(guest).toHaveURL(/\/who(\?.*)?$/);
  await guest.getByRole('radio', { name: /Chi/ }).click();
  await guest.getByRole('button', { name: 'Continue as Chi' }).click();

  await expect(guest.getByText('Viewing as Chi')).toBeVisible();

  await minhContext.close();
  await guestContext.close();
});

test("bill link: a guest's first screen is their share and the QR; View the bill opens the bill", async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'ps-t4-minh', 'Minh');

  const tripRes = await minh.request.post('/api/trips', {
    data: {
      name: 'Badminton Sunday',
      preset: 'sport',
      defaultLang: 'en',
      people: ['Bình', 'Chi'],
      myBank: MINH_BANK,
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  const viewRes = await minh.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok()).toBe(true);
  const view = await viewRes.json();
  const token = view.links.group;

  await minh.goto(`/t/${tripId}/expenses/new`);
  const whatFor = minh.getByLabel('What for').or(minh.locator('#expense-what-for'));
  await whatFor.fill('Sunday badminton');
  const courtInput = minh.getByLabel(/^Court/).or(minh.locator('#sport-court'));
  await courtInput.fill('400k');
  await minh.getByRole('button', { name: 'Add expense' }).click();
  await expect(minh).toHaveURL(/\/expenses\/(?!new$)[^/?#]+$/);
  const expenseId = minh.url().match(/\/expenses\/([^/?#]+)$/)![1]!;

  const guestContext = await englishContext(browser);
  const guest = await guestContext.newPage();

  await guest.goto(`/j/${token}/e/${expenseId}`);
  await expect(guest).toHaveURL(/\/who(\?.*)?$/);
  await guest.getByRole('radio', { name: /Bình/ }).click();
  await guest.getByRole('button', { name: 'Continue as Bình' }).click();

  await expect(guest.getByRole('img', { name: /VietQR code to pay Minh/ })).toBeVisible();

  await guest.getByRole('button', { name: 'View the bill' }).click();
  const billDialog = guest.getByRole('dialog', { name: 'The bill' });
  await expect(billDialog).toBeVisible();
  await expect(billDialog.getByText('COSTS')).toBeVisible();
  await expect(billDialog.getByText('Court: 400.000₫')).toBeVisible();

  await minhContext.close();
  await guestContext.close();
});

test('bill link: a signed-in newcomer joins and lands on that bill', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'ps-t5-minh', 'Minh');

  const tripRes = await minh.request.post('/api/trips', {
    data: {
      name: 'Badminton Club',
      preset: 'sport',
      defaultLang: 'en',
      people: ['Bình', 'Chi'],
      myBank: MINH_BANK,
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  const viewRes = await minh.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok()).toBe(true);
  const view = await viewRes.json();
  const token = view.links.group;

  await minh.goto(`/t/${tripId}/expenses/new`);
  const whatFor = minh.getByLabel('What for').or(minh.locator('#expense-what-for'));
  await whatFor.fill('Sunday badminton');
  const courtInput = minh.getByLabel(/^Court/).or(minh.locator('#sport-court'));
  await courtInput.fill('400k');
  await minh.getByRole('button', { name: 'Add expense' }).click();
  await expect(minh).toHaveURL(/\/expenses\/(?!new$)[^/?#]+$/);
  const expenseId = minh.url().match(/\/expenses\/([^/?#]+)$/)![1]!;

  const hoaContext = await englishContext(browser);
  const hoa = await hoaContext.newPage();
  await loginAndConsent(hoa, 'ps-t5-hoa', 'Hoa');

  await hoa.goto(`/j/${token}/e/${expenseId}`);
  await expect(hoa).toHaveURL(/\/who(\?.*)?$/);

  await hoa.getByRole('button', { name: 'Not on the list? Join as Hoa' }).click();

  await expect(hoa.getByRole('button', { name: 'Gender for Hoa' })).toBeVisible();
  await hoa.getByRole('button', { name: 'Gender for Hoa' }).click();
  await hoa.getByRole('button', { name: 'Join as Hoa', exact: true }).click();

  await expect(hoa).toHaveURL(new RegExp(`/expenses/${expenseId}/pay$`));
  await expect(hoa.getByText('Nothing for Hoa in this bill')).toBeVisible();

  await minhContext.close();
  await hoaContext.close();
});

test('sharing a bill with no bank details asks first', async ({ browser }) => {
  const minhContext = await englishContext(browser);
  const minh = await minhContext.newPage();
  await loginAndConsent(minh, 'ps-t6-minh', 'Minh');

  const tripRes = await minh.request.post('/api/trips', {
    data: {
      name: 'No Bank Sport',
      preset: 'sport',
      defaultLang: 'en',
      people: ['Chi'],
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  await minh.goto(`/t/${tripId}/expenses/new`);
  const whatFor = minh.getByLabel('What for').or(minh.locator('#expense-what-for'));
  await whatFor.fill('Sunday session');
  const courtInput = minh.getByLabel(/^Court/).or(minh.locator('#sport-court'));
  await courtInput.fill('400k');
  await minh.getByRole('button', { name: 'Add expense' }).click();
  await expect(minh).toHaveURL(/\/expenses\/(?!new$)[^/?#]+$/);

  await minhContext.grantPermissions(['clipboard-read', 'clipboard-write']);

  await minh.getByRole('button', { name: 'Share bill & QR' }).click();
  const bankFirstDialog = minh.getByRole('dialog', { name: 'Add your bank details first?' });
  await expect(bankFirstDialog).toBeVisible();
  await expect(bankFirstDialog.getByRole('link', { name: 'Add bank details' })).toBeVisible();

  await bankFirstDialog.getByRole('button', { name: 'Share anyway' }).click();
  await expect(minh.getByText('Message and link copied. Paste it in the group chat.')).toBeVisible();

  await minh.goto(`/t/${tripId}`);
  await minh.getByRole('button', { name: 'Invite' }).click();
  const inviteDialog = minh.getByRole('dialog', { name: 'Invite' });
  await expect(inviteDialog).toBeVisible();
  await expect(inviteDialog.getByText('Add your bank details first?')).toBeVisible();

  await minhContext.close();
});
