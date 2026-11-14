import { test, expect, type Browser, type Page } from '@playwright/test';

async function englishContext(browser: Browser) {
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

test('crew meme awards and turnout card in sport group', async ({ browser }) => {
  const context = await englishContext(browser);
  const page = await context.newPage();

  // 1. Sign in as sport admin Minh via E2E_LOGIN
  await loginAndConsent(page, 'e2e-awards-admin', 'Minh');

  // 2. Create a sport group with people
  const tripRes = await page.request.post('/api/trips', {
    data: {
      name: 'Thursday Badminton',
      preset: 'sport',
      defaultLang: 'en',
      people: ['An', 'Bình', 'Chi'],
    },
  });
  expect(tripRes.ok()).toBe(true);
  const { tripId } = await tripRes.json();

  const viewRes = await page.request.get(`/api/trips/${tripId}`);
  expect(viewRes.ok()).toBe(true);
  const view = await viewRes.json();
  const people = view.people as { id: string; name: string }[];
  const adminPid = people[0].id;
  const anPid = people[1].id;
  const binhPid = people[2].id;
  const chiPid = people[3].id;

  // 3. Admin opens the plan form: the turnout card is visible
  await page.goto(`/t/${tripId}/expenses/new?mode=planning`);
  const turnoutCard = page.getByTestId('turnout-card');
  await expect(turnoutCard).toBeVisible();
  await expect(turnoutCard).toHaveClass(/fsl-turnout-card/);
  await expect(page.getByTestId('turnout-estimate')).toBeVisible();

  // Create the plan with people
  const whatFor = page.getByLabel(/What for|Khoản chi gì/i).or(page.locator('#expense-what-for'));
  await whatFor.fill('Saturday Morning Badminton');
  const savePlanBtn = page.getByRole('button', { name: /Save planned session|Lưu lịch dự kiến/i });
  await savePlanBtn.click();
  await expect(page).toHaveURL(new RegExp(`/t/${tripId}`));

  // 4. Before any finished sessions, opening /awards shows the empty state
  await page.goto(`/t/${tripId}/awards`);
  await expect(page.getByTestId('awards-empty')).toBeVisible();

  // 5. Seed real finished sport sessions through API (no mocking /attendance)
  // Minh always plays (sessions 1-6 -> regular); An is planned in 1-5 but left off 4 and 5 (-> flaky)
  const seedSession = async (spentOn: string, billPids: string[], planPids?: string[]) => {
    if (planPids) {
      const planRes = await page.request.post(`/api/trips/${tripId}/expenses`, {
        data: {
          description: `Plan ${spentOn}`,
          amount: 0,
          spentOn,
          payerId: adminPid,
          mode: 'amounts',
          entries: planPids.map((id) => ({ participantId: id, value: 0 })),
          meta: {
            sport: {
              planning: true,
              court: 100000 * planPids.length,
              shuttlecocks: [],
              extra: 0,
              rule: { kind: 'equal' },
              entries: planPids.map((id) => ({ participantId: id, maleSlots: 1, femaleSlots: 0 })),
              maleSlotRate: 0,
              femaleSlotRate: 0,
            },
          },
        },
      });
      expect(planRes.ok()).toBe(true);
      const { expenseId } = await planRes.json();

      const patchRes = await page.request.patch(`/api/trips/${tripId}/expenses/${expenseId}`, {
        data: {
          description: `Session ${spentOn}`,
          amount: 100000 * billPids.length,
          spentOn,
          payerId: adminPid,
          mode: 'amounts',
          entries: billPids.map((id) => ({ participantId: id, value: 100000 })),
          meta: {
            sport: {
              planning: false,
              court: 100000 * billPids.length,
              shuttlecocks: [],
              extra: 0,
              rule: { kind: 'equal' },
              entries: billPids.map((id) => ({ participantId: id, maleSlots: 1, femaleSlots: 0 })),
              maleSlotRate: 100000,
              femaleSlotRate: 0,
            },
          },
        },
      });
      expect(patchRes.ok()).toBe(true);
    } else {
      const billRes = await page.request.post(`/api/trips/${tripId}/expenses`, {
        data: {
          description: `Session ${spentOn}`,
          amount: 100000 * billPids.length,
          spentOn,
          payerId: adminPid,
          mode: 'amounts',
          entries: billPids.map((id) => ({ participantId: id, value: 100000 })),
          meta: {
            sport: {
              planning: false,
              court: 100000 * billPids.length,
              shuttlecocks: [],
              extra: 0,
              rule: { kind: 'equal' },
              entries: billPids.map((id) => ({ participantId: id, maleSlots: 1, femaleSlots: 0 })),
              maleSlotRate: 100000,
              femaleSlotRate: 0,
            },
          },
        },
      });
      expect(billRes.ok()).toBe(true);
    }
  };

  // Sessions 1-3: Minh & An planned and attended
  await seedSession('2026-11-01', [adminPid, anPid], [adminPid, anPid]);
  await seedSession('2026-11-02', [adminPid, anPid], [adminPid, anPid]);
  await seedSession('2026-11-03', [adminPid, anPid], [adminPid, anPid]);
  // Sessions 4-5: Minh & An planned, but An left off bill twice
  await seedSession('2026-11-04', [adminPid], [adminPid, anPid]);
  await seedSession('2026-11-05', [adminPid], [adminPid, anPid]);
  // Session 6: direct sport bill (Minh attended all 6 sessions)
  await seedSession('2026-11-06', [adminPid]);

  // 6. Open /t/<id>/awards: cards rendered from real attendance calculations
  await page.goto(`/t/${tripId}/awards`);
  await expect(page.getByTestId('crew-awards-screen')).toBeVisible();

  // All 4 card titles show
  await expect(page.getByRole('heading', { name: 'Award night' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wanted poster' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Folk verse' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stadium board' })).toBeVisible();

  // Award night card displays regular winner Minh
  const awardsCard = page.getByTestId('meme-card-awards');
  await expect(awardsCard).toBeVisible();
  await expect(awardsCard).toContainText('Minh');

  // Wanted picker lists the flaky person An
  const wantedPicker = page.getByTestId(`wanted-pick-${anPid}`);
  await expect(wantedPicker).toBeVisible();
  await expect(wantedPicker).toContainText('An');

  const wantedCard = page.getByTestId('meme-card-wanted');
  await expect(wantedCard).toBeVisible();
  await expect(wantedCard).toContainText('An');

  await expect(page.getByTestId('meme-card-verse')).toBeVisible();
  await expect(page.getByTestId('meme-card-board')).toBeVisible();

  // 7. Save triggers a download event on Chromium with expected filename
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save-awards').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('crew-awards-awards.png');

  await context.close();
});
