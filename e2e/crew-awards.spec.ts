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

function newScore(participantId: string) {
  return {
    participantId,
    presence: 30,
    reliability: 80,
    guest: 0,
    presenceJoinStreak: 0,
    presenceSkipStreak: 0,
    reliabilityJoinStreak: 0,
    reliabilitySkipStreak: 0,
    sessionsSeen: 10,
    sessionsPlanned: 10,
    timesPlayed: 5,
    guestsTotal: 0,
    lastPlayedOn: '2026-11-14',
    lastSessionRoot: 'r-1',
    lastBack: false,
    lastReturnGap: 0,
    lastEndedNoShowStreak: 0,
  };
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

  // 5. Seed a finished sport bill
  const billRes = await page.request.post(`/api/trips/${tripId}/expenses`, {
    data: {
      description: 'Court rental & shuttles',
      amount: 400000,
      spentOn: '2026-11-14',
      payerId: adminPid,
      mode: 'amounts',
      entries: [
        { participantId: adminPid, value: 100000 },
        { participantId: anPid, value: 100000 },
        { participantId: binhPid, value: 100000 },
        { participantId: chiPid, value: 100000 },
      ],
      meta: {
        sport: {
          planning: false,
          court: 400000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [
            { participantId: adminPid, maleSlots: 1, femaleSlots: 0 },
            { participantId: anPid, maleSlots: 1, femaleSlots: 0 },
            { participantId: binhPid, maleSlots: 1, femaleSlots: 0 },
            { participantId: chiPid, maleSlots: 1, femaleSlots: 0 },
          ],
          maleSlotRate: 100000,
          femaleSlotRate: 0,
        },
      },
    },
  });
  expect(billRes.ok()).toBe(true);

  // Provide attendance scores so all four award styles trigger
  await page.route(`**/api/trips/${tripId}/attendance`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        people: [
          {
            participantId: adminPid,
            score: { ...newScore(adminPid), presence: 92, presenceJoinStreak: 12, timesPlayed: 10 },
            labels: ['regular'],
            wantedStamp: false,
          },
          {
            participantId: anPid,
            score: { ...newScore(anPid), presence: 30, lastBack: true, lastReturnGap: 6, timesPlayed: 4 },
            labels: ['back'],
            wantedStamp: false,
          },
          {
            participantId: binhPid,
            score: { ...newScore(binhPid), guest: 4, guestsTotal: 9, timesPlayed: 6 },
            labels: ['topGuest'],
            wantedStamp: false,
          },
          {
            participantId: chiPid,
            score: { ...newScore(chiPid), reliability: 35, reliabilitySkipStreak: 3, lastPlayedOn: '2026-10-18', timesPlayed: 2 },
            labels: ['flaky'],
            wantedStamp: true,
          },
        ],
        latestSession: { rootId: 'r-1', spentOn: '2026-11-14' },
        pendingSessions: 0,
      }),
    });
  });

  // 6. Open /t/<id>/awards: the four card titles show
  await page.goto(`/t/${tripId}/awards`);
  await expect(page.getByTestId('crew-awards-screen')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Award night' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wanted poster' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Folk verse' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stadium board' })).toBeVisible();

  await expect(page.getByTestId('meme-card-awards')).toBeVisible();
  await expect(page.getByTestId('meme-card-wanted')).toBeVisible();
  await expect(page.getByTestId('meme-card-verse')).toBeVisible();
  await expect(page.getByTestId('meme-card-board')).toBeVisible();

  // 7. Save triggers a download event or the saved status message
  const downloadPromise = page.waitForEvent('download').catch(() => null);
  await page.getByTestId('save-awards').click();

  await expect(page.getByRole('status')).toContainText(/Picture saved|Đã lưu ảnh/i);
  const download = await downloadPromise;
  if (download) {
    expect(download.suggestedFilename()).toBe('crew-awards-awards.png');
  }

  await context.close();
});
