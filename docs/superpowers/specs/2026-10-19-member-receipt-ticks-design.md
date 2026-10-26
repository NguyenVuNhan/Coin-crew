# Members settle every transfer they're in — design

Date: 2026-10-19 · Status: approved 2026-10-19 · Plan: [2026-10-19-member-receipt-ticks.md](../plans/2026-10-19-member-receipt-ticks.md)

## 1. Problem

In **Your transfers**, a signed-in member can tick most rows they're in, but not all of them:

| Row | Tick today |
|---|---|
| You → anyone | ✅ "I've paid" |
| Guest → You | ✅ "Received" |
| **Member → You** | ❌ none. The rule was "the paying member marks it themselves" |

So when a member pays you in cash or by bank transfer and never opens the app, the debt stays open and you can't close it.

The server already accepts this: `can(actor, 'record_payment')` lets the payer or the receiver record a payment, and `statusForNewPayment` returns `confirmed` when the receiver records it. **The gap is in the UI only.**

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Scope | Add the same Received tick (and the swipe action on phones) to Member → You rows. No "settle all" button and no partial amounts |
| D2 | Status | Counts at once (`confirmed`), the same as any payment the receiver records |
| D3 | Who | Signed-in members only. Guests keep today's rules |
| D4 | Double record | Server guard: a tick says which amount it saw, and the server refuses with `409 ALREADY_HANDLED` if that pair no longer owes that much |

## 3. Changes

### 3.1 Web: `tickOf` in [YourTransfers.tsx](../../../apps/web/src/components/YourTransfers.tsx)

```diff
-  /** A guest paying me ('received') or my own debt ('paid'). A member paying me marks it themselves, so no tick. */
+  /** Someone paying me ('received') or my own debt ('paid'). A guest only gets 'received' from other guests. */
   const tickOf = (s: Transfer): 'received' | 'paid' | null => {
     if (!canTick) return null;
-    if (s.toId === me && !isMember(s.fromId)) return 'received';
+    if (s.toId === me && (view.me.kind === 'member' || !isMember(s.fromId))) return 'received';
     if (s.fromId === me) return 'paid';
     return null;
   };
```

Everything else stays as it is: the 5-second Undo, the swipe action, `aria-pressed`, the "{name} paid {amount}" snackbar, and the alignment space. It also works in **Show all** mode, because only rows you're in can be ticked.

### 3.2 API: guard against recording a tick twice

- The tick body gets an optional flag: `{ fromId, toId, amount, settles: true }`. Only the transfer ticks send it, for every kind of tick (paid and received). PayScreen's "I've paid" stays as it is.
- In `POST /trips/:id/payments` ([routes.ts](../../../apps/api/src/payments/routes.ts)), when `settles === true`, the server runs this before the insert, after `statusForNewPayment`:
  ```ts
  const snapshot = await getSnapshot(db, actor.trip);
  const s = snapshot.suggestions.find((x) => x.fromId === fromId && x.toId === toId);
  if (!s || s.amount < amount) throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
  ```
  - If the debt grew after the tick (a new expense), the amount is still accepted: the tick records the amount the user saw.
  - The check and the write are separate steps, so the race is still possible but now only lasts milliseconds instead of the 5-second Undo window. That's acceptable at this app's scale. Fully atomic inserts are out of scope.
- Validation: if `settles` is present it must be a boolean, otherwise `422 VALIDATION`.

### 3.3 Web: handling the refusal

- [usePendingPayment.ts](../../../apps/web/src/lib/usePendingPayment.ts) `flush` sends `{ ...payment, settles: true }`.
- If the error is an `ApiClientError` with code `ALREADY_HANDLED`, it still reloads the trip (`invalidateQueries(['trip', id])`) and records a "settled" error kind instead of a generic one.
- `TransfersSnackbar` shows `transfers.alreadySettled` for it instead of `error.generic`:
  - en: `'Already recorded. The list is up to date.'`
  - vi: draft, marked `// REVIEW`.

## 4. Edge cases

| Case | Behaviour |
|---|---|
| Both members tick within the Undo window | The first one is sent and the trip reloads. The other side's pending tick is cancelled by the effect that already exists in `useTransfersState` (its suggestion is gone). If both send at once, the second gets a 409 and sees "Already recorded" |
| Payer has a `says_paid` waiting | Can't happen for member payers: what a member records is `confirmed` straight away |
| Viewer, pending person, archived trip | No tick (`canTick` is unchanged) |
| Guest viewing Member → Guest | No tick (D3) |
| "Fewest transfers" changes the pairs between seeing the row and sending | The pair is no longer suggested, so it returns 409 and the list refreshes. Correct |

## 5. Tests

- **Web** [transfer-ticks.test.tsx](../../../apps/web/src/components/__tests__/transfer-ticks.test.tsx):
  - A member sees a Received tick on Member → You. Ticking it posts `{ fromId, toId, amount, settles: true }` after Undo.
  - A guest still sees no tick on Member → Guest.
  - A 409 `ALREADY_HANDLED` shows "Already recorded" and reloads the trip.
  - Update the posted-body assertions in transfer-ticks, `payment-actions.test.tsx` and `layout-switch.test.tsx` to include `settles: true`.
- **API** [payments.test.ts](../../../apps/api/test/payments.test.ts):
  - The receiving member records a member's debt and it is `confirmed`.
  - `settles: true` for an amount above the open debt, or for a pair that isn't suggested, returns 409.
  - Two `settles: true` posts in a row for the same pair: the first gets 201, the second 409.
  - Without `settles`, nothing changes.
- **Docs**: update the lead line under "3. Your transfers" in [v4-ui-restructure.html](../mockups/v4-ui-restructure.html) to say that ticks appear on every row where someone pays you (for members).

## 6. Out of scope

- "Settle all", partial amounts, and admins settling other people's transfers.
- Notifying the payer that their debt was closed (there are no notifications yet).
