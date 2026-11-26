import { test, expect, type Page } from '@playwright/test';
import {
  createActorContext,
  createPersonalEntry,
  firstOfLastMonth,
  getCategories,
  PHONE_VI,
  saveShot,
  setupNhanBook,
  signIn,
} from './group-shares-helpers';

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(PHONE_VI.width);
}

test('budgets discovery: empty card, starters, create, back to book, gear menu, and category report', async ({
  browser,
}, testInfo) => {
  const context = await createActorContext(browser, PHONE_VI);
  const page = await context.newPage();

  try {
    await signIn(page, { sub: 'e2e-budgets-discovery-vi-phone', name: 'Nhan' });
    const wallets = await setupNhanBook(page, { tcbStart: 5_000_000, cashStart: 2_000_000 });

    const cats = await getCategories(page);
    const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống');
    expect(foodCat, 'Ăn uống expense category should exist').toBeDefined();

    const lastMonthDate = firstOfLastMonth();
    const lastMonthYm = lastMonthDate.slice(0, 7);

    // Seed a last-month expense in Ăn uống so starters appear when opening the create sheet.
    await createPersonalEntry(page, {
      type: 'expense',
      walletId: wallets.tcb.id,
      categoryId: foodCat!.id,
      amount: 450_000,
      date: lastMonthDate,
      note: 'Phở tháng trước',
    });

    // 1. Sổ chi tiêu shows the Ngân sách card's empty state when there are no budgets.
    await page.goto('/trips');
    const card = page.getByTestId('book-budgets');
    await expect(card).toBeVisible();
    const emptyState = page.getByTestId('book-budgets-empty');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(
      'Đặt mức chi cho một danh mục để biết mỗi ngày còn chi được bao nhiêu',
    );
    const addBtn = page.getByTestId('book-budgets-add');
    await expect(addBtn).toHaveText('Đặt ngân sách');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'discovery-book-empty', PHONE_VI);

    // 2. Open sheet from the card -> starters show.
    await addBtn.click();
    await expect(page).toHaveURL(/\/budgets\?new=1$/);
    const starters = page.getByTestId('budget-starters');
    await expect(starters).toBeVisible();
    const foodStarterRow = page.getByTestId(`budget-starter-row-${foodCat!.id}`);
    await expect(foodStarterRow).toBeVisible();
    await expect(foodStarterRow).toContainText('Ăn uống');
    const setStarterBtn = page.getByTestId(`budget-starter-set-${foodCat!.id}`);
    await expect(setStarterBtn).toHaveText('Đặt');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'discovery-starters', PHONE_VI);

    // 3. Tap "Đặt" -> land on the new budget's page.
    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/me/personal/budgets') &&
          res.request().method() === 'POST' &&
          res.ok(),
      ),
      setStarterBtn.click(),
    ]);
    const { budget } = (await createRes.json()) as { budget: { id: string } };

    await expect(page).toHaveURL(new RegExp(`/budgets/${budget.id}$`));
    const summaryCard = page.getByTestId('budget-summary-card');
    await expect(summaryCard).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'discovery-budget-detail', PHONE_VI);

    // 4. One Back from the new budget lands directly on Sổ chi tiêu (D5).
    await page.getByRole('link', { name: 'Quay lại' }).click();
    await expect(page).toHaveURL(/\/trips$/);
    await expect(page.getByTestId(`book-budget-row-${budget.id}`)).toBeVisible();

    // 5. Gear -> Ngân sách -> page lists the created budget.
    await page.getByTestId('personal-settings-btn').click();
    const settingsBudgetsRow = page.getByTestId('personal-settings-budgets');
    await expect(settingsBudgetsRow).toBeVisible();
    await expect(settingsBudgetsRow).toContainText('Ngân sách');
    await expect(page.getByTestId('personal-settings-budgets-count')).toHaveText('1');
    await settingsBudgetsRow.click();

    await expect(page).toHaveURL(/\/budgets$/);
    const listRow = page.getByTestId(`budget-row-${budget.id}`);
    await expect(listRow).toBeVisible();
    await expect(listRow).toContainText('Ăn uống');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'discovery-budgets-list', PHONE_VI);

    // 6. Category report shows "Xem ngân sách" and opens the budget page.
    await page.goto(
      `/reports/category/${encodeURIComponent(foodCat!.id)}?mode=month&month=${lastMonthYm}`,
    );
    const reportSummary = page.getByTestId('category-drilldown-summary');
    await expect(reportSummary).toBeVisible();
    await expect(reportSummary).toContainText('Ăn uống');
    const reportBudgetAction = page.getByTestId('report-category-budget-action');
    await expect(reportBudgetAction).toBeVisible();
    await expect(reportBudgetAction).toContainText('Xem ngân sách');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'discovery-report-view-budget', PHONE_VI);

    await reportBudgetAction.click();
    await expect(page).toHaveURL(new RegExp(`/budgets/${budget.id}$`));
  } finally {
    await context.close();
  }
});
