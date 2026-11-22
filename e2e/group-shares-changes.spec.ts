import { test, expect } from '@playwright/test';
import {
  MATRIX,
  MINUS,
  addTripExpense,
  approveTripExpense,
  createActorContext,
  createTrip,
  currentMonth,
  disableTripExpense,
  editTripExpense,
  enableTripExpense,
  getPersonalList,
  monthBounds,
  saveShot,
  setupDaLatScenario,
  todayIso,
} from './group-shares-helpers';

for (const variant of MATRIX) {
  test.describe(`${variant.lang}-${variant.size}`, () => {
    test('G-11: Hùng edits the taxi to 300k — reload and saved-copy search show −100k', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g11');
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
        await expect(ctx.nhan.getByTestId(`tx-row-g-${expenseId}`)).toContainText(`${MINUS}80.000₫`);

        const { expenseId: newHeadId } = await editTripExpense(ctx.hung, ctx.tripId, expenseId, {
          description: 'Taxi',
          amount: 300_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.nhanPid, ctx.hungPid, ctx.minhPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.reload();
        const updatedRow = ctx.nhan.getByTestId(`tx-row-g-${newHeadId}`);
        await expect(updatedRow).toBeVisible();
        await expect(updatedRow).toContainText(`${MINUS}100.000₫`);

        const { from, to } = monthBounds(currentMonth());
        await ctx.nhan.goto(`/transactions?from=${from}&to=${to}`);
        await ctx.nhan.getByTestId('tx-filter-search').fill('Taxi');
        await ctx.nhan.getByTestId('tx-search-submit').click();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${newHeadId}`)).toContainText(`${MINUS}100.000₫`);

        await saveShot(ctx.nhan, testInfo, 'G-11', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-12: guest adds a 60k pending expense — greyed and uncounted until a member approves', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g12');
      const guestContext = await createActorContext(browser, variant);
      const guest = await guestContext.newPage();
      try {
        const pickRes = await guest.request.post(`/api/trips/${ctx.tripId}/people/pick`, {
          headers: { 'X-Link-Token': ctx.groupToken },
          data: { participantId: ctx.lanPid },
        });
        expect(pickRes.ok()).toBe(true);

        const { expenseId } = await addTripExpense(
          guest,
          ctx.tripId,
          {
            description: 'Trà sữa',
            amount: 60_000,
            spentOn: todayIso(),
            payerId: ctx.lanPid,
            mode: 'equal',
            entries: [ctx.nhanPid, ctx.lanPid].map((participantId) => ({ participantId, value: 1 })),
          },
          ctx.groupToken,
        );

        await ctx.nhan.goto('/transactions');
        const row = ctx.nhan.getByTestId(`tx-row-g-${expenseId}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText(variant.lang === 'vi' ? 'Chưa tính' : 'Not counted');
        await expect(row).toContainText(variant.lang === 'vi' ? 'Chờ duyệt' : 'Waiting for approval');

        const beforeApprove = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        expect(beforeApprove.totals.find((t) => t.currency === 'VND')?.spent ?? 0).toBe(0);

        await saveShot(ctx.nhan, testInfo, 'G-12', variant);

        // Approving needs an admin or someone in the expense: Nhan organises the trip.
        await approveTripExpense(ctx.nhan, ctx.tripId, expenseId);
        await ctx.nhan.reload();
        await expect(row).toBeVisible();
        await expect(row).not.toContainText(variant.lang === 'vi' ? 'Chưa tính' : 'Not counted');
        await expect(row).not.toContainText(variant.lang === 'vi' ? 'Chờ duyệt' : 'Waiting for approval');
        await expect(row).toContainText(`${MINUS}30.000₫`);

        const afterApprove = await getPersonalList(ctx.nhan, { month: currentMonth(), groups: 'show' });
        expect(afterApprove.totals.find((t) => t.currency === 'VND')?.spent).toBe(30_000);
      } finally {
        await guestContext.close();
        await ctx.close();
      }
    });

    test('G-13: Hùng disables the taxi then enables it — row disappears then returns', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g13');
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

        await disableTripExpense(ctx.hung, ctx.tripId, expenseId);
        await ctx.nhan.reload();
        await expect(row).toHaveCount(0);

        await enableTripExpense(ctx.hung, ctx.tripId, expenseId);
        await ctx.nhan.reload();
        await expect(row).toBeVisible();

        await saveShot(ctx.nhan, testInfo, 'G-13', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-14: unclaimed name "Nhan" in a second trip appears only after claiming it', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g14');
      try {
        const trip2 = await createTrip(ctx.minh, {
          name: 'Phú Quốc',
          preset: 'trip',
          defaultLang: variant.lang,
          people: ['Nhan'],
        });
        const unclaimedNhanPid = trip2.pidByName('Nhan');
        const { expenseId } = await addTripExpense(ctx.minh, trip2.tripId, {
          description: 'Vé máy bay',
          amount: 400_000,
          spentOn: todayIso(),
          payerId: trip2.myPid,
          mode: 'equal',
          entries: [trip2.myPid, unclaimedNhanPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/transactions');
        await expect(ctx.nhan.getByTestId(`tx-row-g-${expenseId}`)).toHaveCount(0);

        const pickRes = await ctx.nhan.request.post(`/api/trips/${trip2.tripId}/people/pick`, {
          headers: { 'X-Link-Token': trip2.groupToken },
          data: { participantId: unclaimedNhanPid },
        });
        expect(pickRes.ok()).toBe(true);

        const claimRes = await ctx.nhan.request.post(`/api/trips/${trip2.tripId}/membership`, {
          headers: { 'X-Link-Token': trip2.groupToken },
          data: { participantId: unclaimedNhanPid },
        });
        expect(claimRes.ok()).toBe(true);
        const { requestId } = (await claimRes.json()) as { requestId: string };

        const approveRes = await ctx.minh.request.post(
          `/api/trips/${trip2.tripId}/membership/${requestId}/approve`,
        );
        expect(approveRes.ok()).toBe(true);

        await ctx.nhan.reload();
        const row = ctx.nhan.getByTestId(`tx-row-g-${expenseId}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Phú Quốc');
        await expect(row).toContainText(`${MINUS}200.000₫`);

        await saveShot(ctx.nhan, testInfo, 'G-14', variant);
      } finally {
        await ctx.close();
      }
    });

    test('G-15: merging a duplicate name into the claimed one shows rows of both names once', async ({ browser }, testInfo) => {
      const ctx = await setupDaLatScenario(browser, variant, 'g15');
      try {
        const dupRes = await ctx.nhan.request.post(`/api/trips/${ctx.tripId}/people`, {
          data: { name: 'Nhan B' },
        });
        expect(dupRes.ok()).toBe(true);
        const { participantId: dupPid } = (await dupRes.json()) as { participantId: string };

        const { expenseId: exp1 } = await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Ăn sáng',
          amount: 120_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.hungPid, ctx.nhanPid].map((participantId) => ({ participantId, value: 1 })),
        });
        const { expenseId: exp2 } = await addTripExpense(ctx.hung, ctx.tripId, {
          description: 'Ăn trưa',
          amount: 180_000,
          spentOn: todayIso(),
          payerId: ctx.hungPid,
          mode: 'equal',
          entries: [ctx.hungPid, dupPid].map((participantId) => ({ participantId, value: 1 })),
        });

        await ctx.nhan.goto('/transactions');
        await expect(ctx.nhan.getByTestId(`tx-row-g-${exp1}`)).toHaveCount(1);
        await expect(ctx.nhan.getByTestId(`tx-row-g-${exp2}`)).toHaveCount(0);

        const mergeRes = await ctx.nhan.request.post(`/api/trips/${ctx.tripId}/people/merge`, {
          data: { fromId: dupPid, intoId: ctx.nhanPid },
        });
        expect(mergeRes.ok()).toBe(true);

        await ctx.nhan.reload();
        await expect(ctx.nhan.getByTestId(`tx-row-g-${exp1}`)).toHaveCount(1);
        await expect(ctx.nhan.getByTestId(`tx-row-g-${exp2}`)).toHaveCount(1);

        await saveShot(ctx.nhan, testInfo, 'G-15', variant);
      } finally {
        await ctx.close();
      }
    });
  });
}
