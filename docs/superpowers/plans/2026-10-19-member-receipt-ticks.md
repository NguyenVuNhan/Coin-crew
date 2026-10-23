# Members settle every transfer they're in: implementation plan

Spec: [2026-10-19-member-receipt-ticks-design.md](../specs/2026-10-19-member-receipt-ticks-design.md)

**Goal:** a signed-in member can tick "Received" on a Member → You row. Every transfer tick sends `settles: true`, and the API refuses it with `409 ALREADY_HANDLED` if that pair no longer owes at least that amount.

**Order:** API guard first (Tasks 1–2), then the web send and refusal (Tasks 3–4), then the new tick (Task 5), then docs (Task 6). Each task is test-first: write the failing test, make it pass, run the suite for that workspace.

**Commands:**
- API tests: `npm test -w @fsl/api -- payments`
- Web tests: `npm test -w @fsl/web -- transfer-ticks payment-actions layout-switch`
- All tests and the type check: `npm test` and `npm run typecheck`

---

## Task 1: API tests for the guard (they fail first)

File: [apps/api/test/payments.test.ts](../../../apps/api/test/payments.test.ts)

The seed trip uses "fewest transfers". Its suggestions are **C→M 1.245.000**, **B→M 565.000** and **A→M 385.000**. Minh (`PID.M`) is the only member until `linkMember` is called.

1. Next to `record`, add a helper that sends the flag:
   ```ts
   const settle = (headers: Record<string, string>, fromId: string, toId: string, amount: number, settles: unknown = true) =>
     send('/payments', headers, { fromId, toId, amount, settles });
   ```
2. Add `describe('settling a suggested transfer (settles: true)', …)` with these cases:
   - **The receiving member records a member's debt.** Call `linkMember(PID.A, U.an, 'An')`, then Minh settles A→M 385000. Expect `201` with status `confirmed`, and `suggestion(view, PID.A, PID.M)` is now `undefined`.
   - **Second settle of the same pair.** Minh settles A→M 385000 twice in a row. Expect `[201, 409]`, with error code `ALREADY_HANDLED` on the second. The balance is counted once: `balances[PID.A] === 0`.
   - **More than is owed.** Minh settles A→M 400000. Expect `409 ALREADY_HANDLED` and no payment row.
   - **A pair that isn't suggested.** Minh settles M→A 1000. Expect `409 ALREADY_HANDLED`.
   - **Less than is owed** (the debt grew after the tick). Minh settles A→M 300000. Expect `201`, and the suggestion A→M becomes 85000.
   - **A `settles` that isn't a boolean.** `settle(minh, PID.A, PID.M, 385000, 'yes')` returns `422 VALIDATION`.
   - **Without `settles`, nothing changes.** `record(minh, PID.A, PID.M, 400000)` still returns `201`.
3. Run the API tests. The new cases fail with 201 where 409 or 422 is expected.

## Task 2: API guard in `POST /trips/:id/payments`

File: [apps/api/src/payments/routes.ts](../../../apps/api/src/payments/routes.ts)

1. Import `getSnapshot`, the same way [bank/routes.ts](../../../apps/api/src/bank/routes.ts#L18) does:
   ```ts
   import { getSnapshot } from '../trips/snapshot';
   ```
2. Add `settles?: unknown;` to the parsed body type (L70–74).
3. After the amount check (L87–90), validate the flag:
   ```ts
   if (body.settles !== undefined && typeof body.settles !== 'boolean') {
     throw new ApiError('VALIDATION', 422, 'Invalid request');
   }
   ```
4. After the `status === 'forbidden'` check (L130–132) and before the insert, add:
   ```ts
   // A tick settles the transfer it showed. If that pair no longer owes this much, someone recorded it in the
   // meantime (the other side ticked it too): refuse, so it isn't counted twice. The check and the write are
   // separate steps, so the race is narrowed to milliseconds, not closed.
   if (body.settles === true) {
     const snapshot = await getSnapshot(db, actor.trip);
     const open = snapshot.suggestions.find((s) => s.fromId === fromId && s.toId === toId);
     if (!open || open.amount < amount) {
       throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
     }
   }
   ```
5. Run the API tests. They should all pass.

## Task 3: web tests for the flag and the refusal (they fail first)

1. Add `settles: true` to every posted-body assertion of a **transfer tick**:
   - [transfer-ticks.test.tsx](../../../apps/web/src/components/__tests__/transfer-ticks.test.tsx): L91, L160, L171, L186, L194, L207, L211–212, L334, L376.
   - [payment-actions.test.tsx](../../../apps/web/src/screens/__tests__/payment-actions.test.tsx): L35 and L93.
   - [layout-switch.test.tsx](../../../apps/web/src/screens/__tests__/layout-switch.test.tsx): L59.
   - **Leave `pay.test.tsx` alone.** PayScreen's "I've paid" doesn't send the flag.
2. In transfer-ticks.test.tsx (in `describe('Your transfers: tick to confirm')`), add a test: **"a tick someone else already recorded says so and reloads the trip"**.
   - Mock the payment POST to return a 409:
     ```ts
     [PAYMENTS]: () => Response.json({ error: { code: 'ALREADY_HANDLED', message: 'Someone already handled this.' } }, { status: 409 })
     ```
   - Render the trip and tick An, then wait 5 seconds (`later(5_000)`).
   - Expect a snackbar `status` with the text `Already recorded. The list is up to date.`, and no "Something went wrong".
   - Expect the trip query to be invalidated. Spy on `QueryClient.prototype.invalidateQueries` or check a `GET /api/trips/t-1` refetch, whichever pattern the file already uses.
3. Run the web tests. They fail: the body has no `settles`, and the snackbar says "Something went wrong".

## Task 4: send the flag and handle the refusal on the web

1. In [usePendingPayment.ts](../../../apps/web/src/lib/usePendingPayment.ts) `flush` (L75–81):
   ```ts
   apiSend(`/api/trips/${id}/payments`, 'POST', { ...payment, settles: true }, id, { keepalive: true })
     .then(() => queryClient.invalidateQueries({ queryKey: ['trip', id], refetchType: 'all' }))
     .catch((err: unknown) => {
       // Someone recorded it first: reload so the row goes away, and say so.
       if (err instanceof ApiClientError && err.code === 'ALREADY_HANDLED') {
         void queryClient.invalidateQueries({ queryKey: ['trip', id], refetchType: 'all' });
       }
       if (mounted.current) setError(err);
     })
   ```
   Import `ApiClientError` from `../api/client`. Update the docstring above `usePendingPayment` to say ticks send `settles: true`.
2. In [YourTransfers.tsx](../../../apps/web/src/components/YourTransfers.tsx) `TransfersSnackbar` (L173):
   ```tsx
   if (error === null) return null;
   const settled = error instanceof ApiClientError && error.code === 'ALREADY_HANDLED';
   return <Snackbar message={t(settled ? 'transfers.alreadySettled' : 'error.generic')} />;
   ```
   Import `ApiClientError` from `../api/client`.
3. Add the copy:
   - [en.ts](../../../apps/web/src/i18n/en.ts) after `transfers.nothingDue`: `'transfers.alreadySettled': 'Already recorded. The list is up to date.',`
   - [vi.ts](../../../apps/web/src/i18n/vi.ts) at the same place: `'transfers.alreadySettled': 'Khoản này đã được ghi nhận. Danh sách đã được cập nhật.', // REVIEW`
4. Run the web tests. They should all pass.

## Task 5: the Received tick on Member → You

1. **Test first.** In transfer-ticks.test.tsx, rename `'ticks only where a guest pays me and on my own debts'` (L58) to `'a member ticks every row they are in'`. In the `withMemberBinh()` part:
   - Replace the L63–64 assertion with `expect(screen.getByRole('button', { name: 'Mark 565.000₫ from Bình as received' })).toBeInTheDocument();`
   - Change `toHaveLength(3)` to `toHaveLength(4)`.
   - Leave the `guestChiView()` part as it is. It already proves a guest gets no extra ticks.
2. Add a test: **"a guest gets no tick when a member pays them"**.
   - Use `guestChiView()` with a suggestion `{ fromId: PIDS.M, toId: PIDS.C, amount: 100000 }` added (Minh is a member).
   - Expect no `/^Mark .* from Minh as received$/` button in `transfer-${PIDS.M}-${PIDS.C}`.
3. Add a test: **"ticking a member's debt records it after Undo"**.
   - Use `withMemberBinh()` and click `Mark 565.000₫ from Bình as received`.
   - Expect the snackbar `Bình paid 565.000₫`.
   - After `later(5_000)`, expect `posted(calls)` to equal `[{ fromId: PIDS.B, toId: PIDS.M, amount: 565000, settles: true }]`.
4. Run them. The first one fails because there is no Bình tick yet.
5. **Implement.** In YourTransfers.tsx `tickOf` (L240–246):
   ```tsx
   /** Someone paying me ('received') or my own debt ('paid'). A guest only gets 'received' when another guest pays. */
   const tickOf = (s: Transfer): 'received' | 'paid' | null => {
     if (!canTick) return null;
     if (s.toId === me && (view.me.kind === 'member' || !isMember(s.fromId))) return 'received';
     if (s.fromId === me) return 'paid';
     return null;
   };
   ```
6. Check the docs about ticks in the same file, and the [BalanceCard.tsx](../../../apps/web/src/components/BalanceCard.tsx#L11) header comment. Update any line that still says only a guest's payment gets a tick.
7. Run the web tests. They should all pass.

## Task 6: docs and the full run

1. [v4-ui-restructure.html](../mockups/v4-ui-restructure.html#L164) lead line: replace "Ticks appear where a guest pays you and on your own debts." with "Ticks appear on your own debts and where someone pays you (for a guest: where another guest pays them)."
2. Spec status: change "draft, waiting for review" to "approved 2026-10-19".
3. Run `npm run typecheck` and `npm test`. Both should be green.
4. Optional manual check (`npm run dev`, two Google accounts in the same trip):
   - A owes B. B ticks "Received", and the row goes away for both after a reload.
   - Both tick within 5 seconds. One records the payment, and the other sees "Already recorded".

## Done when

- [x] A member sees a Received tick (and the swipe action on phones) on every row where someone pays them. A guest sees the same ticks as before.
- [x] Every transfer tick posts `settles: true`. PayScreen's body is unchanged.
- [x] The API returns 409 `ALREADY_HANDLED` for a stale or duplicate settle, and 422 for a `settles` that isn't a boolean.
- [x] The app shows "Already recorded. The list is up to date." and reloads the trip.
- [x] `npm run typecheck` and `npm test` pass.
