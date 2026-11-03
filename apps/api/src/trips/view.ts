import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Approval, PersonView, TripView } from '@cc/core';
import { computeBalances, findBank, findSimilarNames, maskAccountNumber } from '@cc/core';
import type { Db } from '../db/client';
import type { ResolvedActor } from '../access/actor';
import type { TripSnapshot } from './snapshot';
import { toLedger } from './snapshot';
import {
  bankDetails,
  membershipRequests,
  mergeProposals,
  participants,
  playerRatings,
  users,
} from '../db/schema';

export async function toTripView(
  db: Db,
  snapshot: TripSnapshot,
  actor: ResolvedActor,
): Promise<TripView> {
  const isAdmin = Boolean(actor.isAdmin) || actor.isOrganiser;
  const me: TripView['me'] = {
    kind: actor.kind,
    participantId: actor.participantId,
    participantPending: actor.participantPending,
    isOrganiser: actor.isOrganiser,
    isAdmin,
  };

  let myBalance: TripView['myBalance'] = null;
  if (
    actor.participantId !== null &&
    Object.prototype.hasOwnProperty.call(snapshot.balances, actor.participantId)
  ) {
    const pid = actor.participantId;
    const ledger = toLedger(snapshot);
    const roundBal = (val: number) =>
      snapshot.trip.roundTransfers ? (Math.abs(val) <= 500 ? 0 : Math.round(val / 1000) * 1000) : val;

    let now = snapshot.balances[pid] ?? 0;
    if (snapshot.trip.roundTransfers) {
      const owedToMe = snapshot.suggestions
        .filter((s) => s.toId === pid)
        .reduce((sum, s) => sum + s.amount, 0);
      const iOwe = snapshot.suggestions
        .filter((s) => s.fromId === pid)
        .reduce((sum, s) => sum + s.amount, 0);
      now = owedToMe - iOwe;
    }
    const beforePayments = roundBal(
      computeBalances(ledger.order, ledger.expenses, ledger.payments, {
        ignorePayments: true,
      })[pid] ?? 0,
    );
    const hasPendingExpense = ledger.expenses.some(
      (e) => e.status === 'pending' && e.createdById === pid,
    );
    const rawPending =
      actor.kind === 'guest' && hasPendingExpense
        ? (computeBalances(ledger.order, ledger.expenses, ledger.payments, {
            includePendingCreatedBy: pid,
          })[pid] ?? 0)
        : null;
    const ifPendingApproved = rawPending !== null ? roundBal(rawPending) : null;
    const waitingConfirm = snapshot.payments
      .filter((p) => p.status === 'says_paid' && p.fromId === pid)
      .reduce((sum, p) => sum + p.amountClaimed, 0);

    myBalance = {
      now,
      beforePayments,
      ifPendingApproved,
      waitingConfirm,
    };
  }

  let approvals: Approval[] = [];
  if (actor.kind === 'member') {
    const isGroupAdmin = isAdmin;

    const pendingExpenses = snapshot.expenses.filter((e) => {
      if (e.status !== 'pending') return false;
      if (isGroupAdmin) return true;
      if (actor.participantId === null) return false;
      return (
        e.payerId === actor.participantId ||
        e.shares.some((s) => s.participantId === actor.participantId)
      );
    });

    const expenseApprovals: Approval[] = pendingExpenses.map((e) => ({
      kind: 'expense',
      expenseId: e.id,
    }));

    const waitingPayments = snapshot.payments.filter(
      (p) => p.status === 'says_paid' && p.toId === actor.participantId,
    );
    const byExpense = new Map<string, string[]>();
    for (const p of waitingPayments) {
      if (p.expenseId) {
        const list = byExpense.get(p.expenseId) ?? [];
        list.push(p.id);
        byExpense.set(p.expenseId, list);
      }
    }
    // An expense with two or more reports to the actor (waiting or already confirmed) stays one grouped card while
    // anything still waits, so confirming one row doesn't turn the card into a single-payment one.
    const linkedToMe = new Map<string, number>();
    for (const p of snapshot.payments) {
      if (p.expenseId && p.toId === actor.participantId && (p.status === 'says_paid' || p.status === 'confirmed')) {
        linkedToMe.set(p.expenseId, (linkedToMe.get(p.expenseId) ?? 0) + 1);
      }
    }
    const emittedExpenses = new Set<string>();
    const paymentApprovals: Approval[] = [];
    for (const p of waitingPayments) {
      const group = p.expenseId ? byExpense.get(p.expenseId) : undefined;
      if (p.expenseId && group && (linkedToMe.get(p.expenseId) ?? 0) >= 2) {
        if (!emittedExpenses.has(p.expenseId)) {
          emittedExpenses.add(p.expenseId);
          paymentApprovals.push({
            kind: 'expense_payments',
            expenseId: p.expenseId,
            paymentIds: group,
          });
        }
      } else {
        paymentApprovals.push({
          kind: 'payment',
          paymentId: p.id,
        });
      }
    }

    const notArrivedApprovals: Approval[] = snapshot.payments
      .filter((p) => {
        if (p.status !== 'confirmed' || !p.notArrived) return false;
        if (isGroupAdmin) return true;
        return p.toId === actor.participantId;
      })
      .map((p) => ({
        kind: 'not_arrived',
        paymentId: p.id,
      }));

    let nameApprovals: Approval[] = [];
    let bankApprovals: Approval[] = [];
    let membershipApprovals: Approval[] = [];
    let proposalApprovals: Approval[] = [];

    if (isGroupAdmin) {
      const activePeople = snapshot.people
        .filter((p) => p.status === 'active')
        .map((p) => ({ id: p.id, name: p.name }));
      nameApprovals = snapshot.people
        .filter((p) => p.status === 'pending')
        .map((p) => ({
          kind: 'name',
          participantId: p.id,
          matches: findSimilarNames(p.name, activePeople),
        }));

      const pendingBankRows = await db
        .select({
          id: bankDetails.id,
          participantId: bankDetails.participantId,
          bin: bankDetails.bin,
          accountNumber: bankDetails.accountNumber,
          holderName: bankDetails.holderName,
        })
        .from(bankDetails)
        .innerJoin(participants, eq(bankDetails.participantId, participants.id))
        .where(
          and(
            eq(participants.tripId, actor.trip.id),
            eq(bankDetails.status, 'pending'),
          ),
        );
      bankApprovals = pendingBankRows.map((b) => ({
        kind: 'bank',
        bankId: b.id,
        participantId: b.participantId!,
        bankName: findBank(b.bin)?.shortName ?? b.bin,
        accountNumber: b.accountNumber,
        holderName: b.holderName,
      }));

      const pendingMembershipRows = await db
        .select({
          id: membershipRequests.id,
          participantId: membershipRequests.participantId,
          userName: users.name,
          userEmail: users.email,
        })
        .from(membershipRequests)
        .innerJoin(users, eq(membershipRequests.userId, users.id))
        .where(
          and(
            eq(membershipRequests.tripId, actor.trip.id),
            eq(membershipRequests.status, 'pending'),
          ),
        );
      membershipApprovals = pendingMembershipRows.map((r) => ({
        kind: 'membership',
        requestId: r.id,
        participantId: r.participantId,
        userName: r.userName,
        userEmail: r.userEmail,
      }));

      // Merge proposals still waiting for this group's admin side.
      const pendingProposalRows = await db
        .select({
          id: mergeProposals.id,
          guestPid: mergeProposals.guestPid,
          intoPid: mergeProposals.intoPid,
          targetUserName: sql<string | null>`(SELECT name FROM users WHERE id = ${mergeProposals.targetUserId})`,
          requestedByName: sql<string | null>`(SELECT name FROM users WHERE id = ${mergeProposals.requestedByUserId})`,
        })
        .from(mergeProposals)
        .where(
          and(
            eq(mergeProposals.tripId, actor.trip.id),
            eq(mergeProposals.status, 'pending'),
            eq(mergeProposals.needsAdmin, 1),
            isNull(mergeProposals.adminAcceptedAt),
          ),
        )
        .orderBy(mergeProposals.createdAt);
      proposalApprovals = pendingProposalRows.map((r) => ({
        kind: 'proposal',
        proposalId: r.id,
        guestPid: r.guestPid,
        intoPid: r.intoPid,
        targetUserName: r.targetUserName,
        requestedByName: r.requestedByName ?? '',
      }));
    }

    approvals = [
      ...expenseApprovals,
      ...nameApprovals,
      ...bankApprovals,
      ...paymentApprovals,
      ...notArrivedApprovals,
      ...membershipApprovals,
      ...proposalApprovals,
    ];
  }

  const people = await withGuestBankAccounts(db, snapshot, actor);

  const links: TripView['links'] =
    actor.kind === 'member'
      ? { group: actor.trip.groupToken, view: actor.trip.viewToken }
      : null;

  let ratings = snapshot.ratings ?? null;
  if (ratings !== null && actor.kind === 'member' && actor.participantId !== null) {
    const activeIds = new Set(snapshot.people.filter((p) => p.status === 'active').map((p) => p.id));
    const myRows = await db
      .select({
        targetParticipantId: playerRatings.targetParticipantId,
        stars: playerRatings.stars,
      })
      .from(playerRatings)
      .where(
        and(
          eq(playerRatings.tripId, actor.trip.id),
          eq(playerRatings.raterParticipantId, actor.participantId),
        ),
      );
    const myAllocations: Record<string, number> = {};
    for (const r of myRows) {
      if (activeIds.has(r.targetParticipantId) && r.stars > 0) {
        myAllocations[r.targetParticipantId] = r.stars;
      }
    }
    ratings = { ...ratings, myAllocations };
  }

  return {
    trip: snapshot.trip,
    me,
    people,
    balances: snapshot.balances,
    suggestions: snapshot.suggestions,
    expenses: snapshot.expenses,
    payments: snapshot.payments,
    fund: snapshot.fund,
    ratings,
    myBalance,
    approvals,
    links,
  };
}

/**
 * Adds each guest's masked bank account for the people allowed to see it: members see every guest's,
 * a guest sees only their own. The cached snapshot stays the same for everyone.
 */
async function withGuestBankAccounts(
  db: Db,
  snapshot: TripSnapshot,
  actor: ResolvedActor,
): Promise<PersonView[]> {
  const onlyMine = actor.kind === 'guest' && actor.participantId !== null;
  if (actor.kind !== 'member' && !onlyMine) {
    return snapshot.people;
  }

  const rows = await db
    .select({
      participantId: bankDetails.participantId,
      bin: bankDetails.bin,
      accountNumber: bankDetails.accountNumber,
      holderName: bankDetails.holderName,
      status: bankDetails.status,
    })
    .from(bankDetails)
    .innerJoin(participants, eq(bankDetails.participantId, participants.id))
    .where(
      and(
        eq(participants.tripId, actor.trip.id),
        isNull(participants.userId),
        inArray(bankDetails.status, ['approved', 'pending']),
        onlyMine ? eq(participants.id, actor.participantId!) : undefined,
      ),
    );

  const accounts = new Map<string, NonNullable<PersonView['bankAccount']>>();
  for (const row of rows) {
    if (!row.participantId || (accounts.has(row.participantId) && row.status !== 'approved')) continue;
    accounts.set(row.participantId, {
      bankName: findBank(row.bin)?.shortName ?? row.bin,
      accountNumberMasked: maskAccountNumber(row.accountNumber),
      holderName: row.holderName,
    });
  }

  return snapshot.people.map((p) => {
    const bankAccount = accounts.get(p.id);
    return bankAccount ? { ...p, bankAccount } : p;
  });
}
