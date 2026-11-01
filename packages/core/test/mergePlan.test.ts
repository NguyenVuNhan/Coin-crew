import { describe, it, expect } from 'vitest';
import { planMerge, type MergePlace, type MergeSide, type MergePlanContext } from '../src/mergePlan';

const place = (tripId: string, participantId: string, over: Partial<MergePlace> = {}): MergePlace => ({
  tripId,
  tripName: tripId === 't1' ? 'Đà Lạt' : `Trip ${tripId}`,
  kind: 'group',
  participantId,
  archived: false,
  ...over,
});

const guest = (pid: string, places: MergePlace[]): MergeSide => ({ key: `p:${pid}`, userId: null, places });
const user = (uid: string, places: MergePlace[]): MergeSide => ({ key: `u:${uid}`, userId: uid, places });

const ctx = (over: Partial<MergePlanContext> = {}): MergePlanContext => ({
  adminTripIds: new Set(),
  pendingClaims: new Map(),
  pendingProposals: new Set(),
  ...over,
});

describe('planMerge', () => {
  it('two guests in different groups → link only', () => {
    const plan = planMerge(guest('pA', [place('t1', 'pA')]), guest('pB', [place('t2', 'pB')]), ctx({ adminTripIds: new Set(['t1', 't2']) }));
    expect(plan).toEqual({ ok: true, tag: 'link', steps: [{ kind: 'link' }] });
  });

  it('two guests in the same group, caller admin → merge B into A', () => {
    const plan = planMerge(guest('pA', [place('t1', 'pA')]), guest('pB', [place('t1', 'pB')]), ctx({ adminTripIds: new Set(['t1']) }));
    expect(plan).toEqual({
      ok: true,
      tag: 'merge',
      steps: [{ kind: 'merge', tripId: 't1', tripName: 'Đà Lạt', fromPid: 'pB', intoPid: 'pA' }],
    });
  });

  it('same group, caller not admin → ask_admin', () => {
    const plan = planMerge(guest('pA', [place('t1', 'pA')]), guest('pB', [place('t1', 'pB')]), ctx());
    expect(plan).toEqual({
      ok: true,
      tag: 'ask_admin',
      steps: [{ kind: 'ask_admin', tripId: 't1', tripName: 'Đà Lạt', fromPid: 'pB', intoPid: 'pA' }],
    });
  });

  it('guests sharing one group plus another group → link first, then merge', () => {
    const plan = planMerge(
      guest('pA', [place('t1', 'pA')]),
      guest('pB', [place('t1', 'pB'), place('t2', 'pB2')]),
      ctx({ adminTripIds: new Set(['t1']) }),
    );
    expect(plan).toEqual({
      ok: true,
      tag: 'merge',
      steps: [{ kind: 'link' }, { kind: 'merge', tripId: 't1', tripName: 'Đà Lạt', fromPid: 'pB', intoPid: 'pA' }],
    });
  });

  it('guest in group + signed-in user → ask_user needing the admin unless caller is admin', () => {
    const a = guest('pA', [place('t1', 'pA')]);
    const b = user('U', [place('t1', 'pU')]);
    expect(planMerge(a, b, ctx())).toEqual({
      ok: true,
      tag: 'ask_user',
      steps: [{ kind: 'ask_user', tripId: 't1', tripName: 'Đà Lạt', tripKind: 'group', guestPid: 'pA', userId: 'U', needsAdmin: true }],
    });
    expect(planMerge(a, b, ctx({ adminTripIds: new Set(['t1']) }))).toEqual({
      ok: true,
      tag: 'ask_user',
      steps: [{ kind: 'ask_user', tripId: 't1', tripName: 'Đà Lạt', tripKind: 'group', guestPid: 'pA', userId: 'U', needsAdmin: false }],
    });
  });

  it('ledger guest + signed-in user → ask_user without admin', () => {
    const plan = planMerge(guest('pA', [place('d1', 'pA', { kind: 'direct', tripName: 'Quick' })]), user('U', []), ctx());
    expect(plan).toEqual({
      ok: true,
      tag: 'ask_user',
      steps: [{ kind: 'ask_user', tripId: 'd1', tripName: 'Quick', tripKind: 'direct', guestPid: 'pA', userId: 'U', needsAdmin: false }],
    });
  });

  it('signed-in user on the page + guest picked → ask_user for the guest side', () => {
    const plan = planMerge(user('U', [place('t2', 'pU')]), guest('pB', [place('t1', 'pB')]), ctx());
    expect(plan).toEqual({
      ok: true,
      tag: 'ask_user',
      steps: [{ kind: 'ask_user', tripId: 't1', tripName: 'Đà Lạt', tripKind: 'group', guestPid: 'pB', userId: 'U', needsAdmin: true }],
    });
  });

  it('both signed in → blocked', () => {
    const plan = planMerge(user('U1', [place('t1', 'p1')]), user('U2', [place('t1', 'p2')]), ctx());
    expect(plan).toEqual({ ok: false, block: { reason: 'both_signed_in' } });
  });

  it('pending claim by the target user blocks with byTarget', () => {
    const plan = planMerge(guest('pA', [place('t1', 'pA')]), user('U', []), ctx({ pendingClaims: new Map([['pA', 'U']]) }));
    expect(plan).toEqual({ ok: false, block: { reason: 'claim_pending', tripName: 'Đà Lạt', byTarget: true } });
  });

  it('pending claim by someone else blocks with byTarget false', () => {
    const plan = planMerge(guest('pA', [place('t1', 'pA')]), user('U', []), ctx({ pendingClaims: new Map([['pA', 'X']]) }));
    expect(plan).toEqual({ ok: false, block: { reason: 'claim_pending', tripName: 'Đà Lạt', byTarget: false } });
  });

  it('pending proposal blocks', () => {
    const plan = planMerge(guest('pA', [place('t1', 'pA')]), user('U', []), ctx({ pendingProposals: new Set(['pA']) }));
    expect(plan).toEqual({ ok: false, block: { reason: 'request_pending', tripName: 'Đà Lạt' } });
  });

  it('pending claim or proposal on a shared group pid blocks a guest merge', () => {
    const a = guest('pA', [place('t1', 'pA')]);
    const b = guest('pB', [place('t1', 'pB')]);
    expect(planMerge(a, b, ctx({ pendingClaims: new Map([['pB', 'X']]) }))).toEqual({
      ok: false,
      block: { reason: 'request_pending', tripName: 'Đà Lạt' },
    });
    expect(planMerge(a, b, ctx({ pendingProposals: new Set(['pA']) }))).toEqual({
      ok: false,
      block: { reason: 'request_pending', tripName: 'Đà Lạt' },
    });
  });

  it('archived shared group falls back to link', () => {
    const plan = planMerge(
      guest('pA', [place('t1', 'pA', { archived: true })]),
      guest('pB', [place('t1', 'pB', { archived: true })]),
      ctx({ adminTripIds: new Set(['t1']) }),
    );
    expect(plan).toEqual({ ok: true, tag: 'link', steps: [{ kind: 'link' }] });
  });

  it('archived places of the guest are left out of ask_user steps', () => {
    const plan = planMerge(
      guest('pA', [place('t1', 'pA', { archived: true }), place('t2', 'pA2')]),
      user('U', []),
      ctx({ pendingClaims: new Map([['pA', 'U']]) }),
    );
    expect(plan).toEqual({
      ok: true,
      tag: 'ask_user',
      steps: [{ kind: 'ask_user', tripId: 't2', tripName: 'Trip t2', tripKind: 'group', guestPid: 'pA2', userId: 'U', needsAdmin: true }],
    });
  });
});
