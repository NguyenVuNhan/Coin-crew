import { test, expect } from '@playwright/test';
import {
  MATRIX,
  MINUS,
  addFundIncome,
  addLedgerPerson,
  addTripExpense,
  beforeStartDate,
  createActorContext,
  createPersonalEntry,
  createTrip,
  currentMonth,
  firstOfLastMonth,
  getCategories,
  getDirectLedger,
  getPersonalList,
  getWallets,
  recordPayment,
  saveShot,
  setupDaLatScenario,
  setupNhanBook,
  signIn,
  todayIso,
} from './group-shares-helpers';

for (const variant of MATRIX) {
  test.describe(`${variant.lang}-${variant.size}`, () => {
    test('G-01: someone else pays in a trip — shows your share, wallet unchanged, spending increases', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g01');
      try {
        const { expenseId } = await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Taxi',
          amount: 240_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/transactions');
        const row = ctx.nhan.getByTestId(`tx-row-g-${expenseId}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Taxi');
        await expect(row).toContainText('Đà Lạt');
        await expect(row).toContainText(variant.lang === 'vi' ? 'Hùng trả' : 'Hùng paid');
        await expect(row).toContainText(`${MINUS}80.000₫`);
        await expect(row).toContainText(variant.lang === 'vi' ? 'phần của bạn' : 'your share');

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        expect(tcb.balance).toBe(1_000_000);

        const list = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        const vndTotal = list.totals.find((t) => t.currency === 'VND');
        expect(vndTotal?.spent).toBe(80_000);

        await saveShot(ctx.nhan, testInfo, 'G-01', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-02: Nhan pays a 300k dinner split three ways — share counted, wallet −300k, people owe +200k', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g02');
      try {
        const { expenseId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Ăn tối',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/trips');
        const recentRow = ctx.nhan.getByTestId('book-recent').getByTestId(`tx-row-g-${expenseId}`);
        await expect(recentRow).toBeVisible();
        await expect(recentRow).toContainText(`${MINUS}100.000₫`);
        await expect(recentRow).toContainText(
          variant.lang === 'vi'
            ? 'Bạn trả 300.000₫ · 200.000₫ mọi người nợ bạn'
            : 'You paid 300.000₫ · 200.000₫ owed to you',
        );

        const peopleRow = ctx.nhan.getByTestId('book-people-row');
        await expect(peopleRow).toContainText('200.000₫');

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        expect(tcb.balance).toBe(700_000);

        await saveShot(ctx.nhan, testInfo, 'G-02', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-03: Nhan pays 150k for Minh + Lan only — neutral row, no spending, wallet −150k', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g03');
      try {
        const { expenseId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Vé cáp treo',
          amount: 150_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.minhPid, ctx.lanPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/transactions');
        const row = ctx.nhan.getByTestId(`tx-row-g-${expenseId}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Vé cáp treo');
        await expect(row).toContainText(`${MINUS}150.000₫`);
        await expect(row).not.toContainText(variant.lang === 'vi' ? 'phần của bạn' : 'your share');

        const list = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        const vndTotal = list.totals.find((t) => t.currency === 'VND');
        expect(vndTotal?.spent ?? 0).toBe(0);

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        expect(tcb.balance).toBe(850_000);

        await saveShot(ctx.nhan, testInfo, 'G-03', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-04: expense among other people only (trip and quick expense) never appears anywhere in Sổ chi tiêu', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g04');
      try {
        const { expenseId: tripOnlyId } = await addTripExpense(ctx.minh, ctx.tripId, {
          description: 'Cà phê nhóm riêng',
          amount: 90_000,
          spentOn: todayIso(),
          payerId: ctx.minhPid,
          mode: 'equal',
          entries: [ctx.minhPid, ctx.lanPid].map((participantId) => ({ participantId, value: 1 })),
        });

        const ledger = await getDirectLedger(ctx.nhan);
        const directMinhPid = await addLedgerPerson(ctx.nhan, 'Minh');
        const directLanPid = await addLedgerPerson(ctx.nhan, 'Lan');
        const { expenseId: quickOnlyId } = await addTripExpense(ctx.nhan, ledger.tripId, {
          description: 'Cà phê nhanh riêng',
          amount: 90_000,
          spentOn: todayIso(),
          payerId: directMinhPid,
          mode: 'equal',
          entries: [directMinhPid, directLanPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/trips');
        await expect(ctx.nhan.getByTestId('book-recent')).toBeVisible();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${tripOnlyId}`)).toHaveCount(0);
        await expect(ctx.nhan.getByTestId(`tx-row-g-${quickOnlyId}`)).toHaveCount(0);
        await expect(ctx.nhan.getByText('Cà phê nhóm riêng')).toHaveCount(0);
        await expect(ctx.nhan.getByText('Cà phê nhanh riêng')).toHaveCount(0);

        await ctx.nhan.goto('/transactions');
        await expect(ctx.nhan.getByTestId(`tx-row-g-${tripOnlyId}`)).toHaveCount(0);
        await expect(ctx.nhan.getByTestId(`tx-row-g-${quickOnlyId}`)).toHaveCount(0);

        await ctx.nhan.goto(`/wallets/${ctx.wallets.tcb.id}`);
        await expect(ctx.nhan.getByTestId('wallet-summary')).toBeVisible();
        await expect(ctx.nhan.getByText('Cà phê nhóm riêng')).toHaveCount(0);
        await expect(ctx.nhan.getByText('Cà phê nhanh riêng')).toHaveCount(0);

        const searched = await getPersonalList(ctx.nhan, {
          month: currentMonth(),
          groups: 'show',
          q: 'Cà phê',
        });
        expect(searched.rows).toHaveLength(0);
        expect(searched.groupRows ?? []).toHaveLength(0);

        await saveShot(ctx.nhan, testInfo, 'G-04', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-05: Minh pays Nhan back 200k and Nhan confirms — neutral +200k, not income, wallet +200k', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g05');
      try {
        await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Ăn tối',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.minhPid, ctx.hungPid].map((participantId) => ({ participantId, value: 1 })),
        });

        // A member who records their own payment to a member is confirmed at once (statusForNewPayment).
        const { paymentId, status } = await recordPayment(ctx.minh, ctx.tripId, {
          fromId: ctx.minhPid,
          toId: ctx.nhanPid,
          amount: 200_000,
        });
        expect(status).toBe('confirmed');

        await ctx.nhan.goto('/transactions');
        const payRow = ctx.nhan.getByTestId(`tx-row-g-${paymentId}`);
        await expect(payRow).toBeVisible();
        await expect(payRow).toContainText(variant.lang === 'vi' ? 'Minh trả bạn' : 'Minh paid you');
        await expect(payRow).toContainText(variant.lang === 'vi' ? 'Thanh toán' : 'Payment');
        await expect(payRow).toContainText('+200.000₫');

        const list = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        const vndTotal = list.totals.find((t) => t.currency === 'VND');
        expect(vndTotal?.income ?? 0).toBe(0);

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        expect(tcb.balance).toBe(900_000);

        await saveShot(ctx.nhan, testInfo, 'G-05', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-06: Nhan pays Hùng 80k via VietQR flow and Hùng confirms — neutral −80k, not spending', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g06', {
        hungBank: { bin: '970407', accountNumber: '19031234565678', holderName: 'Nguyen Van Hung' },
      });
      try {
        await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Taxi',
          amount: 240_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto(`/t/${ctx.tripId}/pay/${ctx.hungPid}`);
        await expect(ctx.nhan.getByRole('img', { name: /80\.000₫/ })).toBeVisible();
        await ctx.nhan.getByRole('button', { name: variant.lang === 'vi' ? 'Tôi đã trả' : "I've paid" }).click();
        await expect(
          ctx.nhan.getByText(variant.lang === 'vi' ? /80\.000₫/ : /80\.000₫/).first(),
        ).toBeVisible();

        const viewRes = await ctx.hung.request.get(`/api/trips/${ctx.tripId}`);
        const view = (await viewRes.json()) as {
          payments: Array<{ id: string; status: string; fromId: string; toId: string }>;
        };
        // Nhan is a member, so "I've paid" is confirmed at once; Hùng has nothing left to confirm.
        const paid = view.payments.find((p) => p.fromId === ctx.nhanPid && p.toId === ctx.hungPid);
        expect(paid?.status).toBe('confirmed');

        await ctx.nhan.goto('/transactions');
        const payRow = ctx.nhan.getByTestId(`tx-row-g-${paid!.id}`);
        await expect(payRow).toBeVisible();
        await expect(payRow).toContainText(variant.lang === 'vi' ? 'Bạn trả Hùng' : 'You paid Hùng');
        await expect(payRow).toContainText(`${MINUS}80.000₫`);

        const list = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        const vndTotal = list.totals.find((t) => t.currency === 'VND');
        expect(vndTotal?.spent).toBe(80_000);

        await saveShot(ctx.nhan, testInfo, 'G-06', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-07: sport group with fund — contribution counted as spending, fund-paid court never appears', async ({ browser }, testInfo) => {
      const suffix = `g07-${variant.lang}-${variant.size}`;
      const nhanContext = await createActorContext(browser, variant);
      const nhan = await nhanContext.newPage();
      try {
        await signIn(nhan, { sub: `e2e-gs-${suffix}-nhan`, name: 'Nhan' });
        await setupNhanBook(nhan);

        const sport = await createTrip(nhan, {
          name: 'Cầu lông T5',
          preset: 'sport',
          defaultLang: variant.lang,
          myGender: 'M',
          people: [{ name: 'Lan', gender: 'F' }],
        });

        const { incomeId } = await addFundIncome(nhan, sport.tripId, {
          description: 'Đóng quỹ T5',
          amount: 500_000,
          spentOn: todayIso(),
        });

        const { expenseId: courtId } = await addTripExpense(nhan, sport.tripId, {
          description: 'Tiền sân T5',
          amount: 400_000,
          spentOn: todayIso(),
          payerId: sport.myPid,
          mode: 'equal',
          entries: [],
          meta: { paidFromFund: true },
        });

        await nhan.goto('/transactions');
        const fundRow = nhan.getByTestId(`tx-row-g-${incomeId}`);
        await expect(fundRow).toBeVisible();
        await expect(fundRow).toContainText(variant.lang === 'vi' ? 'Vào quỹ nhóm' : 'Into the group fund');
        await expect(fundRow).toContainText(`${MINUS}500.000₫`);
        await expect(nhan.getByTestId(`tx-row-g-${courtId}`)).toHaveCount(0);
        await expect(nhan.getByText('Tiền sân T5')).toHaveCount(0);

        const list = await getPersonalList(nhan, { month: currentMonth(), groups: 'show' });
        const vndTotal = list.totals.find((t) => t.currency === 'VND');
        expect(vndTotal?.spent).toBe(500_000);

        await saveShot(nhan, testInfo, 'G-07', variant);
      } finally {
        await nhanContext.close();
      }
    });

    test('G-08: planning session in sport group is not shown in Sổ chi tiêu', async ({ browser }, testInfo) => {
      const suffix = `g08-${variant.lang}-${variant.size}`;
      const nhanContext = await createActorContext(browser, variant);
      const nhan = await nhanContext.newPage();
      try {
        await signIn(nhan, { sub: `e2e-gs-${suffix}-nhan`, name: 'Nhan' });
        await setupNhanBook(nhan);

        const sport = await createTrip(nhan, {
          name: 'Cầu lông T5',
          preset: 'sport',
          defaultLang: variant.lang,
          myGender: 'M',
          people: [{ name: 'Lan', gender: 'F' }],
        });

        const { expenseId: planId } = await addTripExpense(nhan, sport.tripId, {
          description: 'Kèo T5 tuần sau',
          amount: 0,
          spentOn: todayIso(),
          payerId: sport.myPid,
          mode: 'amounts',
          entries: [{ participantId: sport.myPid, value: 0 }],
          meta: {
            sport: {
              planning: true,
              court: 200_000,
              extra: 0,
              shuttlecocks: [],
              rule: { kind: 'equal' },
              entries: [{ participantId: sport.myPid, maleSlots: 1, femaleSlots: 0 }],
            },
          },
        });

        await nhan.goto('/transactions');
        await expect(nhan.getByTestId(`tx-row-g-${planId}`)).toHaveCount(0);
        await expect(nhan.getByText('Kèo T5 tuần sau')).toHaveCount(0);

        await saveShot(nhan, testInfo, 'G-08', variant);
      } finally {
        await nhanContext.close();
      }
    });

    test('G-09: trip expense dated before Techcombank start date is listed and counts toward balance', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g09');
      try {
        const oldDate = beforeStartDate();
        const oldMonth = oldDate.slice(0, 7);
        const { expenseId } = await addTripExpense(ctx.nhan, ctx.tripId, {
          description: 'Vé xe cũ',
          amount: 300_000,
          spentOn: oldDate,
          payerId: ctx.nhanPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto(`/transactions?month=${oldMonth}`);
        const row = ctx.nhan.getByTestId(`tx-row-g-${expenseId}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Vé xe cũ');

        const wallets = await getWallets(ctx.nhan);
        const tcb = wallets.find((w) => w.id === ctx.wallets.tcb.id)!;
        expect(tcb.balance).toBe(700_000);

        await saveShot(ctx.nhan, testInfo, 'G-09', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-10: main screen with book on drops quick-expense lists, interleaves recent rows, All opens /transactions', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g10');
      try {
        const cats = await getCategories(ctx.nhan);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
        const personal = await createPersonalEntry(ctx.nhan, {
          type: 'expense',
          walletId: ctx.wallets.tcb.id,
          categoryId: foodCat.id,
          amount: 45_000,
          date: todayIso(),
          note: 'Cà phê sáng',
        });
        const { expenseId: groupId } = await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Taxi',
          amount: 240_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/trips');
        const recent = ctx.nhan.getByTestId('book-recent');
        await expect(recent).toBeVisible();
        await expect(recent.getByTestId(`tx-row-${personal.id}`)).toBeVisible();
        await expect(recent.getByTestId(`tx-row-g-${groupId}`)).toBeVisible();

        await expect(ctx.nhan.locator('.fsl-expense-list')).toHaveCount(0);
        await expect(ctx.nhan.locator('.fsl-payments')).toHaveCount(0);
        await expect(ctx.nhan.getByText(variant.lang === 'vi' ? 'Khoản chi của bạn' : 'Your expenses')).toHaveCount(0);
        await expect(
          ctx.nhan.getByText(variant.lang === 'vi' ? 'Các khoản đã trả của bạn' : 'Your payments'),
        ).toHaveCount(0);

        await saveShot(ctx.nhan, testInfo, 'G-10', variant);

        await ctx.nhan.getByTestId('book-recent-all').click();
        await expect(ctx.nhan).toHaveURL(/\/transactions/);
      } finally {
        await ctx.close();
      }
    });

    test('G-28: Giao dịch gần đây puts the newest activity on top — a payment just made, then an entry just added for last month', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g28');
      try {
        const { expenseId: taxiId } = await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Taxi',
          amount: 240_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });
        const cats = await getCategories(ctx.nhan);
        const foodCat = cats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
        const lastMonth = await createPersonalEntry(ctx.nhan, {
          type: 'expense',
          walletId: ctx.wallets.tcb.id,
          categoryId: foodCat.id,
          amount: 30_000,
          date: firstOfLastMonth(),
          note: 'Quên ghi tháng trước',
        });

        const recentIds = async () => {
          await ctx.nhan.goto('/trips');
          const recent = ctx.nhan.getByTestId('book-recent');
          await expect(recent.getByTestId(`tx-row-g-${taxiId}`)).toBeVisible();
          return recent
            .locator('[data-testid^="tx-row-"]')
            .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
        };

        expect((await recentIds()).slice(0, 2)).toEqual([`tx-row-${lastMonth.id}`, `tx-row-g-${taxiId}`]);

        const { paymentId } = await recordPayment(ctx.minh, ctx.tripId, {
          fromId: ctx.minhPid,
          toId: ctx.nhanPid,
          amount: 50_000,
        });
        expect((await recentIds()).slice(0, 3)).toEqual([
          `tx-row-g-${paymentId}`,
          `tx-row-${lastMonth.id}`,
          `tx-row-g-${taxiId}`,
        ]);

        await saveShot(ctx.nhan, testInfo, 'G-28', variant);
      } finally {
        await ctx.close();
      }
    });
  });
}
