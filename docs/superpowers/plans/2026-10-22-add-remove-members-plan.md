# Removing, Leaving, Rejoining & Joining Without Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins remove anyone but the organiser, members leave, people who left keep their history and balances under a `left` status, and signed-in users join or rejoin a group without approval.

**Architecture:** A fourth participant status `left` (no migration). Every existing `active` filter keeps excluding left people (access, My Trips, pickers, admin); the snapshot, payments and expense edits accept them on purpose. Removal logic lives in a new `participants/remove.ts`, join/rejoin in a new `participants/join.ts`; the web adds a Left section on People, Leave in Settings, Join/Rejoin on who-are-you, and a Left marker wherever money shows.

**Tech Stack:** TypeScript, Hono + Drizzle on Cloudflare D1 (Workers vitest pool), React 19 + TanStack Query + react-router, vitest + Testing Library (jsdom).

**Spec:** [docs/superpowers/specs/2026-10-22-add-remove-members-design.md](../specs/2026-10-22-add-remove-members-design.md)

## Global Constraints

- No migration: add `'left'` to the Drizzle enum of `participants.status` only.
- Every write goes through `commitTripWrite`; every new route calls `assertWritable` first.
- Permissions only through `can` / `ensure` from `packages/core/src/permissions.ts`.
- UI reuses tokens from `apps/web/src/styles/tokens.css`, `Pill` (tone `neutral` for Left), `ActionRow`, `ActionSheet`, `InlineError`, `SkeletonList`, `GenderToggle`, `Button`. No raw hex, no new colours, no new primitives, no Tailwind.
- Every new copy key goes in both `apps/web/src/i18n/en.ts` and `vi.ts`; each new Vietnamese line ends with `// REVIEW`.
- Harness (`~/.claude/harness/HARNESS.md`): Gemini may create new test files but never edits or deletes existing tests; steps marked **(Opus)** are done by the architect. Gemini never runs tests; the architect runs every verification step.

### Plan refinements of the spec (decided while planning)
1. `PickerView.account` is `{ name: string; needsGender: boolean } | null` instead of `{ name; gender }`: who-are-you does not know the group preset, so the server says whether a gender is still needed. Both new `PickerView` fields are optional (`?:`) so existing fixtures and older servers still type-check.
2. `people.useMerge` stays: `ApprovalsCard.tsx` still uses it. Only `People.tsx` stops mapping 409 to it.
3. `person_left`, `member_joined`, `member_rejoined` use the generic activity line (`activity.action.*`, e.g. "Chi left the group"); only `person_restored` gets a name line.
4. A new `JoinResponse` type in `api-types.ts` for `POST /join`.

## Review Focus

1. A member who left still has the group open (stale tab, cached My Trips) — the API must answer 403 without the link and "guest with no name" with it, never member data. → Task 2 test `a removed member loses member access`.
2. A removed guest's phone still points at the removed name — it must come back with no name, not as the left person. → Task 2 test `a removed guest's phone has no name any more`.
3. A double tap on Remove (or two admins at once) — the second call must be a clean 404, not a second `left` write or a 500. → Task 2 test `removing twice says not found`.
4. A member renames their account, then rejoins — they must get their old name back, not a second name. → Task 3 test `rejoin returns the same name even after the account is renamed`.
5. A left person settles up — they must drop out of suggested transfers while staying listed as Left. → Task 4 test `a left guest who pays up drops out of the suggestions`.

---

### Task 1: Core types and permissions

**Delegation:** Opus (under 40 lines).

**Files:**
- Modify: `packages/core/src/api-types.ts` (`ActivityAction`, `PersonView`, `PickerView`, new `JoinResponse`)
- Modify: `packages/core/src/permissions.ts`
- Test (new): `packages/core/test/permissions-roster.test.ts`

**Interfaces:**
- Produces:
  - `PersonView['status']: 'active' | 'pending' | 'left'`
  - `PickerView.account?: { name: string; needsGender: boolean } | null`; `PickerView.myLeftName?: { id: string; name: string } | null`
  - `interface JoinResponse { participantId: string; rejoined: boolean }`
  - `ActivityAction` adds `'person_left' | 'person_restored' | 'member_joined' | 'member_rejoined'`
  - `Action` adds `'leave' | 'restore_person'`; `ActionContext.targetIsAdmin?: boolean`

- [ ] **Step 1: Write the failing test** — `packages/core/test/permissions-roster.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { can, type Actor } from '../src/permissions';

const member = (id: string, isOrganiser = false, isAdmin = false): Actor => ({ kind: 'member', participantId: id, participantPending: false, isOrganiser, isAdmin });
const M = member('M');
const ADM = member('A', false, true);
const ORG = member('O', true, true);
const G: Actor = { kind: 'guest', participantId: 'G', participantPending: false, isOrganiser: false };
const V: Actor = { kind: 'viewer', participantId: null, participantPending: false, isOrganiser: false };

describe('remove_person', () => {
  it('an admin removes a non-admin', () => expect(can(ADM, 'remove_person', { targetIsAdmin: false })).toBe(true));
  it('an admin cannot remove another admin', () => expect(can(ADM, 'remove_person', { targetIsAdmin: true })).toBe(false));
  it('the organiser removes an admin', () => expect(can(ORG, 'remove_person', { targetIsAdmin: true })).toBe(true));
  it('members, guests and viewers cannot', () => {
    for (const a of [M, G, V]) expect(can(a, 'remove_person', { targetIsAdmin: false })).toBe(false);
  });
});

describe('leave', () => {
  it('members and admins can leave', () => { expect(can(M, 'leave')).toBe(true); expect(can(ADM, 'leave')).toBe(true); });
  it('the organiser, guests and viewers cannot', () => { for (const a of [ORG, G, V]) expect(can(a, 'leave')).toBe(false); });
});

describe('restore_person', () => {
  it('admins and the organiser bring people back', () => { expect(can(ADM, 'restore_person')).toBe(true); expect(can(ORG, 'restore_person')).toBe(true); });
  it('members, guests and viewers cannot', () => { for (const a of [M, G, V]) expect(can(a, 'restore_person')).toBe(false); });
});
```

- [ ] **Step 2: Run it** — `npm test -w @fsl/core -- permissions-roster` → FAIL (`leave` / `restore_person` return false; type errors are fine at runtime).

- [ ] **Step 3: Implement** the types above in `api-types.ts`, and in `can()`: `remove_person` → `isMember && isAdmin && (ctx.targetIsAdmin !== true || actor.isOrganiser)` (move it out of the shared admin-only `case` list); `leave` → `isMember && !actor.isOrganiser`; `restore_person` → joins the admin-only list.

- [ ] **Step 4: Run** `npm test -w @fsl/core` → all PASS (the existing `permissions.test.ts` rows still hold: no context means `targetIsAdmin` is undefined). Then `npm run typecheck -w @fsl/core` → no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api-types.ts packages/core/src/permissions.ts packages/core/test/permissions-roster.test.ts
git commit -m "feat(core): left status, leave and restore permissions, admin removal needs the organiser"
```

---

### Task 2: Remove, leave and bring back (API)

**Delegation:** Gemini small build (`AGY_ALLOW="apps/api/src/participants/remove.ts apps/api/src/participants/routes.ts apps/api/src/db/schema.ts apps/api/src/trips/snapshot.ts apps/api/test/roster-remove.test.ts"`). Step 6 is **(Opus)**.

**Files:**
- Create: `apps/api/src/participants/remove.ts`
- Modify: `apps/api/src/db/schema.ts` (participants status enum), `apps/api/src/participants/routes.ts` (`DELETE /trips/:id/people/:pid`, new `POST /trips/:id/leave`, new `POST /trips/:id/people/:pid/restore`), `apps/api/src/trips/snapshot.ts` (people query and `isMember`)
- Test (new): `apps/api/test/roster-remove.test.ts`
- Test (existing, Opus): `apps/api/test/participants.test.ts`

**Interfaces:**
- Consumes: Task 1 `can` actions `remove_person` (with `targetIsAdmin`), `leave`, `restore_person`; `ActivityAction` `person_left`, `person_restored`.
- Produces: `takeOutOfTrip(db: Db, tripId: string, participantId: string): Promise<{ queries: BatchItem<'sqlite'>[]; outcome: 'deleted' | 'left' }>` in `remove.ts` — callers commit `queries` with their own activity through `commitTripWrite`. Snapshot people now include `left`, with `isMember = userId !== null && status !== 'left'`.

- [ ] **Step 1: Write the failing tests** — `apps/api/test/roster-remove.test.ts`. Reuse the local helpers from `participants.test.ts` (`base`, `post`, `minh`, `view`), plus `del = (path, headers) => call(\`${base}${path}\`, { method: 'DELETE', headers })` and `status = (id) => env.DB.prepare('SELECT status, is_admin FROM participants WHERE id = ?').bind(id).first<{ status: string; is_admin: number }>()`. `beforeEach(async () => { await seedTrip(); await seedExpenses(); })`.

```ts
describe('removing people', () => {
  it('a guest with history becomes Left and keeps their balance', async () => {
    const before = await view(await minh());
    expect((await del(`/people/${PID.C}`, await minh())).status).toBe(204);
    const after = await view(await minh());
    expect(after.people.find((p) => p.id === PID.C)?.status).toBe('left');
    expect(after.balances[PID.C]).toBe(before.balances[PID.C]);
  });
  it('a name with no history is deleted', async () => {
    const { participantId } = await json<{ participantId: string }>(await post('/people', await minh(), { name: 'Giang' }));
    expect((await del(`/people/${participantId}`, await minh())).status).toBe(204);
    expect((await view(await minh())).people.some((p) => p.id === participantId)).toBe(false);
  });
  it('a removed member loses member access', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await del(`/people/${PID.A}`, await minh())).status).toBe(204);
    expect(await status(PID.A)).toEqual({ status: 'left', is_admin: 0 });
    const trips = await json<{ id: string }[]>(call('/api/trips', { headers: { Cookie: `sid=${anSid}` } }));
    expect(trips.some((t) => t.id === T.tripId)).toBe(false);
    expect((await call(base, { headers: { Cookie: `sid=${anSid}` } })).status).toBe(403);
    const g = await guestHeaders();
    const withLink = await view({ ...g, Cookie: `${g.Cookie}; sid=${anSid}` });
    expect(withLink.me).toMatchObject({ kind: 'guest', participantId: null });
  });
  it("a removed guest's phone has no name any more", async () => {
    const chi = await guestHeaders(PID.C);
    await del(`/people/${PID.C}`, await minh());
    expect((await view(chi)).me.participantId).toBeNull();
  });
  it('removing rejects their waiting claim and waiting bank details', async () => {
    await env.DB.prepare("INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES ('mr-1', ?, ?, 'u-x', 'pending', '2026-10-12T00:00:00.000Z')").bind(T.tripId, PID.C).run();
    await env.DB.prepare("INSERT INTO bank_details (id, participant_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-chi', ?, '970407', '0123456789', 'CHI', 'pending', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')").bind(PID.C).run();
    await del(`/people/${PID.C}`, await minh());
    expect((await env.DB.prepare("SELECT status FROM membership_requests WHERE id = 'mr-1'").first<{ status: string }>())?.status).toBe('rejected');
    expect((await env.DB.prepare("SELECT status FROM bank_details WHERE id = 'b-chi'").first<{ status: string }>())?.status).toBe('rejected');
  });
  it('only the organiser removes an admin', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await linkMember(PID.B, 'u-binh', 'Bình');
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id IN (?, ?)').bind(PID.A, PID.B).run();
    expect((await del(`/people/${PID.B}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
    expect((await del(`/people/${PID.B}`, await minh())).status).toBe(204);
  });
  it('nobody removes the organiser, and nobody removes themselves', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.A).run();
    expect((await del(`/people/${PID.M}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
    expect((await del(`/people/${PID.M}`, await minh())).status).toBe(403);
    expect((await del(`/people/${PID.A}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
  });
  it('a non-admin member cannot remove anyone', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await del(`/people/${PID.C}`, { Cookie: `sid=${anSid}` })).status).toBe(403);
  });
  it('removing twice says not found', async () => {
    await del(`/people/${PID.C}`, await minh());
    expect((await del(`/people/${PID.C}`, await minh())).status).toBe(404);
  });
});

describe('leaving', () => {
  it('a member leaves and the group leaves their list', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await post('/leave', { Cookie: `sid=${anSid}` })).status).toBe(204);
    expect((await status(PID.A))?.status).toBe('left');
    const trips = await json<{ id: string }[]>(call('/api/trips', { headers: { Cookie: `sid=${anSid}` } }));
    expect(trips).toEqual([]);
    const activity = await env.DB.prepare("SELECT details_json FROM activity WHERE trip_id = ? AND action = 'person_left'").bind(T.tripId).first<{ details_json: string }>();
    expect(JSON.parse(activity!.details_json)).toEqual({ name: 'An' });
  });
  it('the organiser and guests cannot leave', async () => {
    expect((await post('/leave', await minh())).status).toBe(403);
    expect((await post('/leave', await guestHeaders(PID.C))).status).toBe(403);
  });
  it('an archived group refuses leaving', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await env.DB.prepare("UPDATE trips SET archived_at = '2026-10-20T00:00:00.000Z' WHERE id = ?").bind(T.tripId).run();
    const res = await post('/leave', { Cookie: `sid=${anSid}` });
    expect(res.status).toBe(409);
  });
});

describe('bringing people back', () => {
  it('an admin brings a left member back as a member, not an admin', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await env.DB.prepare('UPDATE participants SET is_admin = 1 WHERE id = ?').bind(PID.A).run();
    await del(`/people/${PID.A}`, await minh());
    expect((await post(`/people/${PID.A}/restore`, await minh())).status).toBe(204);
    expect((await view({ Cookie: `sid=${anSid}` })).me).toMatchObject({ kind: 'member', isAdmin: false });
  });
  it('only a left name can be brought back, and only by an admin', async () => {
    expect((await post(`/people/${PID.C}/restore`, await minh())).status).toBe(404);
    await del(`/people/${PID.C}`, await minh());
    const anSid = await linkMember(PID.A, U.an, 'An');
    expect((await post(`/people/${PID.C}/restore`, { Cookie: `sid=${anSid}` })).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run them** — `npm test -w @fsl/api -- roster-remove` → FAIL.

- [ ] **Step 3: Implement `takeOutOfTrip` in `apps/api/src/participants/remove.ts`.** History = any `transactions` row in the trip with `payer_id`, `to_id` or `created_by_participant_id` = pid, or a `transaction_shares` row for pid on a transaction of the trip. No history → queries: delete participant, delete its `device_participants`; outcome `'deleted'`. History → queries: `participants` set `status 'left'`, `isAdmin 0`; delete its `device_participants`; `membership_requests` (participant_id = pid, status pending) → `rejected`; `bank_details` (participant_id = pid, status pending) → `rejected`; outcome `'left'`.

- [ ] **Step 4: Rework the routes in `apps/api/src/participants/routes.ts`.**
  - `DELETE /trips/:id/people/:pid`: load target where `status in (active, pending)` (else 404); `ensure(actor, 'remove_person', { targetIsAdmin: target.isAdmin === 1 })`; 403 if `target.userId === actor.trip.organiserUserId` or `pid === actor.participantId`; delete the old "Signed-in people cannot be removed" and "Use merge instead" branches; commit `takeOutOfTrip` queries with activity `person_removed { name }`.
  - `POST /trips/:id/leave`: `assertWritable`, `ensure(actor, 'leave')`, `takeOutOfTrip(db, tripId, actor.participantId!)`, activity `person_left { name }`, 204.
  - `POST /trips/:id/people/:pid/restore`: `assertWritable`, `ensure(actor, 'restore_person')`, target must be `left` (else 404), set `status 'active'`, activity `person_restored { name }`, 204.
  - `schema.ts`: status enum `['active', 'pending', 'merged', 'left']`.
  - `snapshot.ts`: people `inArray(status, ['active', 'pending', 'left'])`; `status: p.status as 'active' | 'pending' | 'left'`; `isMember: p.userId !== null && p.status !== 'left'`.

- [ ] **Step 5: Run** `npm test -w @fsl/api -- roster-remove` → PASS.

- [ ] **Step 6 (Opus): Update the two existing tests in `apps/api/test/participants.test.ts` whose rule changed.**
  - `removing a person: only when they have nothing` → rename to `removing a person: history makes them Left, nothing deletes them`; `busy` now expects 204 and Chi `status 'left'`.
  - `signed-in people (like the organiser) cannot be removed` → rename to `the organiser cannot be removed`; expect 403.

- [ ] **Step 7: Run** `npm test -w @fsl/api` → all PASS; `npm run typecheck -w @fsl/api` → no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/participants/remove.ts apps/api/src/participants/routes.ts apps/api/src/db/schema.ts apps/api/src/trips/snapshot.ts apps/api/test/roster-remove.test.ts apps/api/test/participants.test.ts
git commit -m "feat(api): remove anyone but the organiser, leave a group, bring people back"
```

---

### Task 3: Join, rejoin and the picker (API)

**Delegation:** Gemini small build (`AGY_ALLOW="apps/api/src/participants/join.ts apps/api/src/participants/routes.ts apps/api/src/app.ts apps/api/test/roster-join.test.ts"`).

**Files:**
- Create: `apps/api/src/participants/join.ts` (exports `joinRoutes(): Hono<AppBindings>`)
- Modify: `apps/api/src/app.ts` (mount `joinRoutes()` under `/api` like `participantRoutes()`), `apps/api/src/participants/routes.ts` (picker, membership approve guard)
- Test (new): `apps/api/test/roster-join.test.ts`

**Interfaces:**
- Consumes: Task 1 `JoinResponse`, `PickerView.account` / `myLeftName`, `ActivityAction` `member_joined` / `member_rejoined`; Task 2 `POST /leave` (used by tests).
- Produces: `POST /api/trips/:id/join` body `{ name?: string; gender?: 'M' | 'F'; confirmNew?: boolean }` → 201 `JoinResponse`. Picker fills `account` and `myLeftName`.

- [ ] **Step 1: Write the failing tests** — `apps/api/test/roster-join.test.ts`. Helpers as in Task 2, plus `signedInGuest = async (userId, name) => { const g = await guestHeaders(); return { ...g, Cookie: \`${g.Cookie}; sid=${await memberSid(userId, name)}\` }; }`. `beforeEach(async () => { await seedTrip(); await seedExpenses(); })`.

```ts
describe('joining', () => {
  it('a signed-in user joins with their account name and is a member straight away', async () => {
    const h = await signedInGuest('u-dung', 'Dũng');
    const res = await post('/join', h, {});
    expect(res.status).toBe(201);
    const { participantId, rejoined } = await json<JoinResponse>(res);
    expect(rejoined).toBe(false);
    const v = await view(h);
    expect(v.me).toMatchObject({ kind: 'member', participantId });
    expect(v.people.find((p) => p.id === participantId)).toMatchObject({ name: 'Dũng', status: 'active', isMember: true });
  });
  it('a look-alike name needs confirmNew', async () => {
    const h = await signedInGuest('u-binh2', 'Binh');
    expect((await post('/join', h, {})).status).toBe(422);
    expect((await post('/join', h, { confirmNew: true })).status).toBe(201);
  });
  it('a sport group needs a gender unless the account has one', async () => {
    await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
    const h = await signedInGuest('u-dung', 'Dũng');
    expect((await post('/join', h, {})).status).toBe(422);
    const { participantId } = await json<JoinResponse>(post('/join', h, { gender: 'F' }));
    expect((await view(h)).people.find((p) => p.id === participantId)?.gender).toBe('F');
    const em = await signedInGuest('u-em', 'Em');
    await env.DB.prepare("UPDATE users SET gender = 'M' WHERE id = 'u-em'").run();
    expect((await post('/join', em, {})).status).toBe(201);
  });
  it('signed out is 401, the view link is 403, a member is 409', async () => {
    expect((await post('/join', await guestHeaders(), {})).status).toBe(401);
    const viewOnly = await guestHeaders(undefined, T.viewToken);
    expect((await post('/join', { ...viewOnly, Cookie: `${viewOnly.Cookie}; sid=${await memberSid('u-dung', 'Dũng')}` }, {})).status).toBe(403);
    const g = await guestHeaders();
    expect((await post('/join', { ...g, Cookie: `${g.Cookie}; sid=${await memberSid(U.minh, 'Minh')}` }, {})).status).toBe(409);
  });
});

describe('rejoining', () => {
  it('rejoin returns the same name even after the account is renamed', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await post('/leave', { Cookie: `sid=${anSid}` });
    await env.DB.prepare("UPDATE users SET name = 'An Trần' WHERE id = ?").bind(U.an).run();
    const g = await guestHeaders();
    const res = await post('/join', { ...g, Cookie: `${g.Cookie}; sid=${anSid}` }, {});
    expect(await json(res)).toEqual({ participantId: PID.A, rejoined: true });
    const rows = await env.DB.prepare('SELECT name, status FROM participants WHERE user_id = ?').bind(U.an).all<{ name: string; status: string }>();
    expect(rows.results).toEqual([{ name: 'An', status: 'active' }]);
  });
});

describe('one name per user', () => {
  it('joining rejects the waiting claim, and an old claim cannot be approved later', async () => {
    const g = await guestHeaders(PID.C);
    const h = { ...g, Cookie: `${g.Cookie}; sid=${await memberSid('u-xuan', 'Xuân')}` };
    const { requestId } = await json<{ requestId: string }>(post('/membership', h, { participantId: PID.C }));
    expect((await post('/join', h, {})).status).toBe(201);
    expect((await env.DB.prepare('SELECT status FROM membership_requests WHERE id = ?').bind(requestId).first<{ status: string }>())?.status).toBe('rejected');
    await env.DB.prepare("INSERT INTO membership_requests (id, trip_id, participant_id, user_id, status, created_at) VALUES ('mr-late', ?, ?, 'u-xuan', 'pending', '2026-10-21T00:00:00.000Z')").bind(T.tripId, PID.B).run();
    const late = await post('/membership/mr-late/approve', await minh());
    expect(late.status).toBe(409);
  });
});

describe('the picker', () => {
  it('hides left names and offers the owner theirs', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await post('/leave', { Cookie: `sid=${anSid}` });
    const g = await guestHeaders();
    const p = await json<PickerView>(call(`${base}/people/picker`, { headers: { ...g, Cookie: `${g.Cookie}; sid=${anSid}` } }));
    expect(p.people.some((x) => x.id === PID.A)).toBe(false);
    expect(p.myLeftName).toEqual({ id: PID.A, name: 'An' });
    expect(p.account).toEqual({ name: 'An', needsGender: false });
  });
  it('says nothing about an account when signed out', async () => {
    const p = await json<PickerView>(call(`${base}/people/picker`, { headers: await guestHeaders() }));
    expect(p.account).toBeNull();
    expect(p.myLeftName).toBeNull();
  });
});
```

- [ ] **Step 2: Run them** — `npm test -w @fsl/api -- roster-join` → FAIL (404 on `/join`).

- [ ] **Step 3: Implement `joinRoutes()` in `apps/api/src/participants/join.ts`** following spec §4.1.4 in this order: no session → 401; `resolveActor`: `member` → 409 `ALREADY_HANDLED`, `viewer` → 403; `assertWritable`; user's `left` name in the trip → set `active`, activity `member_rejoined`, 201 `{ participantId, rejoined: true }`; else name = trimmed `body.name ?? user.name` (1–40, else 422), gender = `body.gender ?? user.gender` (sport preset and none → 422 `Gender required`), `findSimilarNames` over active+pending names without `confirmNew` → 422 `A similar name is already in this trip.`; insert participant (`userId`, `status 'active'`, next `sortOrder`, `createdByDevice`), upsert `device_participants`, activity `member_joined { name }`. Both branches add the update `membership_requests` (user_id = user.id, trip_id, status pending) → `rejected` to the same `commitTripWrite` batch.

- [ ] **Step 4: Picker and approve guard in `routes.ts`.** Picker: `account` = session user ? `{ name: user.name, needsGender: trip.preset === 'sport' && !user.gender }` : `null` (also `null` when the actor is a member); `myLeftName` = that user's `left` participant in the trip or `null`; `people` stays `active`/`pending`. `POST /membership/:rid/approve`: before linking, if `req.userId` already has an `active` participant in the trip → 409 `ALREADY_HANDLED`.

- [ ] **Step 5: Run** `npm test -w @fsl/api` → all PASS; `npm run typecheck -w @fsl/api` → no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/participants/join.ts apps/api/src/participants/routes.ts apps/api/src/app.ts apps/api/test/roster-join.test.ts
git commit -m "feat(api): join or rejoin a group without approval, one name per user"
```

---

### Task 4: Left people in payments and expense edits (API)

**Delegation:** Gemini small build (`AGY_ALLOW="apps/api/src/payments/routes.ts apps/api/src/expenses/routes.ts apps/api/test/roster-left-money.test.ts"`).

**Files:**
- Modify: `apps/api/src/payments/routes.ts` (`POST /trips/:id/payments` participant query, `receiverIsMember` / `payerIsMember`), `apps/api/src/expenses/routes.ts` (`validateExpenseInput` and its two callers)
- Test (new): `apps/api/test/roster-left-money.test.ts`

**Interfaces:**
- Consumes: Task 2 `DELETE /people/:pid` producing `left`.
- Produces: `validateExpenseInput(db: Db, tripId: string, body: unknown, allowedLeftIds: ReadonlySet<string>): Promise<ValidatedExpense>`.

- [ ] **Step 1: Write the failing tests** — `apps/api/test/roster-left-money.test.ts`. Reuse `send`, `equalAll`, `minh`, `view` from `expenses.test.ts` and `record` from `payments.test.ts` (copy them). `beforeEach`: `seedTrip`, `seedExpenses`, then Minh removes Chi (`DELETE /people/p-chi`).

```ts
it('a left guest who pays up drops out of the suggestions', async () => {
  const owed = -(await view(await minh())).balances[PID.C]!;
  const { body } = await record(await minh(), PID.C, PID.M, owed);
  expect(body?.status).toBe('confirmed');
  const v = await view(await minh());
  expect(v.suggestions.some((s) => s.fromId === PID.C || s.toId === PID.C)).toBe(false);
  expect(v.people.find((p) => p.id === PID.C)?.status).toBe('left');
});
it('a payment to a left member counts straight away', async () => {
  await linkMember(PID.B, 'u-binh', 'Bình');
  await call(`${base}/people/${PID.B}`, { method: 'DELETE', headers: await minh() });
  const { body } = await record(await guestHeaders(PID.A), PID.A, PID.B, 100000);
  expect(body?.status).toBe('confirmed');
});
it('a new expense cannot include a left person', async () => {
  expect((await send('POST', '/expenses', await minh(), equalAll(100000, PID.M))).status).toBe(422);
  expect((await send('POST', '/expenses', await minh(), { ...equalAll(100000, PID.C), entries: [{ participantId: PID.M, value: 1 }] })).status).toBe(422);
});
it('editing an expense keeps a left person already on it, but cannot put them back once taken off', async () => {
  expect((await send('PATCH', '/expenses/e-1', await minh(), equalAll(3300000, PID.M, 'Homestay Bloom · 2 nights'))).status).toBe(200);
  const without = { ...equalAll(3300000, PID.M, 'Homestay Bloom · 2 nights'), entries: [PID.M, PID.A, PID.B].map((participantId) => ({ participantId, value: 1 })) };
  expect((await send('PATCH', '/expenses/e-1', await minh(), without)).status).toBe(200);
  expect((await send('PATCH', '/expenses/e-1', await minh(), equalAll(3300000, PID.M, 'Homestay Bloom · 2 nights'))).status).toBe(422);
});
```

- [ ] **Step 2: Run them** — `npm test -w @fsl/api -- roster-left-money` → FAIL (payments 422 on a left person; PATCH 422 on the first edit).

- [ ] **Step 3: Implement.** Payments: participant query `inArray(status, ['active', 'left'])`; `toIsMember = toP.userId !== null && toP.status === 'active'`; `payerIsMember` likewise. Expenses: `validateExpenseInput` loads `active`/`pending`/`left`, and rejects a `left` payer or entry not in `allowedLeftIds` with the existing messages (`Invalid payer` / `Invalid participant in entries`). `POST` passes `new Set()`; `PATCH` passes the current head's `payerId` plus its `transaction_shares` participant ids. Rollback does not call `validateExpenseInput`, so it keeps restoring old versions with left people as the spec wants; leave it alone.

- [ ] **Step 4: Run** `npm test -w @fsl/api` → all PASS; `npm run typecheck -w @fsl/api` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/routes.ts apps/api/src/expenses/routes.ts apps/api/test/roster-left-money.test.ts
git commit -m "feat(api): pay and edit expenses with people who left"
```

---

### Task 5: People screen — Remove anyone, Left section, Bring back

**Delegation:** Gemini screen lane, one call (`AGY_ALLOW="apps/web/src/screens/People.tsx apps/web/src/screens/People.css apps/web/src/lib/rowActions.ts apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/screens/__tests__/people-left.test.tsx"`), screen spec from spec §4.3.1. Step 5 is **(Opus)**.

**Files:**
- Modify: `apps/web/src/screens/People.tsx`, `People.css`, `apps/web/src/lib/rowActions.ts`, `apps/web/src/i18n/en.ts`, `vi.ts`
- Test (new): `apps/web/src/screens/__tests__/people-left.test.tsx`
- Test (existing, Opus): `apps/web/src/screens/__tests__/admin.test.tsx`

**Interfaces:**
- Consumes: Task 1 `PersonView.status 'left'`; `can(actor, 'remove_person', { targetIsAdmin })`, `can(actor, 'restore_person')`; Task 2 `POST /people/:pid/restore`.
- Produces: `personActions(view, person, deps)` gains `deps.onRestore?: () => void`; copy keys (en): `people.removeConfirm` "Remove {name} from the group? Their past expenses and payments stay.", `people.cannotRemove` "You can't remove this person.", `people.leftTitle` "Left the group", `people.leftBadge` "Left", `people.leftOwes` "Owes {amount}", `people.leftOwed` "Is owed {amount}", `people.leftSettled` "Settled up", `people.restore` "Bring back". Task 8 and 9 reuse `people.leftBadge`.

- [ ] **Step 1: Write the failing tests** — `people-left.test.tsx`. Same setup as `admin.test.tsx` (`renderAt`, `mockApi`, `at('people')`, `rowOf`, an `anView()` copy). Fixture: `leftView()` = `tripView()` with Chi `{ status: 'left', isMember: false }`, Bình `{ status: 'left' }` and `balances[PIDS.B] = 0`.

```tsx
it('people who left sit in their own section with what they owe', async () => {
  mockApi({ 'GET /api/trips/t-1': leftView() });
  renderAt(<People />, at('people'));
  const section = await screen.findByRole('region', { name: 'Left the group' });
  expect(within(section).getByText(`Owes ${formatVnd(1245000)}`)).toBeInTheDocument();
  expect(within(section).getByText('Settled up')).toBeInTheDocument();
  expect(within(section).getAllByText('Left')).toHaveLength(2);
  expect(within(screen.getAllByRole('list')[0]!).queryByText('Chi')).toBeNull();
});
it('shows no Left section when nobody left', async () => {
  mockApi({ 'GET /api/trips/t-1': tripView() });
  renderAt(<People />, at('people'));
  await screen.findByRole('button', { name: /^Minh,/ });
  expect(screen.queryByText('Left the group')).toBeNull();
});
it('an admin brings someone back', async () => {
  const { calls } = mockApi({ 'GET /api/trips/t-1': leftView(), 'POST /api/trips/t-1/people/p-chi/restore': null });
  renderAt(<People />, at('people'));
  await userEvent.click(within(await rowInLeft('Chi')).getByRole('button', { name: 'Bring back' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/people/p-chi/restore')).toBe(true));
});
it('a non-admin member sees no Bring back', async () => { /* me = An, member, not admin → queryByRole('button', { name: 'Bring back' }) is null */ });
it('Remove is offered on a signed-in member and asks first', async () => {
  // anView() with Bình isMember: true; confirm → false then true; DELETE /api/trips/t-1/people/p-binh only after the second click
});
it('an admin gets no Remove on another admin; the organiser does', async () => {
  // Bình isMember + isAdmin: in anView() no Remove on Bình; in tripView() (me = Minh, organiser) Remove on Bình
});
it('a refused removal says so in plain words', async () => {
  // DELETE p-chi → 403 { error: { code: 'FORBIDDEN' } } (confirm → true) → within(rowOf('Chi')).findByText("You can't remove this person.")
});
```

`rowInLeft(name)` = the `li` inside the Left region whose text contains `name`. The Left section is a `<section aria-labelledby>` so it has role `region`.

- [ ] **Step 2: Run them** — `npm test -w @fsl/web -- people-left` → FAIL.

- [ ] **Step 3: Implement** per spec §4.3.1: main list = `view.people` without `left`; `personActions` Remove rule = `can(actor, 'remove_person', { targetIsAdmin: person.isAdmin === true }) && person.isOrganiser !== true && person.id !== view.me.participantId && person.status !== 'left'` (drop `!person.isMember`), and for a `left` person only `onRestore` when `can(actor, 'restore_person')`; `remove()` asks `window.confirm(t('people.removeConfirm', { name }))` first; `actionErrorText` maps 403 → `people.cannotRemove` and no longer maps 409; Left section as specified (balance line in the `fsl-people__bank` style with `formatVnd(Math.abs(b))`, positive balance = is owed; no swipe hint on Left rows). New keys in `en.ts` and `vi.ts` (`// REVIEW`).

- [ ] **Step 4: Run** `npm test -w @fsl/web -- people-left` → PASS.

- [ ] **Step 5 (Opus): Update the existing tests in `admin.test.tsx` whose rule changed.**
  - `no Remove for any signed-in member, only for guests` → `Remove is offered on a signed-in member who is not an admin`: Bình (member) now has Remove in the row and in the sheet.
  - `says "Use merge instead" when the API refuses to remove a guest who is in an expense` → `a refused removal explains itself and the next try clears it`: stub `window.confirm` → true, the DELETE answers 403, expect "You can't remove this person."; the rest of the test (next try clears it) stays.

- [ ] **Step 6: Run** `npm test -w @fsl/web` → all PASS; `npm run typecheck -w @fsl/web` → no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/screens/People.tsx apps/web/src/screens/People.css apps/web/src/lib/rowActions.ts apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/screens/__tests__/people-left.test.tsx apps/web/src/screens/__tests__/admin.test.tsx
git commit -m "feat(web): remove any member, a Left section and Bring back on People"
```

---

### Task 6: Settings — Leave group

**Delegation:** Gemini screen lane (`AGY_ALLOW="apps/web/src/screens/Settings.tsx apps/web/src/screens/Settings.css apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/screens/__tests__/settings-leave.test.tsx"`), screen spec from spec §4.3.3. Step 5 is **(Opus)**.

**Files:**
- Modify: `apps/web/src/screens/Settings.tsx` (and `Settings.css` only if the hint needs spacing), `en.ts`, `vi.ts`
- Test (new): `apps/web/src/screens/__tests__/settings-leave.test.tsx`
- Test (existing, Opus): `apps/web/src/screens/__tests__/admin.test.tsx`

**Interfaces:**
- Consumes: Task 1 `can(actor, 'leave')`; Task 2 `POST /trips/:id/leave`.
- Produces: copy keys `settings.leave` "Leave group", `settings.leaveHint` "The group leaves your list. Your past expenses stay, and you can rejoin from the group link.", `settings.leaveConfirm` "Leave {group}?".

- [ ] **Step 1: Write the failing tests** — `settings-leave.test.tsx` (setup as the `Settings` block in `admin.test.tsx`; `anView()` copy = An, member and admin, not organiser).

```tsx
it('a member who is not the organiser leaves after confirming, and lands on My Trips', async () => {
  const { calls } = mockApi({ 'GET /api/trips/t-1': anView(), 'POST /api/trips/t-1/leave': null });
  vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  renderAt(<Settings />, at('settings'));
  expect(await screen.findByText('The group leaves your list. Your past expenses stay, and you can rejoin from the group link.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Leave group' }));
  expect(calls.some((c) => c.path === '/api/trips/t-1/leave')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Leave group' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  expect(window.confirm).toHaveBeenCalledWith('Leave Đà Lạt · Oct 2026?');
});
it('the organiser has Archive and no Leave', async () => { /* tripView(): getByRole Archive group; queryByRole Leave group null */ });
it('an archived group offers no Leave', async () => { /* anView() with trip.archived true → no Leave group */ });
it('a failed leave shows the error with Try again', async () => {
  // POST leave → 500 { error: { code: 'INTERNAL' } }, confirm → true → findByRole('button', { name: 'Try again' })
});
```

- [ ] **Step 2: Run them** — `npm test -w @fsl/web -- settings-leave` → FAIL.

- [ ] **Step 3: Implement** per spec §4.3.3: the danger zone renders for the organiser (Archive, unchanged) or when `can(actorOf(view), 'leave')` (`actorOf` from `apps/web/src/lib/rowActions.ts`; Leave group + hint); confirm, `POST /leave`, `queryClient.resetQueries()`, `navigate('/')`; errors in `InlineError` with `onRetry`; archived → existing notice, no Leave.

- [ ] **Step 4: Run** `npm test -w @fsl/web -- settings-leave` → PASS.

- [ ] **Step 5 (Opus): Update `only the organiser can archive` in `admin.test.tsx`** — An now sees "Danger zone" with "Leave group"; keep the assertions that she sees no "Archive group" and no archive hint. Rename to `only the organiser can archive; other members can leave`.

- [ ] **Step 6: Run** `npm test -w @fsl/web` → all PASS; `npm run typecheck -w @fsl/web` → no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/screens/Settings.tsx apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/screens/__tests__/settings-leave.test.tsx apps/web/src/screens/__tests__/admin.test.tsx
git commit -m "feat(web): leave a group from Settings"
```

(Add `Settings.css` to `git add` if it changed.)

---

### Task 7: Who-are-you — Join and Rejoin

**Delegation:** Gemini screen lane (`AGY_ALLOW="apps/web/src/screens/WhoAreYou.tsx apps/web/src/screens/WhoAreYou.css apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/screens/__tests__/who-join.test.tsx"`), screen spec from spec §4.3.2.

**Files:**
- Modify: `apps/web/src/screens/WhoAreYou.tsx`, `WhoAreYou.css`, `en.ts`, `vi.ts`
- Test (new): `apps/web/src/screens/__tests__/who-join.test.tsx`

**Interfaces:**
- Consumes: Task 1 `PickerView.account`, `PickerView.myLeftName`, `JoinResponse`; Task 3 `POST /join`; existing `POST /people/check-name` → `{ matches: { id: string; name: string; reason: MatchReason }[] }`, `POST /people/pick`.
- Produces: copy keys `who.joinAs` "Not on the list? Join as {name}", `who.rejoinAs` "Rejoin as {name}", `who.rejoinHint` "You left this group · your past expenses are still here". Reuses existing `who.similar`, `who.yesIm`, `who.noAddMe`.

- [ ] **Step 1: Write the failing tests** — `who-join.test.tsx` (route as in `join.test.tsx`: `{ route: '/t/t-1/who', path: '/t/:tripId/who' }`). `signedIn(overrides)` = `picker({ myPick: null, account: { name: 'Dũng', needsGender: false }, myLeftName: null, people: picker().people.map((p) => ({ ...p, lastUsedHere: false })), ...overrides })`.

```tsx
it('signed-out guests see no Join or Rejoin', async () => {
  mockApi({ 'GET /api/trips/t-1/people/picker': picker() });
  renderAt(<WhoAreYou />, route);
  await screen.findByRole('radiogroup');
  expect(screen.queryByText(/Join as/)).toBeNull();
  expect(screen.queryByText(/Rejoin as/)).toBeNull();
});
it('a signed-in user not on the list joins with their account name', async () => {
  const { calls } = mockApi({
    'GET /api/trips/t-1/people/picker': signedIn(),
    'POST /api/trips/t-1/people/check-name': { matches: [] },
    'POST /api/trips/t-1/join': { participantId: 'p-dung', rejoined: false },
  });
  renderAt(<WhoAreYou />, route);
  await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Dũng' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  expect(calls.find((c) => c.path === '/api/trips/t-1/people/check-name')?.body).toEqual({ name: 'Dũng' });
  expect(calls.find((c) => c.path === '/api/trips/t-1/join')?.body).toEqual({});
});
it('a look-alike name asks first; "Yes" picks that name and asks to become a member', async () => {
  const { calls } = mockApi({
    'GET /api/trips/t-1/people/picker': signedIn({ account: { name: 'Binh', needsGender: false } }),
    'POST /api/trips/t-1/people/check-name': { matches: [{ id: PIDS.B, name: 'Bình', reason: 'same' }] },
    'POST /api/trips/t-1/people/pick': null,
  });
  renderAt(<WhoAreYou />, route);
  await userEvent.click(await screen.findByRole('button', { name: 'Not on the list? Join as Binh' }));
  expect(await screen.findByText('"Binh" looks like "Bình", who\'s already in this trip.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: "Yes, I'm Bình" }));
  await waitFor(() => expect(calls.find((c) => c.path === '/api/trips/t-1/people/pick')?.body).toEqual({ participantId: PIDS.B }));
  expect(calls.some((c) => c.path === '/api/trips/t-1/join')).toBe(false);
});
it('"No, add me" joins as someone new', async () => {
  // same mocks + 'POST /api/trips/t-1/join' → click "No, add me" → join body { confirmNew: true }
});
it('asks for a gender first when the group needs one', async () => {
  // account { name: 'Dũng', needsGender: true }: after tapping the Join row, the join control is disabled until
  // the 'Gender for Dũng' toggle is clicked once (→ M); join body is { gender: 'M' }
});
it('offers Rejoin first, preselected', async () => {
  const { calls } = mockApi({
    'GET /api/trips/t-1/people/picker': signedIn({ account: { name: 'An', needsGender: false }, myLeftName: { id: PIDS.A, name: 'An' }, people: picker().people.filter((p) => p.id !== PIDS.A) }),
    'POST /api/trips/t-1/join': { participantId: PIDS.A, rejoined: true },
  });
  renderAt(<WhoAreYou />, route);
  expect(await screen.findByText('You left this group · your past expenses are still here')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Rejoin as An' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  expect(calls.some((c) => c.path === '/api/trips/t-1/people/check-name')).toBe(false);
});
it('a failed join shows the error in the bottom bar', async () => {
  // check-name { matches: [] }, join → 422 { error: { code: 'VALIDATION', message: 'Gender required' } } → findByRole('alert') has 'Gender required'
});
```

- [ ] **Step 2: Run them** — `npm test -w @fsl/web -- who-join` → FAIL.

- [ ] **Step 3: Implement** per spec §4.3.2. Rejoin row: a radio row at the top of the radiogroup, preselected when `myLeftName` is set; the bottom button reads `who.rejoinAs` and posts `/join` with no body. Join row: a quiet `button` under the list; tapping it runs check-name → (no matches) join `{}` or `{ gender }`; with matches, the bottom area swaps to the `who.similar` text and the two buttons. "Yes" posts pick then navigates to `/t/{id}?becomeMember=1`. On join success invalidate `['trip', tripId]`, `['picker', tripId]`, `['me']` and `navigate(target)`. Busy: the active button shows `loading` and is disabled.

- [ ] **Step 4: Run** `npm test -w @fsl/web` → all PASS (existing `join.test.tsx` included); `npm run typecheck -w @fsl/web` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/WhoAreYou.tsx apps/web/src/screens/WhoAreYou.css apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/screens/__tests__/who-join.test.tsx
git commit -m "feat(web): join or rejoin a group from who-are-you"
```

---

### Task 8: Expense form — keep left people out of new expenses

**Delegation:** Gemini screen lane (`AGY_ALLOW="apps/web/src/screens/ExpenseForm.tsx apps/web/src/screens/__tests__/expense-form-left.test.tsx"`).

**Files:**
- Modify: `apps/web/src/screens/ExpenseForm.tsx`
- Test (new): `apps/web/src/screens/__tests__/expense-form-left.test.tsx`

**Interfaces:**
- Consumes: Task 1 `PersonView.status 'left'`; Task 5 copy key `people.leftBadge`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests** — setup and `rowOf` as in `expense-form.test.tsx` (`newRoute`, `editRoute`). Fixture: `tripView()` with Chi `{ status: 'left', isMember: false }`.

```tsx
it('a new expense does not offer people who left', async () => {
  mockApi({ 'GET /api/trips/t-1': chiLeft() });
  renderAt(<ExpenseForm />, newRoute);
  await userEvent.type(await screen.findByLabelText('Amount'), '180.000');
  for (const name of ['Minh', 'An', 'Bình']) expect(within(rowOf(name)).getByText('60.000₫')).toBeInTheDocument();
  expect(screen.queryByText('Chi')).toBeNull();
});
it('editing an expense keeps a left person already on it, marked Left', async () => {
  // editRoute on e-1 (all four people): Chi's split row is there with the 'Left' pill
});
```

- [ ] **Step 2: Run them** — `npm test -w @fsl/web -- expense-form-left` → FAIL.

- [ ] **Step 3: Implement** one memoised `formPeople` (spec §4.3.4) and use it in place of every `view.people` in the form (payer picker, split rows, sport slots, default inputs, caption count); a `left` person's row carries `<Pill tone="neutral">{t('people.leftBadge')}</Pill>`.

- [ ] **Step 4: Run** `npm test -w @fsl/web` → all PASS; `npm run typecheck -w @fsl/web` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/ExpenseForm.tsx apps/web/src/screens/__tests__/expense-form-left.test.tsx
git commit -m "feat(web): people who left stay off new expenses"
```

---

### Task 9: Left marker in transfers and details, activity lines

**Delegation:** Gemini small build (`AGY_ALLOW="apps/web/src/components/YourTransfers.tsx apps/web/src/components/ExpenseDetails.tsx apps/web/src/lib/activityText.ts apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/components/__tests__/left-marker.test.tsx"`).

**Files:**
- Modify: `apps/web/src/components/YourTransfers.tsx`, `apps/web/src/components/ExpenseDetails.tsx`, `apps/web/src/lib/activityText.ts`, `en.ts`, `vi.ts`
- Test (new): `apps/web/src/components/__tests__/left-marker.test.tsx`

**Interfaces:**
- Consumes: Task 1 `ActivityAction` additions; Task 5 `people.leftBadge`.
- Produces: copy keys `activity.personRestored` "{actor} brought back {name}", `activity.action.person_left` "left the group", `activity.action.person_restored` "brought someone back", `activity.action.member_joined` "joined", `activity.action.member_rejoined` "rejoined".

- [ ] **Step 1: Write the failing tests** — `left-marker.test.tsx`.

```tsx
it('activity says who left, joined, rejoined and was brought back', () => {
  const item = (action: ActivityAction, details = {}): ActivityItem => ({ id: 'a', action, actorName: 'Chi', deviceShort: null, details, createdAt: '2026-10-22T08:00:00.000Z' });
  expect(activityLine(item('person_left'), undefined, t)).toBe('Chi left the group');
  expect(activityLine(item('member_joined'), undefined, t)).toBe('Chi joined');
  expect(activityLine(item('member_rejoined'), undefined, t)).toBe('Chi rejoined');
  expect(activityLine(item('person_restored', { name: 'An' }), undefined, t)).toBe('Chi brought back An');
});
it('a transfer with someone who left marks them Left', async () => {
  // render YourTransfers (as your-transfers.test.tsx does) with tripView() where Chi is 'left' and owes Minh:
  // the row naming Chi also shows the text 'Left'
});
it('expense details mark a left person Left', async () => {
  // render ExpenseDetails for e-1 (as details.test.tsx does) with Chi 'left': Chi's share line shows 'Left'
});
```

(`t` is `import { t } from '../../i18n'`; `activityLine` from `../../lib/activityText`. Copy render setups from `your-transfers.test.tsx` and `screens/__tests__/details.test.tsx`.)

- [ ] **Step 2: Run them** — `npm test -w @fsl/web -- left-marker` → FAIL.

- [ ] **Step 3: Implement.** `activityText.ts`: add `person_restored` to `NAME_LINE` and its `case`; the other three fall through to the generic line via their `activity.action.*` keys. `YourTransfers.tsx` / `ExpenseDetails.tsx`: next to a `left` person's name, `<Pill tone="neutral">{t('people.leftBadge')}</Pill>`.

- [ ] **Step 4: Run** `npm test -w @fsl/web` → all PASS; `npm run typecheck -w @fsl/web` → no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/YourTransfers.tsx apps/web/src/components/ExpenseDetails.tsx apps/web/src/lib/activityText.ts apps/web/src/i18n/en.ts apps/web/src/i18n/vi.ts apps/web/src/components/__tests__/left-marker.test.tsx
git commit -m "feat(web): mark people who left in transfers and details, and say so in activity"
```

---

### Task 10: Whole-branch verification and visual review

**Delegation:** Opus.

- [ ] **Step 1: Run** `npm run typecheck` → no errors in any workspace.
- [ ] **Step 2: Run** `npm test` → every core, API and web suite passes.
- [ ] **Step 3: Run** `npm run e2e` → the golden path still passes at 375×812.
- [ ] **Step 4: Visual review** (ui-ux-design-companion §5.4): with the dev server (`npm run dev`) and a seeded local trip, screenshot People (with a Left section), Settings (Leave), who-are-you (Join, look-alike prompt, Rejoin) at 375px and 1280px; score Layout, Visual Hierarchy, Usability; anything below 4 goes back to the owning task.
- [ ] **Step 5: Commit** any fixes from the review with a message naming the screen.
