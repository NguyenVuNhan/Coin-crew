# Sport Session Planning Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable sport group admins to create and share cropping-free planned sport sessions (with reusable locations, court time slots, optional env-gated Gemini screenshot extraction, and 3-column headcount cards) and transition them into finalized split expenses after the session completes.

**Architecture:** Planned sessions are persisted as `transactions` rows (`type = 'expense'`, `splitMode = 'amounts'`, `amount = 0`, `meta.sport.planning = true`) with 0-amount `transactionShares` rows so they appear in the unified expense feed, support immutable version history on completion, and never impact member or fund balances while in planning mode. Reusable group locations live in a new `trip_locations` D1 table included in `TripSnapshot`, and optional booking screenshot extraction calls the Gemini REST API when `GEMINI_API_KEY` is configured.

**Tech Stack:** Cloudflare Workers, Hono, Drizzle ORM, SQLite/D1, Gemini REST API (`generateContent`), React 19, Tailwind CSS v4, HTML5 Canvas, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-sport-planning-mode-design.md`

## Global Constraints

- **Design System ("The Friendly Ledger", `.impeccable/design.json`)**: Every colour must use theme tokens (`bg-background`, `bg-card`, `border-border`, `bg-primary`, `bg-secondary text-secondary-foreground`, `bg-muted text-muted-foreground`); never use raw hex in React components (enforced by `style-guard.test.ts`), never use money colours (`success`, `warning`, `danger`) for planning badges or schedule callouts, never nest cards inside cards, and keep all interactive targets at least `min-h-11` (44px) and inputs at `16px` text.
- **Zero Balance & Notification Impact While Planning**: Any expense with `isPlanningExpense(e) === true` (`e.meta?.sport?.planning === true`) must be excluded from `toLedger`, `fundSummary`, `/pay-info`, `/qr.png`, and bill-payment email notifications until completed (`planning: false`).
- **Admin Permission Boundary (`plan_session`)**: Creating a planning session, managing `trip_locations`, invoking `POST /api/trips/:id/sport-booking/extract`, and editing or completing a planning session require `can(actor, 'plan_session')` (`actor.kind === 'member' && (Boolean(actor.isAdmin) || actor.isOrganiser)`).
- **Co-Admin Handoff**: Any group admin in the trip can edit or complete a planning session (`ctx.isPlanning === true`) even if another admin created it; upon completion (`PATCH` with `planning: false`), the new version's `createdByParticipantId` becomes the completing admin and standard creator-only `edit_expense` rules apply thereafter.
- **Env-Gated AI Extraction**: `POST /api/trips/:id/sport-booking/extract` and the UI's **"✨ Đọc từ ảnh đặt sân"** trigger are only active when `GEMINI_API_KEY` is configured in the Worker environment (`view.aiBookingExtract === true`).
- **No Cloudflare R2 Dependency**: Attached booking screenshots are compressed client-side to WebP/JPEG data URLs (`<= 80_000` chars) stored in `meta.sport.bookingImageDataUrl`.

## Review Focus

1. **Co-admin completing a planning session created by another admin**: `PATCH /api/trips/:id/expenses/:eid` succeeds (`200`), supersedes the planning version, sets `createdByParticipantId` on the completed head to the completing co-admin, and updates group balances (`Tested in Task 3`).
2. **Non-admin member or guest attempting to create/edit a planning session or call AI extract**: Rejected with `403 FORBIDDEN` on `POST /expenses` (when `planning: true`), `PATCH /expenses/:eid` (when head is planning), `POST /locations`, and `POST /sport-booking/extract` (`Tested in Tasks 2, 3, 4`).
3. **Planning session with pre-filled court cost (`court: 168000`) while `planning: true`**: Stored with `amount: 0` and `meta.sport.court: 168000`; does not alter `view.balances`, `view.myBalance`, `view.suggestions`, or `view.fund`, and `/qr.png` returns `404` (`Tested in Task 3`).
4. **Gemini API returns markdown-fenced JSON or partial fields / missing `GEMINI_API_KEY`**: Missing `GEMINI_API_KEY` returns `501 NOT_IMPLEMENTED` and `view.aiBookingExtract === false`; partial or fenced LLM output is sanitized into valid `ExtractedSportBooking` with `null` defaults (`Tested in Task 4`).
5. **Style-guard compliance on new UI components**: All new/updated React components in `libs/web/screens` pass `style-guard.test.ts` with zero raw hex colours, zero forbidden money-colour decorations, and 44px touch targets (`Tested in Task 6`).

---

### Task 1: Core Permissions, Types, Planning Helpers & D1 Schema (`0020_sport_planning_locations.sql`)

**Files:**
- Create: `apps/api/migrations/0020_sport_planning_locations.sql`
- Modify: `libs/shared/core/src/permissions.ts`
- Modify: `libs/shared/core/src/api-types.ts`
- Modify: `libs/shared/core/src/fund.ts`
- Modify: `libs/shared/core/src/index.ts`
- Modify: `libs/api/db/src/schema.ts`
- Modify: `libs/api/db/src/env.ts`
- Test: `libs/shared/core/src/__tests__/planning-permissions.test.ts`
- Test: `apps/api/test/migration-0020.test.ts`

**Interfaces:**
- Consumes: `Actor`, `Action`, `ActionContext` from `libs/shared/core/src/permissions.ts`; `ExpenseMeta` from `libs/shared/core/src/api-types.ts`.
- Produces:
  - `Action` union including `'plan_session'`, `ActionContext` with `isPlanning?: boolean`.
  - `isPlanningExpense(e: { meta?: ExpenseMeta | null }): boolean` in `@cc/core`.
  - Types in `@cc/core`: `SportCourtSlot`, `SportLocationSnapshot`, `TripLocationView`, `TripLocationInput`, `ExtractedSportBooking`, updated `ExpenseSportMeta` and `TripView`.
  - Drizzle table `tripLocations` in `@cc/api-db/schema` and `GEMINI_API_KEY?: string`, `GEMINI_MODEL?: string` in `@cc/api-db/env`.

- [ ] **Step 1: Write the failing unit and migration tests**

Create `libs/shared/core/src/__tests__/planning-permissions.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { can, isPlanningExpense, fundSummary, type Actor } from '../index';

const admin: Actor = { kind: 'member', participantId: 'p-1', participantPending: false, isOrganiser: false, isAdmin: true };
const organiser: Actor = { kind: 'member', participantId: 'p-0', participantPending: false, isOrganiser: true, isAdmin: false };
const member: Actor = { kind: 'member', participantId: 'p-2', participantPending: false, isOrganiser: false, isAdmin: false };
const guest: Actor = { kind: 'guest', participantId: 'p-3', participantPending: false, isOrganiser: false };

describe('planning permissions and helpers', () => {
  it('grants plan_session only to group admins and organisers', () => {
    expect(can(admin, 'plan_session')).toBe(true);
    expect(can(organiser, 'plan_session')).toBe(true);
    expect(can(member, 'plan_session')).toBe(false);
    expect(can(guest, 'plan_session')).toBe(false);
  });

  it('allows any group admin to edit or delete a planning expense regardless of creator', () => {
    expect(can(admin, 'edit_expense', { expenseCreatedById: 'p-0', expenseStatus: 'approved', isPlanning: true })).toBe(true);
    expect(can(organiser, 'edit_expense', { expenseCreatedById: 'p-1', expenseStatus: 'approved', isPlanning: true })).toBe(true);
    expect(can(member, 'edit_expense', { expenseCreatedById: 'p-0', expenseStatus: 'approved', isPlanning: true })).toBe(false);
    // Once completed (isPlanning: false), creator-only rule applies
    expect(can(admin, 'edit_expense', { expenseCreatedById: 'p-0', expenseStatus: 'approved', isPlanning: false })).toBe(false);
  });

  it('identifies planning expenses and excludes them from fundSummary', () => {
    const planned = {
      amount: 168000,
      status: 'approved',
      meta: {
         paidFromFund: true,
        sport: { planning: true, court: 168000, shuttlecocks: [], extra: 0, rule: { kind: 'equal' as const }, entries: [], maleSlotRate: 0, femaleSlotRate: 0 },
      },
    };
    expect(isPlanningExpense(planned)).toBe(true);
    expect(fundSummary([{ id: 'i1', amount: 500000, status: 'approved' }], [planned])).toEqual({
      balance: 500000,
      added: 500000,
      spent: 0,
    });
  });
});
```

Create `apps/api/test/migration-0020.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tripLocations } from '@cc/api-db/schema';

describe('0020_sport_planning_locations schema', () => {
  it('defines tripLocations table columns', () => {
    expect(tripLocations).toBeDefined();
    expect(tripLocations.id).toBeDefined();
    expect(tripLocations.tripId).toBeDefined();
    expect(tripLocations.name).toBeDefined();
    expect(tripLocations.address).toBeDefined();
    expect(tripLocations.phone).toBeDefined();
    expect(tripLocations.mapUrl).toBeDefined();
    expect(tripLocations.notes).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run libs/shared/core/src/__tests__/planning-permissions.test.ts apps/api/test/migration-0020.test.ts`
Expected: FAIL (`isPlanningExpense` and `tripLocations` not defined).

- [ ] **Step 3: Implement permissions, types, `isPlanningExpense`, Drizzle schema, and SQL migration**

1. In `libs/shared/core/src/permissions.ts`:
   - Add `'plan_session'` to `Action`.
   - Add `isPlanning?: boolean;` to `ActionContext`.
   - In `can()`:
     - Under `case 'edit_expense': case 'delete_expense':`, if `ctx.isPlanning === true`, return `isMember && isAdmin`.
     - Add `case 'plan_session':` to the `isMember && isAdmin` group (lines 57–68).
2. In `libs/shared/core/src/api-types.ts`:
   - Define and export:
     ```ts
     export interface SportCourtSlot {
       courtName: string;
       timeRange: string;
     }

     export interface SportLocationSnapshot {
       locationId?: string | null;
       name: string;
       address: string;
       phone?: string | null;
       mapUrl?: string | null;
     }

     export interface TripLocationView {
       id: string;
       name: string;
       address: string;
       phone: string | null;
       mapUrl: string | null;
       notes: string | null;
     }

     export interface TripLocationInput {
       name: string;
       address: string;
       phone?: string | null;
       mapUrl?: string | null;
       notes?: string | null;
     }

     export interface ExtractedSportBooking {
       clubName: string | null;
       address: string | null;
       phone: string | null;
       date: string | null;
       bookingCode: string | null;
       totalDuration: string | null;
       totalAmount: number | null;
       courtSlots: SportCourtSlot[];
     }
     ```
   - Extend `ExpenseSportMeta` with optional fields: `planning?: boolean; location?: SportLocationSnapshot | null; courtSlots?: SportCourtSlot[]; bookingCode?: string | null; totalDuration?: string | null; bookingImageDataUrl?: string | null;`.
   - Extend `TripView` with optional fields: `locations?: TripLocationView[]; aiBookingExtract?: boolean;`.
3. In `libs/shared/core/src/fund.ts` (and re-export in `libs/shared/core/src/index.ts`):
   - Add `export function isPlanningExpense(e: { meta?: ExpenseMeta | null }): boolean { return e.meta?.sport?.planning === true; }`.
   - In `fundEffect(item: FundItem)`, return `0` when `item.kind === 'expense' && isPlanningExpense(item)`.
4. In `libs/api/db/src/env.ts`:
   - Add `GEMINI_API_KEY?: string;` and `GEMINI_MODEL?: string;` to `Env`.
5. In `libs/api/db/src/schema.ts` and `apps/api/migrations/0020_sport_planning_locations.sql`:
   - Define `tripLocations = sqliteTable('trip_locations', { id, tripId, name, address, phone, mapUrl, notes, createdAt, updatedAt }, (t) => [index('trip_locations_trip_id_idx').on(t.tripId)])`.
   - Write the corresponding `CREATE TABLE trip_locations` and `CREATE INDEX trip_locations_trip_id_idx` in `apps/api/migrations/0020_sport_planning_locations.sql`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run libs/shared/core/src/__tests__/planning-permissions.test.ts apps/api/test/migration-0020.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/shared/core/src/permissions.ts libs/shared/core/src/api-types.ts libs/shared/core/src/fund.ts libs/shared/core/src/index.ts libs/shared/core/src/__tests__/planning-permissions.test.ts libs/api/db/src/env.ts libs/api/db/src/schema.ts apps/api/migrations/0020_sport_planning_locations.sql apps/api/test/migration-0020.test.ts
git commit -m "feat(core,db): add sport planning permissions, types, and trip_locations schema (#83)"
```

---

### Task 2: Group Locations CRUD API & Snapshot Integration

**Files:**
- Create: `apps/api/src/trips/locations.ts`
- Modify: `apps/api/src/trips/snapshot.ts`
- Modify: `apps/api/src/trips/view.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/trip-locations.test.ts`

**Interfaces:**
- Consumes: `tripLocations` from `@cc/api-db/schema`, `TripLocationView`, `TripLocationInput`, `can` from `@cc/core`.
- Produces:
  - `locationRoutes(): Hono<AppBindings>` mounted at `/api` providing `POST /api/trips/:id/locations`, `PATCH /api/trips/:id/locations/:locationId`, and `DELETE /api/trips/:id/locations/:locationId`.
  - `TripSnapshot.locations: TripLocationView[]` and `TripView.aiBookingExtract: boolean`.

- [ ] **Step 1: Write the failing API test for locations and snapshot fields**

Create `apps/api/test/trip-locations.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripLocationView, TripView } from '@cc/core';
import { call, json, seedTrip, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

beforeEach(async () => {
  await seedTrip();
  await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
});

describe('trip locations CRUD & TripView integration', () => {
  it('allows an admin to create, update, and delete a saved location and exposes it in TripView', async () => {
    const headers = await minh();
    const createRes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sân Cầu Lông Putin - 158 Phú Diễn',
        address: '158 Phú Diễn, Phường Phú Diễn, Hà Nội',
        phone: '0345747800',
        mapUrl: 'https://maps.app.goo.gl/xyz123',
      }),
    });
    expect(createRes.status).toBe(201);
    const { location } = await json<{ location: TripLocationView }>(createRes);
    expect(location.name).toBe('Sân Cầu Lông Putin - 158 Phú Diễn');

    const v1 = await json<TripView>(call(base, { headers }));
    expect(v1.locations).toHaveLength(1);
    expect(v1.locations?.[0]?.phone).toBe('0345747800');
    expect(v1.aiBookingExtract).toBe(false);

    const patchRes = await call(`${base}/locations/${location.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân Putin Cơ Sở 1', address: '158 Phú Diễn, Hà Nội' }),
    });
    expect(patchRes.status).toBe(200);

    const delRes = await call(`${base}/locations/${location.id}`, { method: 'DELETE', headers });
    expect(delRes.status).toBe(200);

    const v2 = await json<TripView>(call(base, { headers }));
    expect(v2.locations).toEqual([]);
  });

  it('rejects non-admin members, guests, and invalid mapUrl schemes', async () => {
    const g = await guestHeaders(PID.C);
    const guestRes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...g, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN' }),
    });
    expect(guestRes.status).toBe(403);

    const headers = await minh();
    const badUrlRes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN', mapUrl: 'javascript:alert(1)' }),
    });
    expect(badUrlRes.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/test/trip-locations.test.ts`
Expected: FAIL (`404` on `/locations`).

- [ ] **Step 3: Implement `apps/api/src/trips/locations.ts` and wire into `snapshot.ts`, `view.ts`, and `app.ts`**

1. Create `apps/api/src/trips/locations.ts` exporting `locationRoutes(): Hono<AppBindings>`:
   - Validate `assertWritable(actor.trip)` and `ensure(actor, 'plan_session')` on all three routes.
   - Validate `TripLocationInput`: `name` trimmed 1–120 chars, `address` trimmed 1–200 chars, optional `phone` trimmed `<= 30` chars, optional `mapUrl` trimmed `<= 500` chars matching `/^https?:\/\/\S+$/i`, optional `notes` trimmed `<= 200` chars (`422 VALIDATION` on failure).
   - Call `commitTripWrite` (from `./write`) so `trip_views` snapshot cache is refreshed when locations change.
2. In `apps/api/src/trips/snapshot.ts`:
   - Query `tripLocations` where `eq(tripLocations.tripId, trip.id)` ordered by `asc(tripLocations.createdAt)` and include `locations: TripLocationView[]` in `buildSnapshot`.
3. In `apps/api/src/trips/view.ts`:
   - Set `aiBookingExtract: Boolean(env.GEMINI_API_KEY) && can(actor, 'plan_session')` on the returned `TripView`.
4. Mount `app.route('/api', locationRoutes())` in `apps/api/src/app.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/test/trip-locations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/trips/locations.ts apps/api/src/trips/snapshot.ts apps/api/src/trips/view.ts apps/api/src/app.ts apps/api/test/trip-locations.test.ts
git commit -m "feat(api): add trip locations CRUD and TripView exposure (#83)"
```

---

### Task 3: Planning Expense Validation, Balance/QR Isolation & Completion Lifecycle

**Files:**
- Modify: `apps/api/src/expenses/routes.ts`
- Modify: `apps/api/src/trips/snapshot.ts`
- Modify: `apps/api/src/bank/routes.ts`
- Modify: `apps/api/src/og/billQr.ts`
- Test: `apps/api/test/sport-planning-expenses.test.ts`

**Interfaces:**
- Consumes: `isPlanningExpense`, `can`, `ExpenseSportMeta`, `ExpenseInput` from `@cc/core`.
- Produces:
  - Updated `POST /api/trips/:id/expenses` and `PATCH /api/trips/:id/expenses/:eid` supporting `meta.sport.planning === true` and completion (`planning: true` → `planning: false`).
  - Balance, fund, `/pay-info`, `/qr.png`, and notification isolation while `isPlanningExpense` is true.

- [ ] **Step 1: Write the failing API tests for planning creation, isolation, and co-admin completion**

Create `apps/api/test/sport-planning-expenses.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpenseInput, TripView } from '@cc/core';
import { call, json, seedTrip, seedUser, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const anMember = async () => ({ Cookie: `sid=${await memberSid(U.an, 'An')}` });

beforeEach(async () => {
  await seedTrip();
  await seedUser(U.an, 'An');
  await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
  await env.DB.prepare("UPDATE participants SET user_id = ?, gender = 'M' WHERE id = ?").bind(U.an, PID.A).run();
  await env.DB.prepare("UPDATE participants SET gender = 'F' WHERE id = ?").bind(PID.M).run();
});

describe('sport planning expenses lifecycle', () => {
  const planningInput: ExpenseInput = {
    description: 'Cầu lông sáng CN',
    amount: 0,
    spentOn: '2026-11-08',
    payerId: PID.M,
    mode: 'amounts',
    entries: [
      { participantId: PID.M, value: 0 },
      { participantId: PID.A, value: 0 },
    ],
    meta: {
      sport: {
        planning: true,
        location: {
          name: 'Sân Cầu Lông Putin - 158 Phú Diễn',
          address: '158 Phú Diễn, Phường Phú Diễn, Hà Nội',
          phone: '0345747800',
          mapUrl: 'https://maps.app.goo.gl/xyz123',
        },
        courtSlots: [
          { courtName: 'Cầu Lông 6', timeRange: '05:00 - 07:00' },
          { courtName: 'Cầu Lông 5', timeRange: '05:30 - 07:00' },
        ],
        bookingCode: '#4139',
        totalDuration: '3h30p',
        court: 168000,
        shuttlecocks: [],
        extra: 0,
        rule: { kind: 'equal' },
        entries: [
          { participantId: PID.M, maleSlots: 0, femaleSlots: 1 },
          { participantId: PID.A, maleSlots: 1, femaleSlots: 0 },
        ],
        maleSlotRate: 0,
        femaleSlotRate: 0,
      },
    },
  };

  it('creates a planning session with 0 balance impact and hides QR/pay-info', async () => {
    const headers = await minh();
    const res = await call(`${base}/expenses`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(planningInput),
    });
    expect(res.status).toBe(201);
    const { expenseId } = await json<{ expenseId: string }>(res);

    const v = await json<TripView>(call(base, { headers }));
    const exp = v.expenses.find((e) => e.id === expenseId);
    expect(exp?.amount).toBe(0);
    expect(exp?.meta?.sport?.planning).toBe(true);
    expect(exp?.meta?.sport?.court).toBe(168000);
    expect(exp?.meta?.sport?.courtSlots).toHaveLength(2);
    expect(v.balances[PID.M]).toBe(0);
    expect(v.balances[PID.A]).toBe(0);
    expect(v.suggestions).toEqual([]);

    const qrRes = await call(`/j/${T.groupToken}/e/${expenseId}/qr.png`);
    expect(qrRes.status).toBe(404);
  });

  it('rejects planning creation from non-admin members and guests', async () => {
    const nonAdmin = await anMember();
    const res1 = await call(`${base}/expenses`, {
      method: 'POST',
      headers: { ...nonAdmin, 'Content-Type': 'application/json' },
      body: JSON.stringify(planningInput),
    });
    expect(res1.status).toBe(403);

    const guest = await guestHeaders(PID.C);
    const res2 = await call(`${base}/expenses`, {
      method: 'POST',
      headers: { ...guest, 'Content-Type': 'application/json' },
      body: JSON.stringify(planningInput),
    });
    expect(res2.status).toBe(403);
  });

  it('allows a co-admin to complete the planning session into a real bill and preserves history', async () => {
    const minhHeaders = await minh();
    const { expenseId } = await json<{ expenseId: string }>(
      call(`${base}/expenses`, {
        method: 'POST',
        headers: { ...minhHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(planningInput),
      }),
    );

    // Promote An to co-admin
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.A).run();
    const anHeaders = await anMember();

    const completedInput: ExpenseInput = {
      description: 'Cầu lông sáng CN',
      amount: 220000,
      spentOn: '2026-11-08',
      payerId: PID.M,
      mode: 'amounts',
      entries: [
        { participantId: PID.M, value: 110000 },
        { participantId: PID.A, value: 110000 },
      ],
      meta: {
        sport: {
          ...planningInput.meta!.sport!,
          planning: false,
          shuttlecocks: [{ qty: 2, unitPrice: 26000 }],
          maleSlotRate: 110000,
          femaleSlotRate: 110000,
        },
      },
    };

    const patchRes = await call(`${base}/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: { ...anHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(completedInput),
    });
    expect(patchRes.status).toBe(200);

    const v = await json<TripView>(call(base, { headers: minhHeaders }));
    const updated = v.expenses.find((e) => e.rootId === expenseId);
    expect(updated?.amount).toBe(220000);
    expect(updated?.meta?.sport?.planning).toBeFalsy();
    expect(updated?.history).toHaveLength(1);
    expect(updated?.history?.[0]?.amount).toBe(0);
    expect(v.balances[PID.M]).toBe(110000);
    expect(v.balances[PID.A]).toBe(-110000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/test/sport-planning-expenses.test.ts`
Expected: FAIL (`422 INVALID_AMOUNT` when `amount: 0`).

- [ ] **Step 3: Implement planning expense validation, balance isolation, QR guard, and completion notification**

1. In `apps/api/src/expenses/routes.ts`:
   - In `validateExpenseInput`:
     - Validate `meta.sport` extended fields (`location`, `courtSlots` up to 10 items with `courtName` 1–40 chars and `timeRange` 1–40 chars, `bookingCode` `<= 40` chars, `totalDuration` `<= 40` chars, `bookingImageDataUrl` `<= 80_000` chars starting with `data:image/`).
     - When `meta?.sport?.planning === true`:
       - Require `mode === 'amounts'` and `!meta.paidFromFund`.
       - Allow `amount === 0`, `court >= 0`, `shuttlecocks` (`[]` or valid rows), `extra >= 0`.
       - Require `entries` in `meta.sport.entries` to have `totalMaleSlots + totalFemaleSlots > 0` and match participant IDs in `body.entries`.
       - Return validated expense with `amount: 0`, `shares` having `amount: 0, inputValue: 0, inputAuto: 0`, and `meta.sport` with `planning: true, maleSlotRate: 0, femaleSlotRate: 0`.
   - In `POST /trips/:id/expenses`:
     - If `isPlanningExpense(validated)` is true, call `ensure(actor, 'plan_session')` and skip `dispatchExpenseNotification`.
   - In `PATCH /trips/:id/expenses/:eid`:
     - Pass `isPlanning: isPlanningExpense(headItem)` in `ensure(actor, 'edit_expense', { expenseCreatedById: head.createdByParticipantId, expenseStatus: head.status as ExpenseStatus, isPlanning: isPlanningExpense(headItem) })`.
     - If `isPlanningExpense(validated)` is true, call `ensure(actor, 'plan_session')` and skip `dispatchExpenseNotification`.
     - If `isPlanningExpense(headItem)` was true and `isPlanningExpense(validated)` is false (transition to completed), call `dispatchExpenseNotification(c, 'approved', head.rootId, ...)` when `head.status === 'approved'`.
2. In `apps/api/src/trips/snapshot.ts`:
   - In `toLedger`, filter `s.expenses.filter((e) => !isFundPaid(e) && !isPlanningExpense(e))`.
3. In `apps/api/src/og/billQr.ts` and `apps/api/src/bank/routes.ts` (when `expenseId` is queried for `pay-info`):
   - Return `null` / `404` if the target expense has `isPlanningExpense(expense) === true`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/test/sport-planning-expenses.test.ts apps/api/test/expenses.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/expenses/routes.ts apps/api/src/trips/snapshot.ts apps/api/src/og/billQr.ts apps/api/src/bank/routes.ts apps/api/test/sport-planning-expenses.test.ts
git commit -m "feat(api): support planning sport sessions and transition to completed bill (#83)"
```

---

### Task 4: Env-Gated Gemini Booking Screenshot Extraction API

**Files:**
- Create: `apps/api/src/expenses/bookingExtract.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/sport-booking-extract.test.ts`

**Interfaces:**
- Consumes: `ExtractedSportBooking`, `can` from `@cc/core`; `Env` from `@cc/api-db/env`.
- Produces: `bookingExtractRoutes(): Hono<AppBindings>` handling `POST /api/trips/:id/sport-booking/extract` with body `{ imageDataUrl: string }` and returning `{ extracted: ExtractedSportBooking }`.

- [ ] **Step 1: Write the failing API test for booking screenshot extraction**

Create `apps/api/test/sport-booking-extract.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExtractedSportBooking } from '@cc/core';
import { call, json, seedTrip, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeEach(async () => {
  await seedTrip();
  await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (env as Record<string, unknown>).GEMINI_API_KEY;
});

describe('POST /api/trips/:id/sport-booking/extract', () => {
  it('returns 501 when GEMINI_API_KEY is not configured', async () => {
    const headers = await minh();
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(501);
  });

  it('rejects guests with 403', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    const g = await guestHeaders(PID.C);
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...g, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(403);
  });

  it('parses structured booking fields from Gemini vision response (including fenced JSON)', async () => {
    (env as Record<string, unknown>).GEMINI_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{"clubName":"Sân Cầu Lông Putin - 158 Phú Diễn","address":"158 Phú Diễn, Phường Phú Diễn, Hà Nội","phone":"0345747800","date":"2026-11-04","bookingCode":"#4139","totalDuration":"3h30p","totalAmount":168000,"courtSlots":[{"courtName":"Cầu Lông 6","timeRange":"5h00 - 7h00"},{"courtName":"Cầu Lông 5","timeRange":"5h30 - 7h00"}]}\n```',
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const headers = await minh();
    const res = await call(`${base}/sport-booking/extract`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: sampleDataUrl }),
    });
    expect(res.status).toBe(200);
    const { extracted } = await json<{ extracted: ExtractedSportBooking }>(res);
    expect(extracted).toEqual({
      clubName: 'Sân Cầu Lông Putin - 158 Phú Diễn',
      address: '158 Phú Diễn, Phường Phú Diễn, Hà Nội',
      phone: '0345747800',
      date: '2026-11-04',
      bookingCode: '#4139',
      totalDuration: '3h30p',
      totalAmount: 168000,
      courtSlots: [
        { courtName: 'Cầu Lông 6', timeRange: '5h00 - 7h00' },
        { courtName: 'Cầu Lông 5', timeRange: '5h30 - 7h00' },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/test/sport-booking-extract.test.ts`
Expected: FAIL (`404` on `/sport-booking/extract`).

- [ ] **Step 3: Implement `apps/api/src/expenses/bookingExtract.ts` and mount in `app.ts`**

1. Create `apps/api/src/expenses/bookingExtract.ts` exporting `bookingExtractRoutes(): Hono<AppBindings>`:
   - Resolve actor with `resolveActor(c, tripId)`, check `assertWritable(actor.trip)` and `ensure(actor, 'plan_session')`.
   - If `!c.env.GEMINI_API_KEY`, throw `new ApiError('NOT_IMPLEMENTED', 501, 'AI extraction is not configured.')`.
   - Parse `{ imageDataUrl }` and validate `/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/` with length `<= 2_000_000` (`422 VALIDATION` otherwise).
   - POST to `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.env.GEMINI_MODEL || 'gemini-2.5-flash-lite')}:generateContent?key=${encodeURIComponent(c.env.GEMINI_API_KEY)}` with `inlineData: { mimeType, data }` and `generationConfig: { responseMimeType: 'application/json' }`.
   - Strip optional markdown code fences before `JSON.parse` and normalize fields into `ExtractedSportBooking` (coercing invalid/missing fields to `null` or `[]`).
2. Mount `app.route('/api', bookingExtractRoutes())` in `apps/api/src/app.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/test/sport-booking-extract.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/expenses/bookingExtract.ts apps/api/src/app.ts apps/api/test/sport-booking-extract.test.ts
git commit -m "feat(api): add env-gated Gemini sport booking screenshot extractor (#83)"
```

---

### Task 5: Planning Canvas PNG Renderer (`Style A` & `Style B`), Image Compression & Zalo Share Text

**Files:**
- Modify: `libs/web/util/src/qr.ts`
- Modify: `libs/web/screens/src/lib/remind.ts`
- Modify: `libs/web/screens/src/lib/shareCards.ts`
- Modify: `libs/web/i18n/src/vi.ts`
- Modify: `libs/web/i18n/src/en.ts`
- Test: `libs/web/util/src/__tests__/qr-planning.test.ts`
- Test: `libs/web/screens/src/__tests__/remind-planning.test.ts`

**Interfaces:**
- Consumes: `SportCourtSlot`, `SportLocationSnapshot` from `@cc/core`.
- Produces:
  - In `@cc/web-util/qr`:
    - `SportPlanningCardInput` interface
    - `renderSportPlanningPng(input: SportPlanningCardInput): Promise<Blob | null>`
    - `shareSportPlanning(input: SportPlanningCardInput, text: string, refCode: string): Promise<'shared' | 'saved' | 'failed'>`
    - `compressBookingImage(file: Blob): Promise<string | null>`
  - In `libs/web/screens/src/lib/remind.ts`:
    - `SportPlanningShareTextInput` interface and `sportPlanningShareText(lang: 'en' | 'vi', input: SportPlanningShareTextInput): string`
  - Bilingual i18n keys in `@cc/web-i18n`.

- [ ] **Step 1: Write the failing unit tests for `sportPlanningShareText` and `renderSportPlanningPng`**

Create `libs/web/screens/src/__tests__/remind-planning.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sportPlanningShareText } from '../lib/remind';

describe('sportPlanningShareText', () => {
  it('formats Vietnamese and English planning messages with location, map link, courts, and slots', () => {
    const input = {
      description: 'Cầu lông sáng CN',
      spentOn: '08/11/2026',
      location: {
        name: 'Sân Cầu Lông Putin - 158 Phú Diễn',
        address: '158 Phú Diễn, Hà Nội',
        phone: '0345747800',
        mapUrl: 'https://maps.app.goo.gl/xyz123',
      },
      courtSlots: [
        { courtName: 'Cầu Lông 6', timeRange: '05:00 - 07:00' },
        { courtName: 'Cầu Lông 5', timeRange: '05:30 - 07:00' },
      ],
      totalFemaleSlots: 7,
      totalMaleSlots: 12,
      link: 'https://coincrew.app/j/tok/e/exp-1',
    };

    const vi = sportPlanningShareText('vi', input);
    expect(vi).toContain('Sân Cầu Lông Putin - 158 Phú Diễn');
    expect(vi).toContain('https://maps.app.goo.gl/xyz123');
    expect(vi).toContain('Cầu Lông 6 (05:00 - 07:00), Cầu Lông 5 (05:30 - 07:00)');
    expect(vi).toContain('19 suất (7 Nữ, 12 Nam)');
    expect(vi).toContain('https://coincrew.app/j/tok/e/exp-1');

    const en = sportPlanningShareText('en', input);
    expect(en).toContain('19 slots (7F, 12M)');
  });
});
```

Create `libs/web/util/src/__tests__/qr-planning.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { renderSportPlanningPng, type SportPlanningCardInput } from '../qr';

describe('renderSportPlanningPng', () => {
  it('renders Style A 3-column headcount table without THÀNH TIỀN or CHI PHÍ rows', async () => {
    const fillTextCalls: string[] = [];
    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'top',
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn((text: string) => fillTextCalls.push(text)),
      drawImage: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => mockCtx,
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    } as unknown as HTMLCanvasElement);

    const input: SportPlanningCardInput = {
      description: 'Cầu lông sáng CN',
      spentOn: '08/11/2026',
      groupName: '5AM BADMINTON',
      location: { name: 'Sân Putin', address: '158 Phú Diễn', phone: '0345747800' },
      courtSlots: [{ courtName: 'Cầu Lông 6', timeRange: '05:00 - 07:00' }],
      bookingCode: '#4139',
      totalDuration: '3h30p',
      totalFemaleSlots: 1,
      totalMaleSlots: 1,
      rows: [
        { name: 'Thủy Nguyễn', femaleSlots: 1, maleSlots: 0 },
        { name: 'Quang', femaleSlots: 0, maleSlots: 1 },
      ],
    };

    const blob = await renderSportPlanningPng(input);
    expect(blob).not.toBeNull();
    expect(fillTextCalls).toContain('TÊN');
    expect(fillTextCalls).toContain('NỮ');
    expect(fillTextCalls).toContain('NAM');
    expect(fillTextCalls).toContain('TỔNG SUẤT (2 suất)');
    expect(fillTextCalls).not.toContain('THÀNH TIỀN');
    expect(fillTextCalls).not.toContain('CHI PHÍ');
    expect(fillTextCalls).not.toContain('MỖI SUẤT');
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run libs/web/screens/src/__tests__/remind-planning.test.ts libs/web/util/src/__tests__/qr-planning.test.ts`
Expected: FAIL (`sportPlanningShareText` and `renderSportPlanningPng` not exported).

- [ ] **Step 3: Implement `renderSportPlanningPng`, `shareSportPlanning`, `compressBookingImage`, `sportPlanningShareText`, and i18n keys**

1. In `libs/web/util/src/qr.ts`:
   - Export `SportPlanningCardInput`:
     ```ts
     export interface SportPlanningCardInput {
       description: string;
       spentOn: string;
       groupName: string;
       location?: SportLocationSnapshot | null;
       courtSlots?: SportCourtSlot[];
       bookingCode?: string | null;
       totalDuration?: string | null;
       totalMaleSlots: number;
       totalFemaleSlots: number;
       rows: { name: string; femaleSlots: number; maleSlots: number }[];
       bookingImageDataUrl?: string | null;
       includeProofImage?: boolean;
     }
     ```
   - Implement `renderSportPlanningPng(input: SportPlanningCardInput): Promise<Blob | null>`:
     - **Style A (default, 1080px wide):** Draws header with description, `${spentOn} · ${groupName}`, Jade Mist badge (`#ccfbf1` fill, `#134e4a` text) `LÊN LỊCH · ${totalSlots} SUẤT`, optional Muted Fill (`#efefeb`) venue & court schedule box, and the 3-column table (`TÊN` width 664, `NỮ` width 160, `NAM` width 160) with `TỔNG SUẤT (${totalSlots} suất)` footer row.
     - **Style B (`input.includeProofImage && input.bookingImageDataUrl`):** Loads `bookingImageDataUrl` into an `Image()`, renders the Style A column on the left (width 900px) and draws the booking proof image scaled proportionally on the right column (width 540px, total canvas width 1488px).
   - Export `shareSportPlanning(input, text, refCode)` mirroring `shareSportBill`.
   - Export `compressBookingImage(file: Blob): Promise<string | null>` drawing the image onto a canvas capped at `720px` max dimension and encoding `canvas.toDataURL('image/webp', 0.75)` (falling back to `'image/jpeg', 0.7` if WebP exceeds 80k chars).
2. In `libs/web/screens/src/lib/remind.ts`:
   - Export `sportPlanningShareText(lang, input)` formatting the schedule, location, map link, court slots, headcount, and session link.
3. In `libs/web/i18n/src/vi.ts` and `libs/web/i18n/src/en.ts`:
   - Add translation keys for `sport.planSession`, `sport.planningBadge`, `sport.completeSession`, `sport.sharePlanning`, `sport.includeProofImage`, `sport.extractFromImage`, `sport.extracting`, `sport.locationLabel`, `sport.addLocation`, `sport.locationName`, `sport.locationAddress`, `sport.locationPhone`, `sport.locationMapUrl`, `sport.openMap`, `sport.courtSlotsLabel`, `sport.addCourtSlot`, `sport.courtNamePlaceholder`, `sport.timeRangePlaceholder`, `sport.bookingCodeLabel`, `sport.savePlanning`, `sport.slotsCount`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run libs/web/screens/src/__tests__/remind-planning.test.ts libs/web/util/src/__tests__/qr-planning.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/util/src/qr.ts libs/web/util/src/__tests__/qr-planning.test.ts libs/web/screens/src/lib/remind.ts libs/web/screens/src/lib/shareCards.ts libs/web/screens/src/__tests__/remind-planning.test.ts libs/web/i18n/src/vi.ts libs/web/i18n/src/en.ts
git commit -m "feat(web): add sport planning PNG renderer, image compressor, and Zalo share text (#83)"
```

---

### Task 6: Floating `+` Menu, Planning List Row, 3-Column `SportBillTable`, `ExpenseDetails` & `ExpenseForm`

**Files:**
- Modify: `libs/web/screens/src/components/AppNav.tsx`
- Modify: `libs/web/screens/src/components/Screen.tsx`
- Modify: `libs/web/screens/src/screens/MemberTrip.tsx`
- Modify: `libs/web/screens/src/components/ExpenseRow.tsx`
- Modify: `libs/web/screens/src/lib/rowActions.ts`
- Modify: `libs/web/screens/src/components/SportBillTable.tsx`
- Modify: `libs/web/screens/src/components/ExpenseDetails.tsx`
- Modify: `libs/web/screens/src/screens/ExpenseForm.tsx`
- Test: `libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`

**Interfaces:**
- Consumes: `isPlanningExpense`, `can`, `TripLocationView`, `ExtractedSportBooking` from `@cc/core`; `renderSportPlanningPng`, `shareSportPlanning`, `compressBookingImage` from `@cc/web-util/qr`; `sportPlanningShareText` from `../lib/remind`.
- Produces:
  - `AppNavProps` with optional `planHref?: string` rendering a 2-option `Popover` (`Lên lịch buổi đánh` and `Thêm chi phí`) when clicked.
  - `SportBillTable` with `planning?: boolean` (3-column mode without money rows).
  - `ExpenseRow` and `ExpenseDetails` planning views + admin `✓ Hoàn tất & Tính tiền` (`?mode=complete`) action.
  - `ExpenseForm` planning creation (`?mode=planning`), planning edit, and completion (`?mode=complete`) workflows.

- [ ] **Step 1: Write the failing component tests for the `+` menu, 3-column `SportBillTable`, `ExpenseRow`, and `ExpenseDetails`**

Create `libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SportBillTable } from '../components/SportBillTable';
import { ExpenseRow } from '../components/ExpenseRow';
import { AppNav } from '../components/AppNav';
import type { ExpenseView, TripView } from '@cc/core';

describe('Sport Planning UI components', () => {
  it('renders SportBillTable in 3-column planning mode without money columns or cost rows', () => {
    render(
      <SportBillTable
        planning
        total={0}
        meId="p-1"
        calc={{
          court: 168000,
          shuttlecocksTotal: 0,
          extra: 0,
          maleSlotRate: 0,
          femaleSlotRate: 0,
          totalFemaleSlots: 7,
          totalMaleSlots: 12,
          participants: [
            { participantId: 'p-1', name: 'Thủy Nguyễn', rosterGender: 'F', femaleSlots: 1, maleSlots: 0, amount: 0 },
            { participantId: 'p-2', name: 'Quang', rosterGender: 'M', femaleSlots: 0, maleSlots: 1, amount: 0 },
          ],
        }}
      />,
    );

    expect(screen.getByText('Thủy Nguyễn (you)')).toBeTruthy();
    expect(screen.queryByText(/AMOUNT|THÀNH TIỀN/i)).toBeNull();
    expect(screen.queryByText(/COSTS|CHI PHÍ/i)).toBeNull();
    expect(screen.queryByText(/PER SLOT|MỖI SUẤT/i)).toBeNull();
  });

  it('renders ExpenseRow with Planning pill and slot count instead of VND amount', () => {
    const expense: ExpenseView = {
      id: 'e-1',
      description: 'Cầu lông sáng CN',
      amount: 0,
      spentOn: '2026-11-08',
      payerId: 'p-1',
      mode: 'amounts',
      status: 'approved',
      rejectReason: null,
      disabledByName: null,
      createdById: 'p-1',
      shares: [{ participantId: 'p-1', amount: 0, inputValue: 0 }],
      meta: {
        sport: {
          planning: true,
          location: { name: 'Sân Putin', address: '158 Phú Diễn' },
          courtSlots: [{ courtName: 'Sân 6', timeRange: '5h-7h' }],
          court: 168000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [{ participantId: 'p-1', femaleSlots: 7, maleSlots: 12 }],
          maleSlotRate: 0,
          femaleSlotRate: 0,
        },
      },
    };
    const view = {
      trip: { id: 't-1', name: '5AM', currency: 'VND', preset: 'sport', fewestTransfers: true, archived: false, version: 1 },
      me: { kind: 'member', participantId: 'p-1', participantPending: false, isOrganiser: true, isAdmin: true },
      people: [{ id: 'p-1', name: 'Thủy', status: 'active', isMember: true, bank: 'approved' }],
      expenses: [expense],
      payments: [],
      balances: { 'p-1': 0 },
      suggestions: [],
      myBalance: null,
      approvals: null,
      links: null,
    } as unknown as TripView;

    render(
      <MemoryRouter>
        <ExpenseRow expense={expense} view={view} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Cầu lông sáng CN')).toBeTruthy();
    expect(screen.getByText(/Sân Putin/)).toBeTruthy();
    expect(screen.getByText(/19/)).toBeTruthy();
  });

  it('opens 2-option menu when clicking + in AppNav with planHref', () => {
    render(
      <MemoryRouter>
        <AppNav section="groups" addHref="/t/t-1/expenses/new" planHref="/t/t-1/expenses/new?mode=planning" />
      </MemoryRouter>,
    );

    const addButtons = screen.getAllByTestId('nav-add');
    fireEvent.click(addButtons[0]!);
    expect(screen.getAllByText(/Plan session|Lên lịch buổi đánh/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx`
Expected: FAIL (`SportBillTable` still renders `AMOUNT` column; `AppNav` does not support `planHref`).

- [ ] **Step 3: Implement the UI components following `.impeccable/design.json`**

1. **`AppNav.tsx`, `Screen.tsx`, `MemberTrip.tsx`**:
   - Add `planHref?: string` to `AppNavProps` and `ScreenProps['nav']`.
   - In `MemberTrip.tsx`, set `planHref` on `nav` to `!archived && view.trip.preset === 'sport' && can(actorOf(view), 'plan_session') ? \`/t/${tripId}/expenses/new?mode=planning\` : undefined`.
   - In `AppNav.tsx`, when `planHref` is defined, wrap the mobile `+` button and desktop `+ Add` button in a `Popover` containing two `min-h-11` rounded links: `planHref` (`t('sport.planSession')`) and `addHref` (`t('trip.addExpense')`).
2. **`ExpenseRow.tsx` & `rowActions.ts`**:
   - In `ExpenseRow.tsx`, when `isPlanningExpense(expense)` is true:
     - Render `<Icon name="calendar" size={20} />` (or `clock` if `calendar` is not in `icons.tsx`, adding `calendar` to `@cc/web-ui/components/icons` if needed).
     - Format subline with `location?.name`, `courtSlots` summary, and total slots.
     - Render total slots count + `<Pill tone="accent">{t('sport.planningBadge')}</Pill>` on the right instead of `<Amount />`.
   - In `rowActions.ts`, pass `isPlanning: isPlanningExpense(e)` to `can(actor, 'edit_expense', ...)`.
3. **`SportBillTable.tsx` & `ExpenseDetails.tsx`**:
   - In `SportBillTable.tsx`, accept `planning?: boolean`. When `planning` is true, render 3 columns (`TÊN`, `NỮ`, `NAM`) and only the `TỔNG SUẤT` footer row.
   - In `ExpenseDetails.tsx`, when `isPlanningExpense(e)` is true:
     - Render `<Pill tone="accent">{t('sport.planningBadge')}</Pill>` in header and `{totalSlots} {t('sport.slotsCount')}` hero text instead of `<Amount />`.
     - Render `<dl className="fsl-details__facts">` rows for Date, Location name, Location address (with `Mở bản đồ ↗` link if `mapUrl` is set), Phone, Booked Court Slots, and Booking Code/Duration.
     - Render `<SportBillTable calc={sportCalc} total={0} meId={view.me.participantId} planning />`.
     - When `can(actorOf(view), 'plan_session')` is true:
       - Render the planning share card with the optional `includeProofImage` checkbox (shown when `e.meta?.sport?.bookingImageDataUrl` exists) and the primary Jade button `t('sport.sharePlanning')` calling `renderSportPlanningPng` / `shareSportPlanning`.
       - Render the secondary Jade Mist button `t('sport.completeSession')` (`✓ Hoàn tất & Tính tiền`) navigating to `${base}/expenses/${e.id}/edit?mode=complete`.
4. **`ExpenseForm.tsx`**:
   - Read `searchParams.get('mode')`:
     - `isPlanningMode = (searchParams.get('mode') === 'planning' || Boolean(expense?.meta?.sport?.planning)) && searchParams.get('mode') !== 'complete'`.
     - `isCompleteMode = searchParams.get('mode') === 'complete' && Boolean(expense?.meta?.sport?.planning)`.
   - When `sportShown` is true, manage state for `locationId`, inline new-location fields (`locName`, `locAddress`, `locPhone`, `locMapUrl`), `courtSlots` (`{ courtName, timeRange }[]`), `bookingCode`, `totalDuration`, and `bookingImageDataUrl`.
   - When `isPlanningMode` is true:
     - Render the screenshot attachment / AI auto-fill control (showing `t('sport.extractFromImage')` only when `view.aiBookingExtract` is true).
     - Render the Location & Court Schedule grouped list (`bg-card rounded-xl border border-border`) and optional pre-filled `courtText` (`Tiền sân dự kiến`), hiding shuttlecocks, extra fees, and per-person VND share amounts.
     - Allow submitting with `amount: 0` and `planning: true` as long as `description.trim()` and `totalMaleSlots + totalFemaleSlots > 0` (and if location is selected/entered, `name` and `address` are non-empty).
   - When `isCompleteMode` is true:
     - Pre-fill `courtText` from `expense.meta.sport.court`, show shuttlecock and extra fee inputs, keep `location` / `courtSlots` / `bookingImageDataUrl` attached, set `planning: false` on submit, and save via `PATCH /trips/:id/expenses/:eid`.

- [ ] **Step 4: Run component tests, style-guard tests, and full typecheck**

Run: `npx vitest run libs/web/screens/src/__tests__/sport-planning-ui.test.tsx libs/web/screens/src/test/style-guard.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/web/ui/src/components/icons.tsx libs/web/screens/src/components/AppNav.tsx libs/web/screens/src/components/Screen.tsx libs/web/screens/src/screens/MemberTrip.tsx libs/web/screens/src/components/ExpenseRow.tsx libs/web/screens/src/lib/rowActions.ts libs/web/screens/src/components/SportBillTable.tsx libs/web/screens/src/components/ExpenseDetails.tsx libs/web/screens/src/screens/ExpenseForm.tsx libs/web/screens/src/__tests__/sport-planning-ui.test.tsx
git commit -m "feat(web): add sport planning form, details, 3-column table, and + menu (#83)"
```
