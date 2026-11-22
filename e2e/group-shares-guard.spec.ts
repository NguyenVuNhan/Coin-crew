import { test, expect } from '@playwright/test';
import {
  PHONE_VI,
  addTripExpense,
  createActorContext,
  createPersonalEntry,
  createTrip,
  currentMonth,
  getCategories,
  getPersonalList,
  getWallets,
  saveShot,
  setBookEnabled,
  setupDaLatScenario,
  setupNhanBook,
  signIn,
  todayIso,
  updateGroupLink,
} from './group-shares-helpers';

test.describe('vi-phone', () => {
  test('G-23: Hùng (book off) opens Home and the trip — no request contains groups=show, Home unchanged', async ({ browser }, testInfo) => {
    const ctx = await setupDaLatScenario(browser, PHONE_VI, 'g23');
    try {
      await addTripExpense(ctx.hung, ctx.tripId, {
        description: 'Taxi',
        amount: 240_000,
        spentOn: todayIso(),
        payerId: ctx.hungPid,
        mode: 'equal',
        entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
      });

      const urls: string[] = [];
      ctx.hung.on('request', (req) => urls.push(req.url()));

      await ctx.hung.goto('/trips');
      await expect(ctx.hung.getByTestId('home-total')).toBeVisible();
      await expect(ctx.hung.getByText('Khoản chi của bạn')).toBeVisible();

      await ctx.hung.goto(`/t/${ctx.tripId}`);
      await expect(ctx.hung.getByText('Taxi')).toBeVisible();

      expect(urls.filter((u) => u.includes('groups=show'))).toEqual([]);

      await saveShot(ctx.hung, testInfo, 'G-23', PHONE_VI);
    } finally {
      await ctx.close();
    }
  });

  test('G-24: guest on the group link picks name, sees what they owe, pays — no personal requests', async ({ browser }, testInfo) => {
    const ctx = await setupDaLatScenario(browser, PHONE_VI, 'g24', {
      nhanBank: { bin: '970407', accountNumber: '19031234565678', holderName: 'Nguyen Vu Nhan' },
    });
    const guestContext = await createActorContext(browser, PHONE_VI);
    const guest = await guestContext.newPage();
    try {
      await addTripExpense(ctx.nhan, ctx.tripId, {
        description: 'Homestay',
        amount: 400_000,
        spentOn: todayIso(),
        payerId: ctx.nhanPid,
        mode: 'equal',
        entries: [ctx.nhanPid, ctx.lanPid].map((participantId) => ({ participantId, value: 1 })),
      });

      const urls: string[] = [];
      guest.on('request', (req) => urls.push(req.url()));

      await guest.goto(`/j/${ctx.groupToken}`);
      await expect(guest).toHaveURL(/\/who(\?.*)?$/);
      await guest.getByRole('radio', { name: /Lan/ }).click();
      await guest.getByRole('button', { name: /Tiếp tục với tên Lan/ }).click();

      await expect(guest.getByRole('img', { name: /200\.000₫/ })).toBeVisible();
      await guest.getByRole('button', { name: 'Tôi đã trả' }).click();
      await expect(guest.getByText(/200\.000₫/).first()).toBeVisible();

      expect(urls.filter((u) => u.includes('/api/me/personal'))).toEqual([]);

      await saveShot(guest, testInfo, 'G-24', PHONE_VI);
    } finally {
      await guestContext.close();
      await ctx.close();
    }
  });

  test('G-25: Minh with book on sees only Minh shares, never Nhan personal extras', async ({ browser }, testInfo) => {
    const ctx = await setupDaLatScenario(browser, PHONE_VI, 'g25');
    try {
      await setupNhanBook(ctx.minh, { tcbStart: 500_000, cashStart: 200_000 });

      const nhanCats = await getCategories(ctx.nhan);
      const foodCat = nhanCats.find((c) => c.type === 'expense' && c.name === 'Ăn uống')!;
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

      const { expenseId } = await addTripExpense(ctx.hung, ctx.tripId, {
        description: 'Taxi',
        amount: 240_000,
        spentOn: todayIso(),
        payerId: ctx.hungPid,
        mode: 'equal',
        entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
      });
      await updateGroupLink(ctx.nhan, expenseId, {
        categoryId: foodCat.id,
        walletId: ctx.wallets.cash.id,
        tagIds: [dalatTag.id],
      });

      const minhList = await getPersonalList(ctx.minh, { month: currentMonth(), groups: 'show' });
      const minhTaxi = (minhList.groupRows ?? []).find((r) => r.id === expenseId);
      expect(minhTaxi).toBeTruthy();
      expect(minhTaxi!.link).toBeNull();

      await ctx.minh.goto('/transactions');
      await ctx.minh.getByTestId(`tx-row-g-${expenseId}`).click();
      const sheet = ctx.minh.getByTestId('group-row-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId('group-row-field-tags')).not.toContainText('#dalat');
      await expect(sheet.getByTestId('group-row-field-wallet')).not.toContainText('Tiền mặt');

      await saveShot(ctx.minh, testInfo, 'G-25', PHONE_VI);
    } finally {
      await ctx.close();
    }
  });

  test('G-26: book off 2 days then on — balance-check prompt on each everyday wallet, adjust and skip', async ({ browser }, testInfo) => {
    const nhanContext = await createActorContext(browser, PHONE_VI);
    const nhan = await nhanContext.newPage();
    try {
      await signIn(nhan, { sub: 'e2e-gs-g26-vi-phone-nhan', name: 'Nhan' });
      const wallets = await setupNhanBook(nhan);

      await setBookEnabled(nhan, false);
      const offRes = await nhan.request.post('/api/test/personal/off-since', { data: { days: 2 } });
      expect(offRes.ok()).toBe(true);
      await setBookEnabled(nhan, true);

      await nhan.goto('/wallets');
      const tcbCard = nhan.getByTestId(`balance-check-card-${wallets.tcb.id}`);
      const cashCard = nhan.getByTestId(`balance-check-card-${wallets.cash.id}`);
      await expect(tcbCard).toBeVisible();
      await expect(tcbCard).toContainText('Số dư có khớp với ngân hàng không?');
      await expect(cashCard).toBeVisible();

      await saveShot(nhan, testInfo, 'G-26', PHONE_VI);

      await nhan.getByTestId(`balance-check-enter-${wallets.tcb.id}`).click();
      await nhan.getByTestId('balance-check-amount').fill('950000');
      await nhan.getByTestId('balance-check-save').click();
      await expect(tcbCard).toHaveCount(0);

      const updatedWallets = await getWallets(nhan);
      const tcbAfter = updatedWallets.find((w) => w.id === wallets.tcb.id)!;
      expect(tcbAfter.balance).toBe(950_000);

      const list = await getPersonalList(nhan, { month: currentMonth(), groups: 'show' });
      expect(list.totals.find((t) => t.currency === 'VND')?.spent ?? 0).toBe(0);

      await nhan.getByTestId(`balance-check-skip-${wallets.cash.id}`).click();
      await expect(cashCard).toHaveCount(0);
    } finally {
      await nhanContext.close();
    }
  });

  test('G-27: book off then on within an hour — no balance-check prompt', async ({ browser }, testInfo) => {
    const nhanContext = await createActorContext(browser, PHONE_VI);
    const nhan = await nhanContext.newPage();
    try {
      await signIn(nhan, { sub: 'e2e-gs-g27-vi-phone-nhan', name: 'Nhan' });
      const wallets = await setupNhanBook(nhan);
      // Create a trip so the book has normal context as well.
      await createTrip(nhan, { name: 'Đà Lạt', preset: 'trip', defaultLang: 'vi', people: ['Lan'] });

      await setBookEnabled(nhan, false);
      const offRes = await nhan.request.post('/api/test/personal/off-since', { data: { days: 0.02 } });
      expect(offRes.ok()).toBe(true);
      await setBookEnabled(nhan, true);

      await nhan.goto('/wallets');
      await expect(nhan.getByTestId(`wallet-row-${wallets.tcb.id}`)).toBeVisible();
      await expect(nhan.getByTestId('balance-check-list')).toHaveCount(0);

      await saveShot(nhan, testInfo, 'G-27', PHONE_VI);
    } finally {
      await nhanContext.close();
    }
  });
});
