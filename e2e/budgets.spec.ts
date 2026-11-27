import { test, expect, type Page } from '@playwright/test';
import {
  addTripExpense,
  createActorContext,
  createPersonalEntry,
  createTrip,
  currentMonth,
  getCategories,
  getPersonalList,
  MINUS,
  openEntry,
  PHONE_VI,
  saveShot,
  setupNhanBook,
  signIn,
  todayIso,
  typeAmount,
  updateGroupLink,
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

test('budgets: monthly food budget, personal + group spending, report parity, and entry over-limit warning', async ({
  browser,
}, testInfo) => {
  const context = await createActorContext(browser, PHONE_VI);
  const page = await context.newPage();

  try {
    await signIn(page, { sub: 'e2e-budgets-vi-phone-nhan', name: 'Nhan' });
    const wallets = await setupNhanBook(page, { tcbStart: 5_000_000, cashStart: 2_000_000 });

    const cats = await getCategories(page);
    const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống');
    expect(foodCat, 'Ăn uống expense category should exist').toBeDefined();

    const today = todayIso();

    // Create monthly Ăn uống budget of 3.000.000₫ via API.
    const budgetRes = await page.request.post('/api/me/personal/budgets', {
      data: {
        target: { kind: 'category', categoryId: foodCat!.id },
        currency: 'VND',
        amount: 3_000_000,
        periodKind: 'month',
        monthStartDay: 1,
        excludedWalletIds: [],
        today,
      },
    });
    expect(
      budgetRes.ok(),
      `create budget failed: ${budgetRes.status()} ${budgetRes.ok() ? '' : await budgetRes.text()}`,
    ).toBe(true);
    const { budget } = (await budgetRes.json()) as { budget: { id: string } };

    // Two personal expenses in Ăn uống: 450.000₫ + 300.000₫ = 750.000₫.
    await createPersonalEntry(page, {
      type: 'expense',
      walletId: wallets.tcb.id,
      categoryId: foodCat!.id,
      amount: 450_000,
      date: today,
      note: 'Phở sáng',
    });
    await createPersonalEntry(page, {
      type: 'expense',
      walletId: wallets.cash.id,
      categoryId: foodCat!.id,
      amount: 300_000,
      date: today,
      note: 'Cơm trưa',
    });

    // One group share in Ăn uống: 900.000₫ split equally between Nhan and Minh -> Nhan's share = 450.000₫.
    const trip = await createTrip(page, {
      name: 'Ăn tối',
      preset: 'trip',
      defaultLang: 'vi',
      people: ['Minh'],
    });
    const minhPid = trip.pidByName('Minh');
    await addTripExpense(page, trip.tripId, {
      description: 'Lẩu',
      amount: 900_000,
      spentOn: today,
      payerId: trip.myPid,
      mode: 'equal',
      entries: [
        { participantId: trip.myPid, value: 1 },
        { participantId: minhPid, value: 1 },
      ],
    });
    const list = await getPersonalList(page, { month: currentMonth(), groups: 'show' });
    const groupRow = list.groupRows?.[0];
    expect(groupRow, 'group row should appear in personal list').toBeDefined();
    await updateGroupLink(page, groupRow!.rootId, {
      walletId: wallets.tcb.id,
      categoryId: foodCat!.id,
    });

    // Total spent = 450.000 + 300.000 + 450.000 = 1.200.000₫ (40% of 3.000.000₫); Còn lại = 1.800.000₫.
    await page.goto('/budgets');
    const row = page.getByTestId(`budget-row-${budget.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Ăn uống');
    await expect(row).toContainText('1.800.000₫');
    await expect(row).toContainText('còn lại');

    const barFill = row.locator('.fsl-budget-bar > div').first();
    await expect(barFill).toHaveAttribute('style', /width:\s*40%/);
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'budgets-list', PHONE_VI);

    // Open the budget page and assert "Còn lại" and spent.
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/budgets/${budget.id}$`));
    const summaryCard = page.getByTestId('budget-summary-card');
    await expect(summaryCard).toBeVisible();
    await expect(page.getByTestId('budget-remaining-amount')).toHaveText('1.800.000₫');
    await expect(summaryCard).toContainText('Còn lại');
    await expect(summaryCard).toContainText('3.000.000₫');
    await expect(summaryCard).toContainText('1.200.000₫');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'budget-detail', PHONE_VI);

    // Assert the budget's spent equals the Ăn uống figure on /reports/category/<id> for the same month.
    await page.goto(`/reports/category/${encodeURIComponent(foodCat!.id)}`);
    const reportSummary = page.getByTestId('category-drilldown-summary');
    await expect(reportSummary).toBeVisible();
    await expect(reportSummary).toContainText('Ăn uống');
    await expect(reportSummary).toContainText('1.200.000₫');
    await assertNoHorizontalOverflow(page);

    // Enter an expense that pushes it over: 2.000.000₫ -> 3.200.000₫ spent (over by 200.000₫).
    await openEntry(page);
    await typeAmount(page, PHONE_VI, '2000000');
    await pickCategoryInPicker(page, foodCat!.id);

    const warning = page.getByTestId('entry-budget-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveClass(/bg-danger-soft/);
    await expect(warning).toContainText('vượt mức 200.000₫');
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'entry-over-warning', PHONE_VI);

    const [createRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/api/me/personal/transactions') &&
          res.request().method() === 'POST' &&
          res.ok(),
      ),
      page.getByTestId('entry-save-btn').click(),
    ]);
    const createdJson = (await createRes.json()) as { entries: Array<{ id: string }> };
    const createdId = createdJson.entries[0]!.id;

    const snackbar = page.locator('.fsl-snackbar');
    await expect(snackbar).toBeVisible();
    await expect(snackbar.locator('.fsl-snackbar__message')).toContainText('Ăn uống');
    await expect(snackbar.locator('.fsl-snackbar__message')).toContainText('200.000₫');
    await saveShot(page, testInfo, 'entry-over-snackbar', PHONE_VI);

    // Edit path triggers showBudgetSaved without undo, showing the "Xem" action to open the budget.
    await page.goto(`/entries/${encodeURIComponent(createdId)}/edit`);
    await expect(page.getByTestId('entry-budget-warning')).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/me/personal/transactions/${createdId}`) &&
          res.request().method() === 'PATCH' &&
          res.ok(),
      ),
      page.getByTestId('entry-save-btn').click(),
    ]);

    await expect(snackbar).toBeVisible();
    const seeButton = snackbar.locator('.fsl-snackbar__action');
    await expect(seeButton).toHaveText('Xem');
    await seeButton.click();

    await expect(page).toHaveURL(new RegExp(`/budgets/${budget.id}$`));
    await expect(page.getByTestId('budget-remaining-amount')).toHaveText(`${MINUS}200.000₫`);
    await expect(page.getByTestId('budget-summary-card')).toContainText('3.200.000₫');
    await expect(page.getByTestId('budget-state-note')).toHaveClass(/bg-danger-soft/);
    await assertNoHorizontalOverflow(page);
    await saveShot(page, testInfo, 'budget-detail-over', PHONE_VI);
  } finally {
    await context.close();
  }
});
