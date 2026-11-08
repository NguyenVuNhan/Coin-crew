# Transaction Email Notifications & Loan Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver automated email notifications for transaction CRUD events, consolidated weekly loan reminders, consolidated monthly club digests, and user notification preference controls for Coin Crew.

**Architecture:** An asynchronous event dispatcher in Cloudflare Workers using the Resend REST API sends responsive HTML emails via `ctx.waitUntil`. Notification preferences and throttling/audit logs are stored in D1 via Drizzle ORM. Scheduled crons consolidate multi-group debts and monthly summaries into single user-centric digests, while the web client provides toggle controls in account settings.

**Tech Stack:** Cloudflare Workers, Hono, Drizzle ORM, SQLite/D1, Resend API, React, Tailwind CSS, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-transaction-email-notifications-design.md`

## Global Constraints

- **Platform Runtime**: Cloudflare Workers environment; all email delivery uses HTTPS REST (`https://api.resend.com/emails`) with no direct TCP/SMTP socket connections.
- **Asynchronous Execution**: Transaction CRUD handlers must never await email sending; all delivery occurs via `ctx.waitUntil` to maintain API responses under 50ms.
- **Zero Ledger Corruption**: Email processing is strictly read-only with respect to transaction ledger data and never alters database amounts or balances.
- **Privacy**: Individual email delivery only; recipient emails must never appear in shared `cc` headers.
- **Multi-Group Consolidation**: Scheduled crons (weekly reminders, monthly notices) must combine all user groups into a single consolidated email rather than sending separate emails per group.
- **Graceful Skipping**: Users authenticated without an email address (e.g. Zalo-only) are skipped without errors.
- **Monetary Formatting**: All email amounts adhere to VND presentation (`tabular-nums font-semibold` formatting).

## Review Focus

1. **User has no linked email (Zalo-only identity)**: Skipped silently; transaction creation/update succeeds normally without runtime exception. (Tested in Task 4)
2. **Actor is participant in split**: Split participants who are the transaction author are filtered out and receive no notification for their own action. (Tested in Task 4)
3. **External Email Provider Failure / Timeout**: Provider errors during `ctx.waitUntil` are caught and logged without crashing or hanging the Worker. (Tested in Task 3)
4. **Group Admin Rapid Repeated "Remind Debtors" Clicks**: Debtor nudges record timestamps in `notification_logs` immediately to prevent duplicate sends within the same hour. (Tested in Task 5)
5. **Multi-Group Consolidated Digest with 0 Net Debt or Empty Month**: Crons exclude groups with 0 activity and users with no negative balances, preventing empty digest emails. (Tested in Task 5)

---

### Task 1: Core Types, Schema & Database Migrations

**Files:**
- Create: `apps/api/migrations/0008_notifications.sql`
- Modify: `libs/shared/core/src/api-types.ts`
- Modify: `libs/api/db/src/schema.ts`
- Test: `apps/api/test/schema-notifications.test.ts`

**Interfaces:**
- Consumes: `users`, `trips` tables from `libs/api/db/src/schema.ts`.
- Produces: `userNotificationSettings`, `notificationLogs` tables and `UserNotificationSettings` type.

- [ ] **Step 1: Write the failing schema test**

Create `apps/api/test/schema-notifications.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { userNotificationSettings, notificationLogs } from '@cc/api-db/schema';

describe('Notification Schema', () => {
  it('defines user_notification_settings table structure', () => {
    expect(userNotificationSettings).toBeDefined();
    expect(userNotificationSettings.userId).toBeDefined();
    expect(userNotificationSettings.transactionCrud).toBeDefined();
    expect(userNotificationSettings.loanReminders).toBeDefined();
    expect(userNotificationSettings.monthlyNotice).toBeDefined();
  });

  it('defines notification_logs table structure', () => {
    expect(notificationLogs).toBeDefined();
    expect(notificationLogs.id).toBeDefined();
    expect(notificationLogs.userId).toBeDefined();
    expect(notificationLogs.type).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/test/schema-notifications.test.ts`
Expected: FAIL with "userNotificationSettings is not defined"

- [ ] **Step 3: Implement types, Drizzle schema, and migration**

In `libs/shared/core/src/api-types.ts`, export:
```ts
export type UserNotificationSettings = {
  transactionCrud: boolean;
  loanReminders: boolean;
  monthlyNotice: boolean;
};

export type NotificationLogType = 'transaction_crud' | 'loan_reminder' | 'monthly_notice';
```

In `libs/api/db/src/schema.ts`, define and export:
- `userNotificationSettings` table with `userId`, `transactionCrud` (default 1), `loanReminders` (default 1), `monthlyNotice` (default 1), `updatedAt`.
- `notificationLogs` table with `id`, `userId`, `tripId`, `type`, `referenceId`, `sentAt`, and compound index on `(userId, tripId, type, sentAt)`.

In `apps/api/migrations/0008_notifications.sql`, write the corresponding `CREATE TABLE` and `CREATE INDEX` DDL statements.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/test/schema-notifications.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/shared/core/src/api-types.ts libs/api/db/src/schema.ts apps/api/migrations/0008_notifications.sql apps/api/test/schema-notifications.test.ts
git commit -m "feat(db): add user_notification_settings and notification_logs tables (#84)"
```

---

### Task 2: Notification Settings API Routes

**Files:**
- Create: `apps/api/src/notifications/settingsRoutes.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/notification-settings.test.ts`

**Interfaces:**
- Consumes: `userNotificationSettings` from `libs/api/db/src/schema.ts`, `requireUser` from `@cc/api-auth/session`.
- Produces: `GET /api/me/notifications` and `PATCH /api/me/notifications` endpoints returning `{ settings: UserNotificationSettings }`.

- [ ] **Step 1: Write the failing route test**

Create `apps/api/test/notification-settings.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';

describe('Notification Settings API', () => {
  it('GET /api/me/notifications returns default enabled settings when no row exists', async () => {
    const app = createApp();
    // authenticated test user request
    const res = await app.request('/api/me/notifications', {
      headers: { Cookie: 'cc_session=test-user-session' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      settings: {
        transactionCrud: true,
        loanReminders: true,
        monthlyNotice: true,
      },
    });
  });

  it('PATCH /api/me/notifications updates settings', async () => {
    const app = createApp();
    const res = await app.request('/api/me/notifications', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'cc_session=test-user-session',
      },
      body: JSON.stringify({ transactionCrud: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.transactionCrud).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/test/notification-settings.test.ts`
Expected: FAIL with 404 Not Found

- [ ] **Step 3: Implement `settingsRoutes.ts` and register in `app.ts`**

In `apps/api/src/notifications/settingsRoutes.ts`:
- Define `GET /me/notifications`: queries `userNotificationSettings` by session user ID; if missing, returns defaults `{ transactionCrud: true, loanReminders: true, monthlyNotice: true }`.
- Define `PATCH /me/notifications`: validates body schema, performs upsert in `userNotificationSettings`, and returns updated settings.
In `apps/api/src/app.ts`:
- Register `app.route('/api', notificationSettingsRoutes());`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/test/notification-settings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/settingsRoutes.ts apps/api/src/app.ts apps/api/test/notification-settings.test.ts
git commit -m "feat(api): add notification settings endpoints (#84)"
```

---

### Task 3: Email Service & Responsive HTML Templates

**Files:**
- Create: `apps/api/src/notifications/emailService.ts`
- Create: `apps/api/src/notifications/templates/transactionEmail.ts`
- Create: `apps/api/src/notifications/templates/paymentEmail.ts`
- Create: `apps/api/src/notifications/templates/loanReminderEmail.ts`
- Create: `apps/api/src/notifications/templates/monthlyNoticeEmail.ts`
- Test: `apps/api/test/email-service.test.ts`
- Test: `apps/api/test/email-templates.test.ts`

**Interfaces:**
- Consumes: `RESEND_API_KEY`, `APP_ORIGIN` from `Env`.
- Produces: `EmailService` interface with `send(payload: EmailPayload): Promise<{ success: boolean; error?: string }>`.
- Produces: Template renderers returning `{ subject: string; html: string; text: string }`.

- [ ] **Step 1: Write failing tests for email service and templates**

In `apps/api/test/email-service.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createEmailService } from '../src/notifications/emailService';

describe('EmailService', () => {
  it('ConsoleEmailService logs payload and returns success when no API key configured', async () => {
    const service = createEmailService({});
    const res = await service.send({ to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' });
    expect(res.success).toBe(true);
  });

  it('ResendEmailService handles provider 500 error gracefully without throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'Provider error' });
    const service = createEmailService({ RESEND_API_KEY: 'test-key' });
    const res = await service.send({ to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('500');
  });
});
```

In `apps/api/test/email-templates.test.ts`:
- Test that `renderLoanReminderEmail` outputs the "Pay via VietQR" web link `APP_ORIGIN/g/:token#settle` and includes tabular amounts.
- Test that `renderMonthlyNoticeEmail` includes multi-group spending and closing balances.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/test/email-service.test.ts apps/api/test/email-templates.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `emailService.ts` and template modules**

- Implement `createEmailService(env: Partial<Env>): EmailService`.
  - When `env.RESEND_API_KEY` exists, post to `https://api.resend.com/emails` with bearer token. Catch any network/fetch exceptions and return `{ success: false, error: err.message }`.
  - Fallback `ConsoleEmailService` that uses `console.log` for development/testing.
- Implement responsive HTML email builders with clean inline CSS, tabular numbers, bilingual copy, and plaintext fallback in `apps/api/src/notifications/templates/`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/test/email-service.test.ts apps/api/test/email-templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/emailService.ts apps/api/src/notifications/templates/ apps/api/test/email-service.test.ts apps/api/test/email-templates.test.ts
git commit -m "feat(api): add Resend email service and notification templates (#84)"
```

---

### Task 4: Transaction Lifecycle Dispatcher & Handlers

**Files:**
- Create: `apps/api/src/notifications/transactionDispatcher.ts`
- Modify: `apps/api/src/expenses/routes.ts`
- Modify: `apps/api/src/payments/routes.ts`
- Test: `apps/api/test/transaction-notifications.test.ts`

**Interfaces:**
- Consumes: `EmailService`, `userNotificationSettings`, `transactions`, `transactionShares`, `users`, `trips`.
- Produces: `dispatchExpenseNotification(c, event, expenseRootId)` and `dispatchPaymentNotification(c, event, paymentId)`.

- [ ] **Step 1: Write failing tests for transaction email dispatch**

Create `apps/api/test/transaction-notifications.test.ts`:
- Test 1: Expense approved -> sends email to participants with `amount > 0` and `transactionCrud = 1`.
- Test 2 (Review Focus #2): Actor who split the bill is filtered out and receives no email.
- Test 3 (Review Focus #1): Participant with Zalo-only account (no email) is skipped silently; handler completes without error.
- Test 4: Payment `says_paid` sends prompt to recipient; `confirmed` sends receipt to payer.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/test/transaction-notifications.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `transactionDispatcher.ts` and attach to route handlers**

In `apps/api/src/notifications/transactionDispatcher.ts`:
- Query transaction, participants, linked users, and their notification preferences.
- Filter out: author ID, users without email, users with `transactionCrud = 0`.
- Wrap delivery call in `c.executionCtx.waitUntil(...)`.
In `apps/api/src/expenses/routes.ts`:
- Invoke dispatcher on expense creation (if approved), expense approval, update, and disable/delete.
In `apps/api/src/payments/routes.ts`:
- Invoke dispatcher on payment create (`says_paid`) and payment confirmation (`confirmed`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/test/transaction-notifications.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/transactionDispatcher.ts apps/api/src/expenses/routes.ts apps/api/src/payments/routes.ts apps/api/test/transaction-notifications.test.ts
git commit -m "feat(api): dispatch email notifications on transaction lifecycle events (#84)"
```

---

### Task 5: Consolidated Loan Reminders, Monthly Notice Crons & Admin Nudge

**Files:**
- Create: `apps/api/src/notifications/cron/loanReminders.ts`
- Create: `apps/api/src/notifications/cron/monthlyNotice.ts`
- Create: `apps/api/src/notifications/adminRoutes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/cron-notifications.test.ts`
- Test: `apps/api/test/admin-remind.test.ts`

**Interfaces:**
- Consumes: D1 `trips`, `participants`, `transactions`, `userNotificationSettings`, `notificationLogs`.
- Produces:
  - `sendWeeklyLoanReminders(env, now): Promise<void>`
  - `sendMonthlyNotices(env, now): Promise<void>`
  - `POST /api/trips/:id/remind-debtors` endpoint.

- [ ] **Step 1: Write failing tests for cron and admin nudge**

In `apps/api/test/cron-notifications.test.ts`:
- Test multi-group consolidation: User in 2 groups with debt gets 1 combined email listing both groups.
- Test cooldown: User reminded 3 days ago is skipped by weekly cron.
- Test (Review Focus #5): User with 0 balance or groups with 0 activity receive no emails.
In `apps/api/test/admin-remind.test.ts`:
- Test admin manual trigger sends immediately, updates `notification_logs`.
- Test (Review Focus #4): Repeated admin clicks within the same hour are deduplicated/throttled.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/test/cron-notifications.test.ts apps/api/test/admin-remind.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cron handlers and admin endpoint**

- Implement `sendWeeklyLoanReminders`: query active trips (`preset != 'direct' AND archived_at IS NULL`), calculate net balances, filter by 7-day cooldown in `notification_logs`, group by `userId`, render combined email, log dispatch.
- Implement `sendMonthlyNotices`: check if date is 1st of month, summarize preceding month activity per user across active groups, render combined digest.
- Implement `POST /api/trips/:id/remind-debtors`: check admin permissions, send group-specific nudge to debtors, record in `notification_logs` with 1-hour debounce check.
- Wire crons into `index.ts` `scheduled()` handler.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/test/cron-notifications.test.ts apps/api/test/admin-remind.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/cron/ apps/api/src/notifications/adminRoutes.ts apps/api/src/app.ts apps/api/src/index.ts apps/api/test/cron-notifications.test.ts apps/api/test/admin-remind.test.ts
git commit -m "feat(api): add consolidated loan reminders, monthly notice crons, and admin nudge (#84)"
```

---

### Task 6: Web UI Notification Settings & Client Hooks

**Files:**
- Create: `libs/web/screens/src/components/NotificationSettingsModal.tsx`
- Modify: `libs/web/screens/src/components/AccountMenu.tsx`
- Modify: `libs/web/i18n/src/vi.ts`
- Modify: `libs/web/i18n/src/en.ts`
- Test: `libs/web/screens/src/components/__tests__/notification-settings.test.tsx`

**Interfaces:**
- Consumes: `GET /api/me/notifications`, `PATCH /api/me/notifications`.
- Produces: `NotificationSettingsModal` UI rendered in `AccountMenu.tsx`.

- [ ] **Step 1: Write failing UI test**

Create `libs/web/screens/src/components/__tests__/notification-settings.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NotificationSettingsModal } from '../NotificationSettingsModal';

describe('NotificationSettingsModal', () => {
  it('renders toggles for transaction activity, loan reminders, and monthly notice', () => {
    render(
      <NotificationSettingsModal
        open={true}
        onClose={vi.fn()}
        hasEmail={true}
        settings={{ transactionCrud: true, loanReminders: true, monthlyNotice: true }}
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByText(/transaction/i)).toBeInTheDocument();
    expect(screen.getByText(/loan/i)).toBeInTheDocument();
    expect(screen.getByText(/monthly/i)).toBeInTheDocument();
  });

  it('displays warning when user has no linked email', () => {
    render(
      <NotificationSettingsModal
        open={true}
        onClose={vi.fn()}
        hasEmail={false}
        settings={{ transactionCrud: true, loanReminders: true, monthlyNotice: true }}
        onUpdate={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/web/screens/src/components/__tests__/notification-settings.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `NotificationSettingsModal.tsx` and integrate into `AccountMenu.tsx`**

- Add translation strings to `vi.ts` and `en.ts` for notification titles, descriptions, and no-email warning.
- Build `NotificationSettingsModal` using Switch components and clean accessibility labels.
- Add an "Email Notifications" menu row with bell/mail icon in `AccountMenu.tsx` opening the modal.
- Connect mutation to save setting changes immediately via `PATCH /api/me/notifications`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run libs/web/screens/src/components/__tests__/notification-settings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/screens/src/components/NotificationSettingsModal.tsx libs/web/screens/src/components/AccountMenu.tsx libs/web/i18n/src/vi.ts libs/web/i18n/src/en.ts libs/web/screens/src/components/__tests__/notification-settings.test.tsx
git commit -m "feat(web): add email notification settings modal to AccountMenu (#84)"
```

---

### Task 7: Full Test Suite Verification & Setup Documentation

**Files:**
- Modify: `docs/setup.md`
- Test: All repository unit & integration tests

- [ ] **Step 1: Document `RESEND_API_KEY` configuration**

In `docs/setup.md`, add a section under §4 (Environment Secrets) explaining `RESEND_API_KEY` setup for Cloudflare Workers and optional sender email configuration.

- [ ] **Step 2: Run complete unit and integration test suite**

Run: `npx vitest run`
Expected: ALL test suites PASS.

- [ ] **Step 3: Run TypeScript typecheck across workspace**

Run: `npm run typecheck` or `npx nx run-many -t typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add docs/setup.md
git commit -m "docs: add email service configuration to setup guide (#84)"
```
