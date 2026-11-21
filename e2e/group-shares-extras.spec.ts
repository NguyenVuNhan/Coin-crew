import { test, expect, type Page } from '@playwright/test';
import {
  MATRIX,
  MINUS,
  addLedgerPerson,
  addTripExpense,
  createCategory,
  createPersonalEntry,
  createTrip,
  currentMonth,
  editTripExpense,
  getCategories,
  getDirectLedger,
  getPersonalList,
  getWallets,
  monthBounds,
  saveShot,
  setupDaLatScenario,
  todayIso,
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

for (const variant of MATRIX) {
  test.describe(`${variant.lang}-${variant.size}`, () => {
    test('G-16: open dinner row sheet — set category, tag #dalat, wallet Tiền mặt, and move history & balances', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g16');
      try {
        const cats = await getCategories(ctx.nhan);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
        // Seed tag "dalat" through a real personal entry so GroupRowSheet resolves its tagId.
        await createPersonalEntry(ctx.nhan, {
          type: 'expense',
          walletId: ctx.wallets.tcb.id,
          categoryId: foodCat.id,
          amount: 10_000,
          date: todayIso(),
          note: 'Gửi xe',
          tags: ['dalat'],
        });

        const { expenseId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Ăn tối',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/transactions');
        await ctx.nhan.getByTestId(`tx-row-g-${expenseId}`).click();
        const sheet = ctx.nhan.getByTestId('group-row-sheet');
        await expect(sheet).toBeVisible();

        await sheet.getByTestId('group-row-field-category').click();
        await pickCategoryInPicker(ctx.nhan, foodCat.id);
        await expect(sheet.getByTestId('group-row-field-category')).toContainText('Ăn uống');

        await sheet.getByTestId('group-row-field-tags').click();
        const tagInput = sheet.getByTestId('tag-input-field');
        await tagInput.fill('dalat');
        await tagInput.press('Enter');
        await expect(sheet.getByTestId('group-row-field-tags')).toContainText('#dalat');

        await sheet.getByTestId('group-row-field-wallet').click();
        await Promise.all([
          ctx.nhan.waitForResponse(
            (res) => res.url().includes('/api/me/personal/group-links/') && res.request().method() === 'PUT' && res.ok(),
          ),
          sheet.getByTestId(`group-row-wallet-option-${ctx.wallets.cash.id}`).click(),
        ]);
        await expect(sheet.getByTestId('group-row-field-wallet')).toContainText('Tiền mặt');

        await saveShot(ctx.nhan, testInfo, 'G-16', variant);
        await ctx.nhan.keyboard.press('Escape');

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        const cash = wallets.find((w) => w.id === ctx.wallets.cash.id)!;
        // Techcombank: 1.000.000 − 10.000 (parking entry), dinner moved off it.
        expect(tcb.balance).toBe(990_000);
        // Tiền mặt: 500.000 − 300.000.
        expect(cash.balance).toBe(200_000);

        await ctx.nhan.goto(`/wallets/${ctx.wallets.cash.id}`);
        await expect(ctx.nhan.getByTestId(`tx-row-g-${expenseId}`)).toBeVisible();
        await ctx.nhan.goto(`/wallets/${ctx.wallets.tcb.id}`);
        await expect(ctx.nhan.getByTestId(`tx-row-g-${expenseId}`)).toHaveCount(0);
      } finally {
        await ctx.close();
      }
    });

    test('G-17: Minh edits the dinner amount — Nhan category, tag, and wallet survive', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g17');
      try {
        const cats = await getCategories(ctx.nhan);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
        await createPersonalEntry(ctx.nhan, {
          type: 'expense',
          walletId: ctx.wallets.tcb.id,
          categoryId: foodCat.id,
          amount: 10_000,
          date: todayIso(),
          note: 'Gửi xe',
          tags: ['dalat'],
        });
        const tagsRes = await ctx.nhan.request.get('/api/me/personal/tags');
        const { tags } = (await tagsRes.json()) as { tags: Array<{ id: string; name: string }> };
        const dalatTag = tags.find((t) => t.name === 'dalat')!;

        const { expenseId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Ăn tối',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });
        await updateGroupLink(ctx.nhan, expenseId, {
          categoryId: foodCat.id,
          walletId: ctx.wallets.cash.id,
          tagIds: [dalatTag.id],
        });

        const { expenseId: editedId } = await editTripExpense(ctx.minh, ctx.tripId, expenseId, {
          description: 'Ăn tối',
          amount: 360_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/transactions');
        const row = ctx.nhan.getByTestId(`tx-row-g-${editedId}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText(`${MINUS}120.000₫`);
        await row.click();

        const sheet = ctx.nhan.getByTestId('group-row-sheet');
        await expect(sheet).toBeVisible();
        await expect(sheet.getByTestId('group-row-field-category')).toContainText('Ăn uống');
        await expect(sheet.getByTestId('group-row-field-wallet')).toContainText('Tiền mặt');
        await expect(sheet.getByTestId('group-row-field-tags')).toContainText('#dalat');

        await saveShot(ctx.nhan, testInfo, 'G-17', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-18: "Xem trong nhóm" opens the expense in Đà Lạt, and sheet has no amount field', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g18');
      try {
        const { expenseId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Ăn tối',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/transactions');
        await ctx.nhan.getByTestId(`tx-row-g-${expenseId}`).click();
        const sheet = ctx.nhan.getByTestId('group-row-sheet');
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('input[inputmode="numeric"]')).toHaveCount(0);
        await expect(
          sheet.getByText(
            variant.lang === 'vi'
              ? 'Số tiền và người chia chỉ sửa được trong nhóm.'
              : 'Amount and people are edited in the group.',
          ),
        ).toBeVisible();

        await sheet.getByTestId('group-row-open-in-group').click();
        await expect(ctx.nhan).toHaveURL(new RegExp(`/t/${ctx.tripId}(/expenses/${expenseId}|\\?expense=${expenseId})`));
        await expect(ctx.nhan.getByText('Ăn tối').first()).toBeVisible();

        await saveShot(ctx.nhan, testInfo, 'G-18', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-19: settings default group category "Du lịch" applies to unset rows while custom row keeps "Ăn uống"', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g19');
      try {
        const cats = await getCategories(ctx.nhan);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
        const travelCat = await createCategory(ctx.nhan, { name: 'Du lịch', type: 'expense', icon: 'plane' });

        const { expenseId: taxiId } = await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Taxi',
          amount: 240_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });
        const { expenseId: dinnerId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Ăn tối',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });
        await updateGroupLink(ctx.nhan, dinnerId, { categoryId: foodCat.id });

        await ctx.nhan.goto('/trips');
        await ctx.nhan.getByTestId('personal-settings-btn').click();
        await ctx.nhan.getByTestId('personal-settings-group-category').click();
        await Promise.all([
          ctx.nhan.waitForResponse(
            (res) => res.url().includes('/api/me/personal/group-settings') && res.request().method() === 'PUT' && res.ok(),
          ),
          pickCategoryInPicker(ctx.nhan, travelCat.id),
        ]);
        await expect(ctx.nhan.getByTestId('personal-settings-group-category-value')).toHaveText('Du lịch');

        await ctx.nhan.goto('/transactions');
        await ctx.nhan.getByTestId('tx-view-toggle').click();

        const travelGroup = ctx.nhan.getByTestId(`tx-group-cat:${travelCat.id}`);
        const foodGroup = ctx.nhan.getByTestId(`tx-group-cat:${foodCat.id}`);
        await expect(travelGroup).toBeVisible();
        await expect(travelGroup.getByTestId(`tx-row-g-${taxiId}`)).toBeVisible();
        await expect(foodGroup).toBeVisible();
        await expect(foodGroup.getByTestId(`tx-row-g-${dinnerId}`)).toBeVisible();

        await saveShot(ctx.nhan, testInfo, 'G-19', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-20: filter by group Đà Lạt, hide group items, search "Đà Lạt", and remove pills', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g20');
      try {
        const trip2 = await createTrip(ctx.nhan, {
          name: 'Hà Nội',
          preset: 'trip',
          defaultLang: variant.lang,
          people: ['Lan'],
        });
        const cats = await getCategories(ctx.nhan);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

        const { expenseId: daLatRowId } = await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Taxi',
          amount: 240_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });
        const { expenseId: haNoiRowId } = await addTripExpense(ctx.nhan, trip2.tripId, {
          description: 'Phở Hà Nội',
          amount: 100_000,
          spentOn: todayIso(),
          payerId: trip2.myPid,
          mode: 'equal',
          entries: [trip2.myPid, trip2.pidByName('Lan')].map((participantId) => ({ participantId, value: 1 })),
        });
        const personal = await createPersonalEntry(ctx.nhan, {
          type: 'expense',
          walletId: ctx.wallets.tcb.id,
          categoryId: foodCat.id,
          amount: 50_000,
          date: todayIso(),
          note: 'Mua sách',
        });

        await ctx.nhan.goto('/transactions');
        await expect(ctx.nhan.getByTestId(`tx-row-g-${daLatRowId}`)).toBeVisible();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${haNoiRowId}`)).toBeVisible();
        await expect(ctx.nhan.getByTestId(`tx-row-${personal.id}`)).toBeVisible();

        // 1. Filter by Nhóm: Đà Lạt
        await ctx.nhan.getByTestId('tx-filter-btn').click();
        await ctx.nhan.getByTestId('tx-filter-row-trip').click();
        await ctx.nhan.getByTestId(`tx-filter-trip-${ctx.tripId}`).click();
        await ctx.nhan.getByTestId('tx-filter-apply').click();

        await expect(ctx.nhan.getByTestId('tx-filter-pill-tripId')).toContainText('Đà Lạt');
        await expect(ctx.nhan.getByTestId(`tx-row-g-${daLatRowId}`)).toBeVisible();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${haNoiRowId}`)).toHaveCount(0);
        await expect(ctx.nhan.getByTestId(`tx-row-${personal.id}`)).toHaveCount(0);

        await ctx.nhan.getByTestId('tx-filter-pill-tripId').click();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${haNoiRowId}`)).toBeVisible();

        // 2. Toggle "Hiện khoản từ nhóm" off
        await ctx.nhan.getByTestId('tx-filter-btn').click();
        await ctx.nhan.getByTestId('tx-filter-show-groups').click();
        await ctx.nhan.getByTestId('tx-filter-apply').click();

        await expect(ctx.nhan.getByTestId('tx-filter-pill-groups')).toBeVisible();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${daLatRowId}`)).toHaveCount(0);
        await expect(ctx.nhan.getByTestId(`tx-row-g-${haNoiRowId}`)).toHaveCount(0);
        await expect(ctx.nhan.getByTestId(`tx-row-${personal.id}`)).toBeVisible();

        await ctx.nhan.getByTestId('tx-filter-pill-groups').click();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${daLatRowId}`)).toBeVisible();

        // 3. Search "Đà Lạt" (within this month range so MonthBlock searches the group copy)
        const { from, to } = monthBounds(currentMonth());
        await ctx.nhan.goto(`/transactions?from=${from}&to=${to}`);
        await ctx.nhan.getByTestId('tx-filter-search').fill('Đà Lạt');
        await ctx.nhan.getByTestId('tx-search-submit').click();

        await expect(ctx.nhan.getByTestId(`tx-row-g-${daLatRowId}`)).toBeVisible();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${haNoiRowId}`)).toHaveCount(0);

        await saveShot(ctx.nhan, testInfo, 'G-20', variant);

        await ctx.nhan.getByTestId('tx-clear-all').click();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${haNoiRowId}`)).toBeVisible();
      } finally {
        await ctx.close();
      }
    });

    test('G-21: count loans setting on includes loan in month totals, off again restores them', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g21');
      try {
        const ledger = await getDirectLedger(ctx.nhan);
        const directMinhPid = await addLedgerPerson(ctx.nhan, 'Minh');
        const { expenseId: loanId } = await addTripExpense(ctx.nhan, ledger.tripId, {
          description: 'Cho Minh vay',
          amount: 200_000,
          spentOn: todayIso(),
          payerId: ledger.ownerPid,
          mode: 'equal',
          entries: [{ participantId: directMinhPid, value: 1 }],
        });
        await updateGroupLink(ctx.nhan, loanId, { intent: 'loan' });

        const before = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        expect(before.totals.find((t) => t.currency === 'VND')?.spent ?? 0).toBe(0);

        await ctx.nhan.goto('/trips');
        await ctx.nhan.getByTestId('personal-settings-btn').click();
        const toggle = ctx.nhan.getByTestId('personal-settings-count-loans');
        await expect(toggle).toHaveAttribute('aria-checked', 'false');
        await Promise.all([
          ctx.nhan.waitForResponse(
            (res) => res.url().includes('/api/me/personal/group-settings') && res.request().method() === 'PUT' && res.ok(),
          ),
          toggle.click(),
        ]);
        await expect(toggle).toHaveAttribute('aria-checked', 'true');

        const withLoans = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        expect(withLoans.totals.find((t) => t.currency === 'VND')?.spent).toBe(200_000);

        await saveShot(ctx.nhan, testInfo, 'G-21', variant);

        await Promise.all([
          ctx.nhan.waitForResponse(
            (res) => res.url().includes('/api/me/personal/group-settings') && res.request().method() === 'PUT' && res.ok(),
          ),
          toggle.click(),
        ]);
        await expect(toggle).toHaveAttribute('aria-checked', 'false');

        const afterOff = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        expect(afterOff.totals.find((t) => t.currency === 'VND')?.spent ?? 0).toBe(0);
      } finally {
        await ctx.close();
      }
    });

    test('G-22: default wallet switched to USD — group rows stay on VND wallet and sheet lists VND wallets only', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g22');
      try {
        const setDefaultRes = await ctx.nhan.request.patch(`/api/me/personal/wallets/${ctx.wallets.usd.id}`, {
          data: { isDefault: true },
        });
        expect(setDefaultRes.ok()).toBe(true);

        const { expenseId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Ăn tối',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        const usd = wallets.find((w) => w.id === ctx.wallets.usd.id)!;
        expect(tcb.balance).toBe(700_000);
        expect(usd.balance).toBe(10_000);

        await ctx.nhan.goto('/transactions');
        await ctx.nhan.getByTestId(`tx-row-g-${expenseId}`).click();
        const sheet = ctx.nhan.getByTestId('group-row-sheet');
        await expect(sheet).toBeVisible();
        await sheet.getByTestId('group-row-field-wallet').click();

        const picker = sheet.getByTestId('group-row-wallet-picker');
        await expect(picker).toBeVisible();
        await expect(picker.getByTestId(`group-row-wallet-option-${ctx.wallets.tcb.id}`)).toBeVisible();
        await expect(picker.getByTestId(`group-row-wallet-option-${ctx.wallets.cash.id}`)).toBeVisible();
        await expect(picker.getByTestId(`group-row-wallet-option-${ctx.wallets.usd.id}`)).toHaveCount(0);

        await saveShot(ctx.nhan, testInfo, 'G-22', variant);
      } finally {
        await ctx.close();
      }
    });
  });
}
