# Transaction Email Notifications & Loan Reminders: Design

Date: 2026-11-08. Status: Ready for User Approval.
Related Epic: #81
Issue Ticket: #84

## 1. Intent & The Why

Coin Crew enables groups and sports clubs to manage shared expenses, record payments, and track balances. However, members who do not actively keep the web app open often miss when expenses are created, modified, or settled. Furthermore, in long-running groups and sports clubs, debts linger because members forget about their outstanding balances ("loans" / unsettled negative balances).

Issue #84 requests email notifications triggered by:
1. **Transaction CRUD events** (creation, update, deletion of expenses and payments).
2. **Periodic loan reminders** to nudge members with outstanding negative balances to settle up.
3. **Monthly notices** providing a high-level summary of club finances and personal dues.
4. **User notification settings** so members can control their email preferences.

Automated, clear email updates keep club members accountable, accelerate debt settlement, and give admins and players visibility without requiring constant manual reminders in chat groups.

---

## 2. Goals, Non-Goals, & Anti-Goals

### Goals
1. **Notification Settings & Preferences**:
   - Provide user-level notification settings in the web app.
   - Allow users with linked emails to toggle preferences:
     - Transaction updates (create, update, delete).
     - Loan / debt reminders.
     - Monthly group financial notices.
2. **Transaction CRUD Email Dispatch**:
   - On **Expense Approved**: Notify participants involved in the split (or immediately on creation if auto-approved).
   - On **Expense Updated**: Notify affected participants if the amount, description, or shares changed.
   - On **Expense Deleted / Rejected**: Notify participants that an expense was removed or invalidated.
   - On **Payment Recorded (`says_paid`)**: Notify the recipient that a payment was marked as sent and prompt them to confirm.
   - On **Payment Confirmed (`confirmed`)**: Send a receipt confirmation email to the payer.
   - Never send an alert to the person who performed the action (the author).
3. **Consolidated Loan / Debt Reminders**:
   - Automated weekly digest (Monday mornings) aggregating all active groups where the user has an unsettled negative balance (`balance < 0`).
   - Group admin manual action in group management ("Remind debtors") to trigger on-demand nudges for a specific group.
   - Include direct breakdown of debts per group, who to pay, and a direct deep-link button ("Pay via VietQR") to the web app settlement screen with live bank details.
   - Enforce a 7-day cooldown per group in automated crons to prevent notification fatigue.
4. **Consolidated Monthly Notice**:
   - Scheduled monthly digest (run on the 1st of each month for the preceding calendar month).
   - Combined email summarizing all active clubs/groups the user participated in: total club spending, member's individual contribution, and net standing at month end.
5. **Secure, Reliable Delivery on Cloudflare Workers**:
   - Use an HTTPS-based email provider compatible with Cloudflare Workers (Resend REST API).
   - Abstract behind an `EmailService` interface to support local development and mock delivery in CI/e2e.
   - Asynchronous dispatch via `ctx.waitUntil(...)` so transaction write latency is unaffected.
6. **Responsive Email Templates & i18n**:
   - Clean, branded, mobile-responsive HTML templates with plain-text fallbacks.
   - Support Vietnamese (`vi`) and English (`en`) based on user/group language preference.

### Non-Goals
- **No In-App Push / WebPush / Zalo ZNS in this spec**: Delivery is strictly focused on email notifications as specified in issue #84.
- **No Email for Users Without Linked Email**: Users who authenticate solely via Zalo or guests without an email address are gracefully skipped without failing transactions or throwing runtime errors.
- **No Direct VietQR Image Embedding in Emails**: Avoid embedding static QR images in emails due to email client privacy blockers and outdated bank detail risks; emails link directly to the app's live VietQR modal.

### Anti-Goals (Failure Criteria)
- **Spamming Uninvolved Members**: Sending an expense notification to group members who have 0 share and are not payers.
- **Blocking API Latency**: A slow or failing external email provider causing transaction creation or edits to fail or hang.
- **Email Flooding**: Sending separate emails per group on scheduled crons (combined digest required), repeatedly emailing users on rapid successive edits, or spamming daily debt reminders.
- **Privacy Leakage**: Exposing recipient email addresses to other members (all recipient emails are addressed individually).
- **Spamming Draft / Inactive Data**: Crons must skip archived groups (`archived_at IS NOT NULL`), 1-on-1 bilateral ledgers (`preset = 'direct'`), and months with zero transactions.

---

## 3. Constraints
- **Cloudflare Workers Environment**: The API runs on Cloudflare Workers; standard Node.js TCP socket libraries (like `nodemailer` with direct SMTP) cannot be used without external HTTP API bridges. An HTTP REST email client (e.g. Resend) is required.
- **Database**: Cloudflare D1 with Drizzle ORM.
- **Security & Secrets**: Email API keys stored in Cloudflare Worker secrets (`RESEND_API_KEY`).
- **Monorepo Architecture**:
  - `apps/api`: API routes, event triggers, scheduled cron handler, email dispatcher.
  - `libs/api/db`: Drizzle schema migrations for notification settings and reminder logs.
  - `libs/web/screens`: User settings UI for notification preferences.
  - `libs/web/i18n`: Internationalized strings for settings UI and email templates.

---

## 4. Decisions Made

### 4.1 Architecture & Email Provider
- **Provider**: Resend via REST API (`https://api.resend.com/emails`).
- **Interface**:
  ```ts
  export interface EmailService {
    send(payload: {
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<{ success: boolean; error?: string }>;
  }
  ```
- **Fallback / Mock**: If `RESEND_API_KEY` is not configured (e.g. in local development or unit tests), `ConsoleEmailService` logs email payloads without failing.

### 4.2 Database Schema

1. **`user_notification_settings` table**:
   - `userId`: `text('user_id').primaryKey().references(() => users.id)`
   - `transactionCrud`: `integer('transaction_crud').notNull().default(1)`
   - `loanReminders`: `integer('loan_reminders').notNull().default(1)`
   - `monthlyNotice`: `integer('monthly_notice').notNull().default(1)`
   - `updatedAt`: `text('updated_at').notNull()`

2. **`notification_logs` table** (for throttling, cooldown, and audit):
   - `id`: `text('id').primaryKey()`
   - `userId`: `text('user_id').notNull().references(() => users.id)`
   - `tripId`: `text('trip_id').references(() => trips.id)` (nullable for multi-group digests)
   - `type`: `text('type', { enum: ['transaction_crud', 'loan_reminder', 'monthly_notice'] }).notNull()`
   - `referenceId`: `text('reference_id').notNull()` (e.g. `expense_root_id`, `payment_id`, or `YYYY-MM` month code)
   - `sentAt`: `text('sent_at').notNull()`
   - Index on `(userId, tripId, type, sentAt)`.

### 4.3 Trigger & Event Handling

#### A. Transaction Lifecycle Triggers
- **Expense Created / Approved**:
  - Triggered in `createExpense` when initial status is `approved`, or in `approveExpense` when a pending expense is approved.
  - Recipients: Non-author participants who have `amount > 0` and `transactionCrud = 1`.
- **Expense Updated**:
  - Triggered in `updateExpense` when amount, description, or shares change.
  - Recipients: Affected participants who have `transactionCrud = 1`.
- **Expense Deleted / Rejected**:
  - Triggered in `disableExpense` or `rejectExpense`.
  - Recipients: Affected participants who have `transactionCrud = 1`.
- **Payment Recorded**:
  - Triggered in `createPayment` (`says_paid`).
  - Recipient: Payment recipient (`toId`), prompting them to confirm receipt.
- **Payment Confirmed**:
  - Triggered in `confirmPayment`.
  - Recipient: Payer (`payerId`), providing a receipt confirmation.
- **Dispatch Execution**: Handled asynchronously via `ctx.waitUntil(dispatchEmail(...))` so HTTP responses return in < 50ms.

#### B. Scheduled Crons (Consolidated User Digests)
- **Eligibility Filter**:
  - Only active groups (`archived_at IS NULL` and `preset != 'direct'`).
  - Users with valid linked email and corresponding preference enabled.
- **Weekly Loan Reminders (Monday 9:00 AM ICT / 02:00 UTC)**:
  - Aggregates all qualifying groups where the user has an outstanding debt (`balance < 0`).
  - Checks `notification_logs` to ensure no reminder for that group was sent to the user within the last 7 days.
  - Sends a single consolidated email: lists each club, current amount owed, who to pay, and a "Pay via VietQR" button deep-linking to `APP_ORIGIN/g/:groupToken#settle`.
- **Monthly Notice (1st of each month 8:00 AM ICT / 01:00 UTC)**:
  - Summarizes the preceding month for all active groups the user participated in.
  - If a group had zero transactions during that month, it is excluded.
  - Consolidated email displays: group name, total group spend, user's total paid, user's total share, and closing balance.

#### C. Group Admin Manual Nudge
- Group admin can click "Remind Debtors" in group settings/management.
- Calls `POST /api/trips/:id/remind-debtors`.
- Sends an immediate reminder to debtors in this group who have an email and `loanReminders = 1`.
- Bypasses the 7-day automated cron cooldown, but writes to `notification_logs` so the automated weekly cron will not double-email them within the next 7 days.

### 4.4 User Settings UI
- Located in the profile / account settings modal under a new section: **"Email Notifications" / "Thông báo qua Email"**.
- Three toggle controls:
  - "Transaction activity (created, edited, deleted)" / "Biến động giao dịch (thêm, sửa, xoá)"
  - "Loan & balance reminders" / "Nhắc nhở khoản nợ & số dư"
  - "Monthly group financial notice" / "Báo cáo thu chi hàng tháng"
- If the user has no linked email (e.g. Zalo-only account without email), the UI informs them to link Google to receive email updates.

---

## 5. What's Left to the Builder
- Choice of templating utility (lightweight HTML template functions with clean responsive inline CSS).
- Exact subject line phrasing and localization assets in `vi.ts` / `en.ts`.
- Worker cron configuration in `wrangler.deploy.jsonc` (`[triggers] crons = ["0 2 * * 1", "0 1 1 * *"]`).
- Unit and integration tests covering lifecycle triggers, consolidated digest aggregation, cooldown logic, and mocked `EmailService`.
