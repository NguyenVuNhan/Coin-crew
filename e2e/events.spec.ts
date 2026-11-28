import { test, expect, type Page } from '@playwright/test';
import {
  createActorContext,
  getCategories,
  openEntry,
  PHONE_VI,
  saveShot,
  setupNhanBook,
  signIn,
  typeAmount,
} from './group-shares-helpers';

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

test('events: create with name only, auto-tag expense, run two events, stop one, and open tag report', async ({
  browser,
}, testInfo) => {
  const context = await createActorContext(browser, PHONE_VI);
  const page = await context.newPage();

  try {
    await signIn(page, { sub: 'e2e-events-vi-phone-flow', name: 'Nhan' });
    await setupNhanBook(page, { tcbStart: 5_000_000, cashStart: 2_000_000 });

    const cats = await getCategories(page);
    const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống');
    expect(foodCat, 'Ăn uống expense category should exist').toBeDefined();

    // 1. Create "Đà Lạt" with only a name; the book row reads "Đà Lạt đang diễn ra".
    await page.goto('/');
    const idleBookRow = page.getByTestId('book-event-row');
    await expect(idleBookRow).toBeVisible();
    await expect(idleBookRow).toContainText('Sự kiện');
    await idleBookRow.click();

    await expect(page).toHaveURL(/\/events$/);
    await page.getByTestId('events-empty-add').click();

    await expect(page.getByTestId('event-form')).toBeVisible();
    await page.getByTestId('event-form-name').fill('Đà Lạt');
    await page.getByTestId('event-form-submit').click();

    await expect(page).toHaveURL(/\/events\/[^/]+$/);
    const dalatUrl = page.url();
    await expect(page.getByTestId('event-state-pill')).toHaveText('Đang diễn ra');
    await expect(page.getByTestId('event-tag-name')).toHaveText(/#dalat-\d{6}$/);

    await page.goto('/');
    const singleBookRow = page.getByTestId('book-event-row');
    await expect(singleBookRow).toBeVisible();
    await expect(singleBookRow).toContainText('Đà Lạt đang diễn ra');
    await expect(singleBookRow).toContainText('ngày 1');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'event-book-one', PHONE_VI);

    // 2. Add an expense; the entry form shows the event row on.
    await openEntry(page);
    await typeAmount(page, PHONE_VI, '450000');
    await pickCategoryInPicker(page, foodCat!.id);

    const entryEventRow = page.getByTestId('entry-event-row');
    await expect(entryEventRow).toBeVisible();
    await expect(entryEventRow).toContainText('Đà Lạt');

    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/me/personal/transactions') &&
          res.request().method() === 'POST' &&
          res.ok(),
      ),
      page.getByTestId('entry-save-btn').click(),
    ]);

    // 3. Create a second event "Mua sắm Tết"; the book row reads "2 sự kiện đang diễn ra".
    await page.goto('/events');
    await page.getByTestId('events-new-button').click();

    await expect(page.getByTestId('event-form')).toBeVisible();
    await page.getByTestId('event-form-name').fill('Mua sắm Tết');
    await page.getByTestId('event-form-submit').click();

    const existingSheet = page.getByTestId('event-existing-sheet');
    await expect(existingSheet).toBeVisible();
    await page.getByTestId('event-existing-no').click();

    await expect(page).toHaveURL(/\/events\/[^/]+$/);

    await page.goto('/');
    const manyBookRow = page.getByTestId('book-event-row');
    await expect(manyBookRow).toBeVisible();
    await expect(manyBookRow).toContainText('2 sự kiện đang diễn ra');
    await expect(manyBookRow).toContainText('Đà Lạt');
    await expect(manyBookRow).toContainText('Mua sắm Tết');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'event-book-many', PHONE_VI);

    // 4. Stop "Đà Lạt"; the book row is back to one.
    await page.goto(dalatUrl);
    await expect(page.getByTestId('event-stop-button')).toBeVisible();
    await page.getByTestId('event-stop-button').click();
    await expect(page.getByTestId('event-stop-confirm-modal')).toBeVisible();
    await page.getByTestId('event-stop-confirm').click();
    await expect(page.getByTestId('event-state-pill')).toHaveText('Đã xong');

    await page.goto('/');
    const backToOneRow = page.getByTestId('book-event-row');
    await expect(backToOneRow).toBeVisible();
    await expect(backToOneRow).toContainText('Mua sắm Tết đang diễn ra');
    await assertNoHorizontalOverflow(page);

    // 5. Open "Xem báo cáo" from Đà Lạt's event page; report shows #dalat-… chip and 450.000₫.
    await page.goto(dalatUrl);
    const viewReportLink = page.getByTestId('event-view-report');
    await expect(viewReportLink).toBeVisible();
    await viewReportLink.click();

    await expect(page).toHaveURL(/\/reports\?/);
    const tagPill = page.getByTestId('reports-tag-filter-pill');
    await expect(tagPill).toBeVisible();
    await expect(tagPill).toContainText(/#dalat-\d{6}/);

    const summary = page.getByTestId('reports-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('450.000₫');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'event-tag-report', PHONE_VI);
  } finally {
    await context.close();
  }
});
