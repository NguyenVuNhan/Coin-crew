import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  MATRIX,
  MINUS,
  addLedgerPerson,
  addTripExpense,
  createActorContext,
  createPersonalEntry,
  currentMonth,
  directView,
  getCategories,
  getDirectLedger,
  getPersonalList,
  getWallets,
  openEntry,
  pickPeople,
  recordPayment,
  saveShot,
  setupDaLatScenario,
  setupNhanBook,
  signIn,
  todayIso,
  typeAmount,
  type NhanWallets,
  type Variant,
} from './group-shares-helpers';

async function setupBookUser(
  browser: Browser,
  variant: Variant,
  idPrefix: string,
): Promise<{ context: BrowserContext; page: Page; wallets: NhanWallets; close: () => Promise<void> }> {
  const suffix = `${idPrefix}-${variant.lang}-${variant.size}`;
  const context = await createActorContext(browser, variant);
  const page = await context.newPage();
  await signIn(page, { sub: `e2e-ep-${suffix}-nhan`, name: 'Nhan' });
  const wallets = await setupNhanBook(page);
  return {
    context,
    page,
    wallets,
    close: () => context.close(),
  };
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

/** Desktop shows the details rows open; a phone folds them into one line. */
async function openDetailsIfFolded(page: import('@playwright/test').Page): Promise<void> {
  const fold = page.getByTestId('entry-fold-details');
  if ((await fold.count()) > 0 && (await page.getByTestId('entry-wallet-row').count()) === 0) {
    await fold.click();
  }
}

for (const variant of MATRIX) {
  test.describe(`${variant.lang}-${variant.size}`, () => {
    test('E-01: Solo 45k coffee at the usual time, guess right', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e01');
      try {
        const cats = await getCategories(user.page);
        // A starter that is not the first tile, so only the guess can pick it.
        const coffeeCat = cats.find((c) => c.type === 'expense' && c.name === 'Mua sắm')!;
        expect(coffeeCat).toBeDefined();

        // Seed two 45k coffee entries in the current time/amount band so the category guess triggers.
        await createPersonalEntry(user.page, {
          type: 'expense',
          walletId: user.wallets.tcb.id,
          categoryId: coffeeCat.id,
          amount: 45_000,
          date: todayIso(),
          note: 'Cà phê sáng 1',
        });
        await createPersonalEntry(user.page, {
          type: 'expense',
          walletId: user.wallets.tcb.id,
          categoryId: coffeeCat.id,
          amount: 45_000,
          date: todayIso(),
          note: 'Cà phê sáng 2',
        });

        await user.page.goto('/trips');
        await openEntry(user.page);
        await typeAmount(user.page, variant, '45000');

        const coffeeTile = user.page.getByTestId(`category-tile-${coffeeCat.id}`);
        await expect(coffeeTile).toBeVisible();
        await expect(coffeeTile).toHaveAttribute('data-guess', 'true');
        await expect(coffeeTile).toHaveAttribute('aria-pressed', 'true');

        // Taps after amount (phone): (1) key-done, (2) entry-save-btn -> 2 taps.
        const [saveRes] = await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/transactions') &&
              res.request().method() === 'POST' &&
              res.ok(),
          ),
          user.page.getByTestId('entry-save-btn').click(),
        ]);
        expect(saveRes.ok()).toBe(true);

        const list = await getPersonalList(user.page, { month: currentMonth() });
        expect(list.rows.length).toBeGreaterThanOrEqual(3);

        await saveShot(user.page, testInfo, 'E-01', variant);
      } finally {
        await user.close();
      }
    });

    test('E-02: Chi 50k, Minh', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'e02');
      try {
        const ledger = await getDirectLedger(ctx.nhan);
        const minhPid = await addLedgerPerson(ctx.nhan, 'Minh');
        const cats = await getCategories(ctx.nhan);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
        expect(foodCat).toBeDefined();

        await openEntry(ctx.nhan);
        await typeAmount(ctx.nhan, variant, '50000');
        await pickCategoryInPicker(ctx.nhan, foodCat.id);
        await pickPeople(ctx.nhan, ['Minh']);

        // Taps after amount (phone): (1) key-done, (2) category, (3) Minh, (4) entry-save-btn -> 4 taps.
        await Promise.all([
          ctx.nhan.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          ctx.nhan.getByTestId('entry-save-btn').click(),
        ]);

        const view = await directView(ctx.nhan);
        expect(view.expenses).toHaveLength(1);
        const exp = view.expenses[0]!;
        expect(exp.amount).toBe(50_000);
        expect(exp.payerId).toBe(ledger.ownerPid);
        expect(exp.shares).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ participantId: ledger.ownerPid, amount: 25_000 }),
            expect.objectContaining({ participantId: minhPid, amount: 25_000 }),
          ]),
        );
        expect(view.balances[ledger.ownerPid]).toBe(25_000);
        expect(view.balances[minhPid]).toBe(-25_000);

        const list = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        const groupRow = list.groupRows?.find((r) => r.rootId === exp.id);
        expect(groupRow?.myShare).toBe(25_000);
        expect(groupRow?.link?.intent).toBe('shared');
        expect(groupRow?.link?.categoryId).toBe(foodCat.id);

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        expect(tcb.balance).toBe(950_000);

        await ctx.nhan.goto('/transactions');
        const txRow = ctx.nhan.getByTestId(`tx-row-g-${exp.id}`);
        await expect(txRow).toBeVisible();
        await expect(txRow).toContainText(`${MINUS}25.000₫`);
        await expect(txRow).toContainText(variant.lang === 'vi' ? 'phần của bạn' : 'your share');

        await ctx.nhan.goto(`/t/${ledger.tripId}`);
        await expect(ctx.nhan.getByText('Ăn uống').first()).toBeVisible();

        await saveShot(ctx.nhan, testInfo, 'E-02', variant);
      } finally {
        await ctx.close();
      }
    });

    test('E-03: Chi 50k, Minh, hides outcome box and saves shared expense', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e03');
      try {
        const ledger = await getDirectLedger(user.page);
        await addLedgerPerson(user.page, 'Minh');
        const cats = await getCategories(user.page);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

        await openEntry(user.page);
        await typeAmount(user.page, variant, '50000');
        await pickCategoryInPicker(user.page, foodCat.id);
        await pickPeople(user.page, ['Minh']);

        await expect(user.page.getByTestId('entry-split-fold')).toBeVisible();
        await expect(user.page.getByTestId('entry-outcome')).toHaveCount(0);

        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          user.page.getByTestId('entry-save-btn').click(),
        ]);

        const view = await directView(user.page);
        expect(view.expenses[0]?.payerId).toBe(ledger.ownerPid);
        expect(view.balances[ledger.ownerPid]).toBe(25_000);

        const wallets = await getWallets(user.page);
        const tcb = wallets.find((w) => w.id === user.wallets.tcb.id)!;
        expect(tcb.balance).toBe(950_000);

        const list = await getPersonalList(user.page, { month: currentMonth(), groups: 'show' });
        expect(list.totals.find((t) => t.currency === 'VND')?.spent).toBe(25_000);

        await saveShot(user.page, testInfo, 'E-03', variant);
      } finally {
        await user.close();
      }
    });

    test('E-04: Vay/Nợ, lent Minh 50k', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e04');
      try {
        const ledger = await getDirectLedger(user.page);
        const minhPid = await addLedgerPerson(user.page, 'Minh');

        await openEntry(user.page, 'loan-debt');
        await typeAmount(user.page, variant, '50000');
        await pickPeople(user.page, ['Minh']);

        // Taps after amount (phone): (1) key-done, (2) Minh, (3) entry-save-btn -> 3 taps.
        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          user.page.getByTestId('entry-save-btn').click(),
        ]);

        const view = await directView(user.page);
        expect(view.balances[ledger.ownerPid]).toBe(50_000);
        expect(view.balances[minhPid]).toBe(-50_000);
        const exp = view.expenses[0]!;

        const list = await getPersonalList(user.page, { month: currentMonth(), groups: 'show' });
        const groupRow = list.groupRows?.find((r) => r.rootId === exp.id);
        expect(groupRow?.link?.intent).toBe('loan');
        expect(groupRow?.link?.categoryId?.endsWith(':lend')).toBe(true);
        expect(list.totals.find((t) => t.currency === 'VND')?.spent ?? 0).toBe(0);

        const wallets = await getWallets(user.page);
        expect(wallets.find((w) => w.id === user.wallets.tcb.id)!.balance).toBe(950_000);

        await user.page.goto('/transactions');
        const txRow = user.page.getByTestId(`tx-row-g-${exp.id}`);
        await expect(txRow).toBeVisible();
        await expect(txRow).toContainText('Cho vay');

        await saveShot(user.page, testInfo, 'E-04', variant);
      } finally {
        await user.close();
      }
    });

    test('E-05: Vay/Nợ, borrowed 50k from Minh', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e05');
      try {
        const ledger = await getDirectLedger(user.page);
        const minhPid = await addLedgerPerson(user.page, 'Minh');

        await openEntry(user.page, 'loan-debt');
        await typeAmount(user.page, variant, '50000');
        await pickPeople(user.page, ['Minh']);
        await user.page.getByTestId('entry-flip').click();

        // Taps after amount (phone): (1) key-done, (2) Minh, (3) flip, (4) entry-save-btn -> 4 taps.
        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          user.page.getByTestId('entry-save-btn').click(),
        ]);

        const view = await directView(user.page);
        expect(view.balances[ledger.ownerPid]).toBe(-50_000);
        expect(view.balances[minhPid]).toBe(50_000);
        const exp = view.expenses[0]!;

        const list = await getPersonalList(user.page, { month: currentMonth(), groups: 'show' });
        const groupRow = list.groupRows?.find((r) => r.rootId === exp.id);
        expect(groupRow?.link?.intent).toBe('loan');
        expect(groupRow?.link?.categoryId?.endsWith(':borrow')).toBe(true);
        expect(list.totals.find((t) => t.currency === 'VND')?.income ?? 0).toBe(0);

        const wallets = await getWallets(user.page);
        expect(wallets.find((w) => w.id === user.wallets.tcb.id)!.balance).toBe(1_050_000);

        await saveShot(user.page, testInfo, 'E-05', variant);
      } finally {
        await user.close();
      }
    });

    test('E-06: Lent Minh and Lan 100k', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e06');
      try {
        const minhPid = await addLedgerPerson(user.page, 'Minh');
        const lanPid = await addLedgerPerson(user.page, 'Lan');

        await openEntry(user.page, 'loan-debt');
        await typeAmount(user.page, variant, '100000');
        await pickPeople(user.page, ['Minh', 'Lan']);

        await expect(user.page.getByTestId('entry-outcome')).toContainText(
          variant.lang === 'vi'
            ? 'Minh, Lan mỗi người nợ bạn 50.000₫'
            : 'Minh, Lan each owe you 50.000₫',
        );

        // Taps after amount (phone): (1) key-done, (2) Minh, (3) Lan, (4) entry-save-btn -> 4 taps.
        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          user.page.getByTestId('entry-save-btn').click(),
        ]);

        const view = await directView(user.page);
        expect(view.expenses[0]?.shares).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ participantId: minhPid, amount: 50_000 }),
            expect.objectContaining({ participantId: lanPid, amount: 50_000 }),
          ]),
        );

        await saveShot(user.page, testInfo, 'E-06', variant);
      } finally {
        await user.close();
      }
    });

    test('E-07: 120k with Minh and Lan, exact 20/50/50', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e07');
      try {
        const ledger = await getDirectLedger(user.page);
        const minhPid = await addLedgerPerson(user.page, 'Minh');
        const lanPid = await addLedgerPerson(user.page, 'Lan');
        const cats = await getCategories(user.page);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

        await openEntry(user.page);
        await typeAmount(user.page, variant, '120000');
        await pickCategoryInPicker(user.page, foodCat.id);
        await pickPeople(user.page, ['Minh', 'Lan']);

        await user.page.getByTestId('entry-split-fold').click();
        await user.page
          .getByRole('radio', { name: variant.lang === 'vi' ? 'Theo số tiền' : 'Exact amounts' })
          .click();

        await user.page.getByTestId(`entry-split-input-${ledger.ownerPid}`).fill('20000');
        await user.page.getByTestId(`entry-split-input-${minhPid}`).fill('50000');
        await user.page.getByTestId(`entry-split-input-${lanPid}`).fill('40000');
        await expect(user.page.getByTestId('entry-save-btn')).toBeDisabled();

        await user.page.getByTestId(`entry-split-input-${lanPid}`).fill('50000');
        await expect(user.page.getByTestId('entry-save-btn')).toBeEnabled();

        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          user.page.getByTestId('entry-save-btn').click(),
        ]);

        const view = await directView(user.page);
        expect(view.expenses[0]?.shares).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ participantId: ledger.ownerPid, amount: 20_000 }),
            expect.objectContaining({ participantId: minhPid, amount: 50_000 }),
            expect.objectContaining({ participantId: lanPid, amount: 50_000 }),
          ]),
        );

        await saveShot(user.page, testInfo, 'E-07', variant);
      } finally {
        await user.close();
      }
    });

    test('E-08: Old 50/50 quick expense (created via /t/<direct>/expenses/new first)', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e08');
      try {
        const ledger = await getDirectLedger(user.page);
        const minhPid = await addLedgerPerson(user.page, 'Minh');

        const { expenseId } = await addTripExpense(user.page, ledger.tripId, {
          description: 'Cà phê cũ',
          amount: 50_000,
          spentOn: todayIso(),
          payerId: ledger.ownerPid,
          mode: 'equal',
          entries: [
            { participantId: ledger.ownerPid, value: 1 },
            { participantId: minhPid, value: 1 },
          ],
        });

        const listBefore = await getPersonalList(user.page, { month: currentMonth(), groups: 'show' });
        const rowBefore = listBefore.groupRows?.find((r) => r.rootId === expenseId);
        expect(rowBefore?.myShare).toBe(25_000);
        expect(rowBefore?.link ?? null).toBeNull();

        await user.page.goto('/transactions');
        const txRow = user.page.getByTestId(`tx-row-g-${expenseId}`);
        await expect(txRow).toBeVisible();
        await expect(txRow).toContainText(`${MINUS}25.000₫`);
        await expect(txRow).toContainText(variant.lang === 'vi' ? 'phần của bạn' : 'your share');

        await user.page.goto(`/t/${ledger.tripId}/expenses/${expenseId}/edit`);
        await expect(user.page.getByTestId('split-row-Nhan')).toBeVisible();
        await expect(user.page.getByTestId('split-row-Minh')).toBeVisible();

        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes(`/api/trips/${ledger.tripId}/expenses/${expenseId}`) &&
              res.request().method() === 'PATCH' &&
              res.ok(),
          ),
          user.page
            .getByRole('button', { name: variant.lang === 'vi' ? 'Lưu thay đổi' : 'Save changes' })
            .click(),
        ]);

        const view = await directView(user.page);
        const latest = view.expenses[0]!;
        expect(latest.shares).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ participantId: ledger.ownerPid, amount: 25_000 }),
            expect.objectContaining({ participantId: minhPid, amount: 25_000 }),
          ]),
        );

        const listAfter = await getPersonalList(user.page, { month: currentMonth(), groups: 'show' });
        const rowAfter = listAfter.groupRows?.find((r) => r.rootId === latest.id);
        expect(rowAfter?.link?.intent ?? null).toBeNull();

        await saveShot(user.page, testInfo, 'E-08', variant);
      } finally {
        await user.close();
      }
    });

    test('E-09: Group-only quick-expense page', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e09');
      try {
        const ledger = await getDirectLedger(user.page);
        await addLedgerPerson(user.page, 'Minh');

        await user.page.goto(`/t/${ledger.tripId}/expenses/new`);
        await expect(user.page.getByTestId('split-row-Nhan')).toBeVisible();

        await user.page.getByLabel(variant.lang === 'vi' ? 'Nội dung' : 'What for').fill('Trà đá');
        await user.page.locator('#expense-amount').fill('20000');

        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes(`/api/trips/${ledger.tripId}/expenses`) &&
              res.request().method() === 'POST' &&
              res.ok(),
          ),
          user.page
            .getByRole('button', { name: variant.lang === 'vi' ? 'Thêm khoản chi' : 'Add expense' })
            .click(),
        ]);

        const view = await directView(user.page);
        expect(view.expenses).toHaveLength(1);
        expect(view.expenses[0]?.shares).toEqual([expect.objectContaining({ participantId: ledger.ownerPid, amount: 20_000 })]);

        await saveShot(user.page, testInfo, 'E-09', variant);
      } finally {
        await user.close();
      }
    });

    test('E-10: page.route makes the link PUT 500 once', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e10');
      try {
        await getDirectLedger(user.page);
        const minhPid = await addLedgerPerson(user.page, 'Minh');
        const cats = await getCategories(user.page);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;

        let failedOnce = false;
        await user.page.route('**/api/me/personal/group-links/**', async (route) => {
          if (route.request().method() === 'PUT' && !failedOnce) {
            failedOnce = true;
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Link failed' } }),
            });
            return;
          }
          await route.continue();
        });

        await openEntry(user.page);
        await typeAmount(user.page, variant, '50000');
        await pickCategoryInPicker(user.page, foodCat.id);
        await pickPeople(user.page, ['Minh']);
        await user.page.getByTestId('entry-save-btn').click();

        const retryBtn = user.page.getByRole('button', {
          name: variant.lang === 'vi' ? 'Thử lại' : 'Try again',
        });
        await expect(retryBtn).toBeVisible();

        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          retryBtn.click(),
        ]);

        const view = await directView(user.page);
        expect(view.expenses).toHaveLength(1);

        await saveShot(user.page, testInfo, 'E-10', variant);
      } finally {
        await user.close();
      }
    });

    test('E-11: USD wallet picked on Chi', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e11');
      try {
        await addLedgerPerson(user.page, 'Minh');

        await openEntry(user.page);
        await typeAmount(user.page, variant, '50');
        await expect(user.page.getByTestId('entry-people')).toBeVisible();

        // On a phone the details line shows once a category is picked.
        const food = (await getCategories(user.page)).find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
        await user.page.getByTestId(`category-tile-${food.id}`).click();
        await openDetailsIfFolded(user.page);
        await user.page.getByTestId('entry-wallet-row').click();
        await user.page.getByTestId(`wallet-option-${user.wallets.usd.id}`).click();

        await expect(user.page.getByTestId('entry-people')).toHaveCount(0);

        await user.page.getByTestId('entry-tab-loan-debt').click();
        await openDetailsIfFolded(user.page);
        await user.page.getByTestId('entry-wallet-row').click();

        await expect(user.page.getByTestId(`wallet-option-${user.wallets.tcb.id}`)).toBeVisible();
        await expect(user.page.getByTestId(`wallet-option-${user.wallets.usd.id}`)).toHaveCount(0);

        await saveShot(user.page, testInfo, 'E-11', variant);
      } finally {
        await user.close();
      }
    });

    test('E-12: countLoans on: lend Minh 50k, then Minh pays back 50k', async ({ browser }, testInfo) => {
      const user = await setupBookUser(browser, variant, 'e12');
      try {
        const ledger = await getDirectLedger(user.page);
        const minhPid = await addLedgerPerson(user.page, 'Minh');

        const settingsRes = await user.page.request.put('/api/me/personal/group-settings', {
          data: { countLoans: true },
        });
        expect(settingsRes.ok()).toBe(true);

        await openEntry(user.page, 'loan-debt');
        await typeAmount(user.page, variant, '50000');
        await pickPeople(user.page, ['Minh']);

        // Taps after amount (phone): (1) key-done, (2) Minh, (3) entry-save-btn -> 3 taps.
        await Promise.all([
          user.page.waitForResponse(
            (res) =>
              res.url().includes('/api/me/personal/group-links/') &&
              res.request().method() === 'PUT' &&
              res.ok(),
          ),
          user.page.getByTestId('entry-save-btn').click(),
        ]);

        const afterLend = await getPersonalList(user.page, { month: currentMonth(), groups: 'show' });
        expect(afterLend.totals.find((t) => t.currency === 'VND')?.spent).toBe(50_000);
        expect(afterLend.groupRows?.[0]?.link?.categoryId?.endsWith(':lend')).toBe(true);

        await recordPayment(user.page, ledger.tripId, {
          fromId: minhPid,
          toId: ledger.ownerPid,
          amount: 50_000,
        });

        const afterPayback = await getPersonalList(user.page, { month: currentMonth(), groups: 'show' });
        expect(afterPayback.totals.find((t) => t.currency === 'VND')?.income).toBe(50_000);

        await saveShot(user.page, testInfo, 'E-12', variant);
      } finally {
        await user.close();
      }
    });
  });
}
