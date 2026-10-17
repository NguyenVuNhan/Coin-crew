import { describe, it, expect, beforeEach } from 'vitest';
import type { TripView } from '@fsl/core';
import {
  call,
  json,
  seedTrip,
  memberSid,
  guestHeaders,
  linkMember,
  T,
  U,
  PID,
} from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const patch = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const view = async (headers: Record<string, string>) =>
  json<TripView>(call(base, { headers }));

beforeEach(seedTrip);

describe('admin permissions and guest roster lock', () => {
  it('allows an involved non-admin member to approve/reject a guest expense, but forbids an uninvolved non-admin member', async () => {
    const minhHeaders = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const anSid = await linkMember(PID.A, U.an, 'An');
    const anHeaders = { Cookie: `sid=${anSid}` };

    const binhGuest = await guestHeaders(PID.B);

    // 1. Guest Bình adds expense paid by Bình split between Bình and Chi (An is NOT involved)
    const res1 = await post('/expenses', binhGuest, {
      description: 'Snacks',
      amount: 100000,
      spentOn: '2026-10-15',
      payerId: PID.B,
      mode: 'equal',
      entries: [
        { participantId: PID.B, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });
    expect(res1.status).toBe(201);
    const { expenseId: e1 } = await json<{ expenseId: string }>(res1);

    // An (non-admin, uninvolved) tries to approve -> 403 FORBIDDEN
    const anApproveRes1 = await post(`/expenses/${e1}/approve`, anHeaders);
    expect(anApproveRes1.status).toBe(403);

    // An (non-admin, uninvolved) tries to reject -> 403 FORBIDDEN
    const anRejectRes1 = await post(`/expenses/${e1}/reject`, anHeaders, {
      reason: 'Nope',
    });
    expect(anRejectRes1.status).toBe(403);

    // 2. Guest Bình adds expense paid by Bình split between Bình and An (An IS involved as share participant)
    const res2 = await post('/expenses', binhGuest, {
      description: 'Coffee',
      amount: 60000,
      spentOn: '2026-10-15',
      payerId: PID.B,
      mode: 'equal',
      entries: [
        { participantId: PID.B, value: 1 },
        { participantId: PID.A, value: 1 },
      ],
    });
    expect(res2.status).toBe(201);
    const { expenseId: e2 } = await json<{ expenseId: string }>(res2);

    // An (non-admin, involved) approves -> 204
    const anApproveRes2 = await post(`/expenses/${e2}/approve`, anHeaders);
    expect(anApproveRes2.status).toBe(204);

    // 3. Guest Chi adds expense paid by An split between Chi and Bình (An is payer, so involved)
    const chiGuest = await guestHeaders(PID.C);
    const res3 = await post('/expenses', chiGuest, {
      description: 'Taxi',
      amount: 150000,
      spentOn: '2026-10-15',
      payerId: PID.A,
      mode: 'equal',
      entries: [
        { participantId: PID.C, value: 1 },
        { participantId: PID.B, value: 1 },
      ],
    });
    expect(res3.status).toBe(201);
    const { expenseId: e3 } = await json<{ expenseId: string }>(res3);

    // An (non-admin, involved as payer) rejects -> 204
    const anRejectRes3 = await post(`/expenses/${e3}/reject`, anHeaders, {
      reason: 'Did not pay for this',
    });
    expect(anRejectRes3.status).toBe(204);

    // Organiser Minh (admin) can approve any pending expense even if uninvolved
    const res4 = await post('/expenses', binhGuest, {
      description: 'Ice cream',
      amount: 40000,
      spentOn: '2026-10-15',
      payerId: PID.B,
      mode: 'equal',
      entries: [
        { participantId: PID.B, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });
    const { expenseId: e4 } = await json<{ expenseId: string }>(res4);
    const minhApproveRes = await post(`/expenses/${e4}/approve`, minhHeaders);
    expect(minhApproveRes.status).toBe(204);
  });

  it('forbids guests and non-admin members from adding a new name via POST /trips/:id/people and restricts guest bank/membership approval to Group Admins', async () => {
    const minhHeaders = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const anSid = await linkMember(PID.A, U.an, 'An');
    const anHeaders = { Cookie: `sid=${anSid}` };
    const guestChi = await guestHeaders(PID.C);

    // 1. Guest POST /people -> 403 FORBIDDEN
    const guestAddRes = await post('/people', guestChi, { name: 'Dũng' });
    expect(guestAddRes.status).toBe(403);

    // 2. Non-admin member An POST /people -> 403 FORBIDDEN
    const anAddRes = await post('/people', anHeaders, { name: 'Dũng' });
    expect(anAddRes.status).toBe(403);

    // 3. Organiser Minh (Group Admin) POST /people -> 201
    const minhAddRes = await post('/people', minhHeaders, { name: 'Dũng' });
    expect(minhAddRes.status).toBe(201);

    // 4. Guest Chi submits bank details
    const putRes = await call(`${base}/bank`, {
      method: 'PUT',
      headers: { ...guestChi, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bin: '970407',
        accountNumber: '190399998888',
        holderName: 'TRAN THI CHI',
        consent: true,
      }),
    });
    expect(putRes.status).toBe(204);

    const minhV = await view(minhHeaders);
    const bankApproval = minhV.approvals.find((a) => a.kind === 'bank') as { bankId: string } | undefined;
    expect(bankApproval).toBeDefined();
    const bankId = bankApproval!.bankId;

    // Non-admin member An tries to approve bank -> 403 FORBIDDEN
    const anApproveBank = await post(`/bank/${bankId}/approve`, anHeaders);
    expect(anApproveBank.status).toBe(403);

    // Organiser Minh promotes An to Admin -> 204
    const promoteRes = await post(`/people/${PID.A}/admin`, minhHeaders);
    expect(promoteRes.status).toBe(204);

    // Now An is Admin and can approve bank -> 204
    const anApproveBankAfterPromote = await post(`/bank/${bankId}/approve`, anHeaders);
    expect(anApproveBankAfterPromote.status).toBe(204);
  });

  it('enforces promote_admin restrictions: target must exist, be active and have userId', async () => {
    const minhHeaders = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const anSid = await linkMember(PID.A, U.an, 'An');
    const anHeaders = { Cookie: `sid=${anSid}` };

    // Non-admin An cannot promote
    const res1 = await post(`/people/${PID.A}/admin`, anHeaders);
    expect(res1.status).toBe(403);

    // Target not found
    const resNotFound = await post('/people/non-existent/admin', minhHeaders);
    expect(resNotFound.status).toBe(404);

    // Target is a guest (userId === null) -> 422 VALIDATION
    const resGuest = await post(`/people/${PID.B}/admin`, minhHeaders);
    expect(resGuest.status).toBe(422);

    // Promote An -> 204
    const resOk = await post(`/people/${PID.A}/admin`, minhHeaders);
    expect(resOk.status).toBe(204);

    // View verifies isAdmin on people and me
    const vMinh = await view(minhHeaders);
    const pMinh = vMinh.people.find((p) => p.id === PID.M);
    const pAn = vMinh.people.find((p) => p.id === PID.A);
    expect(pMinh?.isAdmin).toBe(true);
    expect(pAn?.isAdmin).toBe(true);

    const vAn = await view(anHeaders);
    expect(vAn.me.isAdmin).toBe(true);
  });

  it('enforces PATCH /people/:pid permissions', async () => {
    const minhHeaders = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const anSid = await linkMember(PID.A, U.an, 'An');
    const anHeaders = { Cookie: `sid=${anSid}` };
    const guestChi = await guestHeaders(PID.C);

    // Guest cannot rename -> 403
    const guestRename = await patch(`/people/${PID.C}`, guestChi, { name: 'Chi Chi' });
    expect(guestRename.status).toBe(403);

    // Guest can update own gender -> 204
    const guestGender = await patch(`/people/${PID.C}`, guestChi, { gender: 'F' });
    expect(guestGender.status).toBe(204);

    // Guest cannot update someone else's gender -> 403
    const guestOtherGender = await patch(`/people/${PID.B}`, guestChi, { gender: 'M' });
    expect(guestOtherGender.status).toBe(403);

    // Non-admin member An cannot update someone else -> 403
    const anOtherUpdate = await patch(`/people/${PID.B}`, anHeaders, { name: 'Bình Bò' });
    expect(anOtherUpdate.status).toBe(403);

    // Non-admin member An can update themselves -> 204
    const anSelfUpdate = await patch(`/people/${PID.A}`, anHeaders, { name: 'An Nguyễn' });
    expect(anSelfUpdate.status).toBe(204);

    // Group admin Minh can update any participant -> 204
    const minhUpdateBinh = await patch(`/people/${PID.B}`, minhHeaders, { name: 'Bình Pro' });
    expect(minhUpdateBinh.status).toBe(204);
  });

  it('filters approvals: non-admin member only sees involved expenses, admins see all', async () => {
    const minhHeaders = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const anSid = await linkMember(PID.A, U.an, 'An');
    const anHeaders = { Cookie: `sid=${anSid}` };
    const guestChi = await guestHeaders(PID.C);
    const guestBinh = await guestHeaders(PID.B);

    // Expense 1: uninvolved for An (Bình pays, split Bình + Chi)
    await post('/expenses', guestBinh, {
      description: 'E1',
      amount: 100000,
      spentOn: '2026-10-15',
      payerId: PID.B,
      mode: 'equal',
      entries: [
        { participantId: PID.B, value: 1 },
        { participantId: PID.C, value: 1 },
      ],
    });

    // Expense 2: involved for An (Chi pays, split Chi + An)
    await post('/expenses', guestChi, {
      description: 'E2',
      amount: 200000,
      spentOn: '2026-10-15',
      payerId: PID.C,
      mode: 'equal',
      entries: [
        { participantId: PID.C, value: 1 },
        { participantId: PID.A, value: 1 },
      ],
    });

    // Bank submission from Chi
    await call(`${base}/bank`, {
      method: 'PUT',
      headers: { ...guestChi, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bin: '970407',
        accountNumber: '190399998888',
        holderName: 'TRAN THI CHI',
        consent: true,
      }),
    });

    // Non-admin An view:
    const vAn = await view(anHeaders);
    // Should only have expense approvals where An is involved (E2), and NO bank approvals
    expect(vAn.approvals.filter((a) => a.kind === 'bank')).toHaveLength(0);
    expect(vAn.approvals.filter((a) => a.kind === 'expense')).toHaveLength(1);

    // Admin Minh view:
    const vMinh = await view(minhHeaders);
    // Should have both expense approvals and the bank approval
    expect(vMinh.approvals.filter((a) => a.kind === 'expense')).toHaveLength(2);
    expect(vMinh.approvals.filter((a) => a.kind === 'bank')).toHaveLength(1);
  });

  it('allows membership claim with optional name and syncs claiming user onto participant when approved by Group Admin', async () => {
    const minhHeaders = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    const anSid = await linkMember(PID.A, U.an, 'An');
    const anHeaders = { Cookie: `sid=${anSid}` };

    const chiSid = await memberSid('u-chi-new', 'Chi Original');
    // Pick Chi first on device so actor is guest Chi
    const chiGuest = await guestHeaders(PID.C);
    // Submit membership request with new name
    const claimRes = await call(`${base}/membership`, {
      method: 'POST',
      headers: {
        Cookie: `sid=${chiSid}; ${chiGuest.Cookie}`,
        'X-Link-Token': T.groupToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ participantId: PID.C, name: 'Chi Tran Google' }),
    });
    expect(claimRes.status).toBe(201);
    const { requestId } = await json<{ requestId: string }>(claimRes);

    // Non-admin An tries to approve -> 403
    const anApproveRes = await post(`/membership/${requestId}/approve`, anHeaders);
    expect(anApproveRes.status).toBe(403);

    // Admin Minh approves -> 204
    const minhApproveRes = await post(`/membership/${requestId}/approve`, minhHeaders);
    expect(minhApproveRes.status).toBe(204);

    // Verify participant is now linked to user and name is updated
    const v = await view(minhHeaders);
    const pChi = v.people.find((p) => p.id === PID.C);
    expect(pChi?.isMember).toBe(true);
    expect(pChi?.name).toBe('Chi Tran Google');
  });
});
