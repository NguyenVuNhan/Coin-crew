import { test, expect, type Page } from '@playwright/test';
import {
  createActorContext,
  createPersonalEntry,
  createTrip,
  getCategories,
  openEntry,
  PHONE_VI,
  saveShot,
  setupNhanBook,
  signIn,
  todayIso,
  typeAmount,
} from './group-shares-helpers';

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d! + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function pickCategoryInPicker(page: Page, categoryId: string): Promise<void> {
  const tile = page.getByTestId(`category-tile-${categoryId}`);
  if (await tile.isVisible()) {
    await tile.click();
    return;
  }
  await page.getByTestId('category-more').click();
  await page.getByTestId(`category-option-${categoryId}`).click();
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(PHONE_VI.width);
}

test('travels: during a trip — create via UI, skip existing, add expense, Sổ chi tiêu row, and trip page', async ({
  browser,
}, testInfo) => {
  const context = await createActorContext(browser, PHONE_VI);
  const page = await context.newPage();

  try {
    await signIn(page, { sub: 'e2e-travels-vi-phone-during', name: 'Nhan' });
    const wallets = await setupNhanBook(page, { tcbStart: 5_000_000, cashStart: 2_000_000 });

    const cats = await getCategories(page);
    const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống');
    expect(foodCat, 'Ăn uống expense category should exist').toBeDefined();

    const today = todayIso();
    const endDay = addDaysIso(today, 2);

    // Create a group so we can link it in the trip form.
    const group = await createTrip(page, {
      name: 'Đà Lạt gang',
      preset: 'trip',
      defaultLang: 'vi',
      people: ['Minh'],
    });

    // Seed an existing expense on today so the "Gắn tag cho khoản chi đã có?" sheet appears.
    await createPersonalEntry(page, {
      type: 'expense',
      walletId: wallets.cash.id,
      categoryId: foodCat!.id,
      amount: 120_000,
      date: today,
      note: 'Cà phê sáng',
    });

    // Open Sổ chi tiêu, click idle trip row -> /travels -> create trip via UI.
    await page.goto('/');
    const idleBookRow = page.getByTestId('book-travel-row');
    await expect(idleBookRow).toBeVisible();
    await expect(idleBookRow).toContainText('Chuyến đi');
    await idleBookRow.click();

    await expect(page).toHaveURL(/\/travels$/);
    await page.getByTestId('travels-empty-add').click();

    const form = page.locator('.fsl-travel-form');
    await expect(form).toBeVisible();
    await page.getByTestId('travel-form-name').fill('Đà Lạt');
    await page.getByTestId('travel-form-start').fill(today);
    await page.getByTestId('travel-form-end').fill(endDay);

    await page.getByTestId('travel-form-pick-groups').click();
    await expect(page.getByTestId('travel-group-picker')).toBeVisible();
    await page.getByTestId(`travel-group-row-${group.tripId}`).click();
    await page.getByTestId('travel-group-picker-done').click();
    await expect(page.getByTestId(`travel-form-group-chip-${group.tripId}`)).toBeVisible();

    await page.getByTestId('travel-form-limit').fill('5000000');
    await expect(page.getByTestId('travel-form-limit-preview')).toHaveText('5.000.000₫');

    await page.getByTestId('travel-form-submit').click();

    // Existing expenses sheet: choose "Chỉ từ giờ trở đi".
    const existingSheet = page.getByTestId('travel-existing-sheet');
    await expect(existingSheet).toBeVisible();
    await expect(page.getByTestId('travel-existing-no')).toHaveText('Chỉ từ giờ trở đi');
    await page.getByTestId('travel-existing-no').click();

    await expect(page).toHaveURL(/\/travels\/[^/]+$/);

    // Add a new expense: entry-travel-row is pre-filled with "Chuyến đi Đà Lạt".
    await openEntry(page);
    await typeAmount(page, PHONE_VI, '450000');
    await pickCategoryInPicker(page, foodCat!.id);

    const entryTravelRow = page.getByTestId('entry-travel-row');
    await expect(entryTravelRow).toBeVisible();
    await expect(entryTravelRow).toContainText('Chuyến đi Đà Lạt');

    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/me/personal/transactions') &&
          res.request().method() === 'POST' &&
          res.ok(),
      ),
      page.getByTestId('entry-save-btn').click(),
    ]);

    // Open Sổ chi tiêu: the row says "Đang đi Đà Lạt" with day 1/3 and the budget bar.
    await page.goto('/');
    const activeBookRow = page.getByTestId('book-travel-row');
    await expect(activeBookRow).toBeVisible();
    await expect(activeBookRow).toContainText('Đang đi Đà Lạt');
    await expect(activeBookRow).toContainText('ngày 1/3');
    await expect(activeBookRow).toContainText('450.000₫');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'travel-book-on', PHONE_VI);

    // Open the trip page: total equals the new expense (450.000₫), not the skipped one.
    await activeBookRow.click();
    await expect(page).toHaveURL(/\/travels\/[^/]+$/);
    const summaryCard = page.getByTestId('travel-summary-card');
    await expect(summaryCard).toBeVisible();
    await expect(summaryCard).toContainText('450.000₫');
    await expect(page.getByTestId('travel-state-pill')).toHaveText('Đang đi');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'travel-detail-on', PHONE_VI);
  } finally {
    await context.close();
  }
});

test('travels: after a trip — create past trip, tag existing expenses, and verify trip page', async ({
  browser,
}, testInfo) => {
  const context = await createActorContext(browser, PHONE_VI);
  const page = await context.newPage();

  try {
    await signIn(page, { sub: 'e2e-travels-vi-phone-after', name: 'Nhan' });
    const wallets = await setupNhanBook(page, { tcbStart: 5_000_000, cashStart: 2_000_000 });

    const cats = await getCategories(page);
    const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống');
    expect(foodCat, 'Ăn uống expense category should exist').toBeDefined();

    const today = todayIso();
    const pastStart = addDaysIso(today, -10);
    const pastEnd = addDaysIso(today, -8);

    // Seed an existing expense inside the past trip's range.
    await createPersonalEntry(page, {
      type: 'expense',
      walletId: wallets.cash.id,
      categoryId: foodCat!.id,
      amount: 320_000,
      date: addDaysIso(today, -9),
      note: 'Bánh mì',
    });

    await page.goto('/travels');
    await page.getByTestId('travels-empty-add').click();

    const form = page.locator('.fsl-travel-form');
    await expect(form).toBeVisible();
    await page.getByTestId('travel-form-name').fill('Phú Quốc');
    await page.getByTestId('travel-form-start').fill(pastStart);
    await page.getByTestId('travel-form-end').fill(pastEnd);
    await page.getByTestId('travel-form-submit').click();

    // Answer "Gắn tag cho cả 1 khoản".
    const existingSheet = page.getByTestId('travel-existing-sheet');
    await expect(existingSheet).toBeVisible();
    const yesBtn = page.getByTestId('travel-existing-yes');
    await expect(yesBtn).toContainText('Gắn tag');
    await yesBtn.click();

    // Trip page shows the existing expense.
    await expect(page).toHaveURL(/\/travels\/[^/]+$/);
    await expect(page.getByTestId('travel-state-pill')).toHaveText('Đã xong');
    const summaryCard = page.getByTestId('travel-summary-card');
    await expect(summaryCard).toBeVisible();
    await expect(summaryCard).toContainText('320.000₫');
    await expect(page.getByTestId('travel-see-tx')).toContainText('Xem 1 giao dịch');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'travel-detail-done', PHONE_VI);
  } finally {
    await context.close();
  }
});
